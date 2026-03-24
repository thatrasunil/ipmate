require('dotenv').config();
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccount.json');
if (fs.existsSync(path.resolve(serviceAccountPath))) {
  const serviceAccount = require(path.resolve(serviceAccountPath));
  // Ensure private key newlines are handled correctly
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  console.warn(`WARNING: Firebase Service Account file not found at ${serviceAccountPath}. Auto-deletion will be disabled.`);
}

const db = admin.apps.length ? admin.firestore() : null;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_NAME_LENGTH = 24;
const MAX_ROOM_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 300;

// Serve Firebase config to client via endpoint
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  });
});

app.use(express.static('public'));

const rooms = new Map();
const games = {};

// Load game modules
const gamesDir = path.join(__dirname, 'games');
if (fs.existsSync(gamesDir)) {
  fs.readdirSync(gamesDir).forEach(file => {
    if (file.endsWith('.js')) {
      const gameName = file.replace('.js', '');
      games[gameName] = require(path.join(gamesDir, file));
    }
  });
}

function createRoom(gameType = 'tic-tac-toe') {
  const gameModule = games[gameType] || games['tic-tac-toe'];
  return {
    participants: new Map(),
    gameType,
    game: gameModule.createInitialState(),
  };
}

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validateUsername(value) {
  const username = sanitizeText(value);
  if (!username) return { error: 'Username is required.' };
  if (username.length > MAX_NAME_LENGTH) return { error: `Username must be ${MAX_NAME_LENGTH} characters or fewer.` };
  return { value: username };
}

function validateRoomId(value) {
  const roomId = sanitizeText(value);
  if (!roomId) return { error: 'Room ID is required.' };
  if (roomId.length > MAX_ROOM_LENGTH) return { error: `Room ID must be ${MAX_ROOM_LENGTH} characters or fewer.` };
  if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) return { error: 'Room ID can only contain letters, numbers, hyphens, and underscores.' };
  return { value: roomId };
}

function validateMessage(value) {
  const text = sanitizeText(value);
  if (!text) return { error: 'Message cannot be empty.' };
  if (text.length > MAX_MESSAGE_LENGTH) return { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` };
  return { value: text };
}

function createParticipantId() {
  return crypto.randomUUID();
}

function getParticipantList(room) {
  return Array.from(room.participants.values()).map((participant) => ({
    participantId: participant.participantId,
    username: participant.username,
    symbol: participant.symbol,
  }));
}

function getRoomState(room, selfSocketId) {
  const self = room.participants.get(selfSocketId);
  return {
    roomId: self ? self.roomId : null,
    gameType: room.gameType,
    availableGames: Object.keys(games),
    participants: getParticipantList(room),
    me: self ? {
      participantId: self.participantId,
      username: self.username,
      symbol: self.symbol,
    } : null,
    game: room.game,
  };
}

function emitRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('game-update', { state: room.game, type: room.gameType });
  io.to(roomId).emit('participants-update', getParticipantList(room));
}

function findRoomIdBySocketId(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.participants.has(socketId)) return roomId;
  }
  return null;
}

function removeParticipant(socket, roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;

  const participant = room.participants.get(socket.id);
  if (!participant) return;

  room.participants.delete(socket.id);
  socket.leave(roomId);
  
  // Vanish messages logic: Notify clients to fade out messages from this user
  io.to(roomId).emit('vanish-messages', { participantId: participant.participantId });

  socket.to(roomId).emit('participant-left', {
    participantId: participant.participantId,
    username: participant.username,
    reason,
  });

  if (room.participants.size === 0) {
    rooms.delete(roomId);
    
    // Auto-Deletion: Delete messages from Firestore when room is empty
    if (db) {
      db.collection('messages')
        .where('roomId', '==', roomId)
        .get()
        .then((snapshot) => {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          return batch.commit();
        })
        .then(() => console.log(`Auto-deleted messages for room: ${roomId}`))
        .catch((err) => console.error(`Error auto-deleting messages for room ${roomId}:`, err));
    }
    return;
  }

  emitRoomState(roomId);
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ username, roomId }, callback = () => {}) => {
    const validatedUsername = validateUsername(username);
    const validatedRoomId = validateRoomId(roomId);

    if (validatedUsername.error || validatedRoomId.error) {
      callback({ error: validatedUsername.error || validatedRoomId.error });
      return;
    }

    let room = rooms.get(validatedRoomId.value);
    if (!room) {
      room = createRoom();
      rooms.set(validatedRoomId.value, room);
    }

    if (room.participants.size >= 2) {
      callback({ error: 'Room is full.' });
      return;
    }

    const symbolMap = {
      'tic-tac-toe': ['X', 'O'],
      'connect-four': ['R', 'Y'],
      'checkers': ['r', 'b'],
      'othello': ['black', 'white'],
      'chess': ['W', 'B'],
      'rock-paper-scissors': ['P1', 'P2'],
      'battleship': ['P1', 'P2'],
      'hangman': ['P1', 'P2'],
      'memory-match': ['P1', 'P2'],
      'dots-and-boxes': ['P1', 'P2']
    };
    const symbols = symbolMap[room.gameType] || ['P1', 'P2'];
    const symbol = room.participants.size === 0 ? symbols[0] : symbols[1];

    const participant = {
      socketId: socket.id,
      roomId: validatedRoomId.value,
      participantId: createParticipantId(),
      username: validatedUsername.value,
      symbol,
    };

    room.participants.set(socket.id, participant);
    socket.join(validatedRoomId.value);
    socket.data.roomId = validatedRoomId.value;
    socket.data.participantId = participant.participantId;

    callback({
      success: true,
      roomState: getRoomState(room, socket.id),
    });

    socket.to(validatedRoomId.value).emit('participant-joined', {
      participantId: participant.participantId,
      username: participant.username,
      symbol: participant.symbol,
    });

    emitRoomState(validatedRoomId.value);
  });

  socket.on('select-game', ({ gameType }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !games[gameType]) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.gameType = gameType;
    room.game = games[gameType].createInitialState();
    
    // Re-assign symbols based on new game
    const symbolMap = {
      'tic-tac-toe': ['X', 'O'],
      'connect-four': ['R', 'Y'],
      'checkers': ['r', 'b'],
      'othello': ['black', 'white'],
      'chess': ['W', 'B'],
      'rock-paper-scissors': ['P1', 'P2'],
      'battleship': ['P1', 'P2'],
      'hangman': ['P1', 'P2'],
      'memory-match': ['P1', 'P2'],
      'dots-and-boxes': ['P1', 'P2']
    };
    const symbols = symbolMap[gameType] || ['P1', 'P2'];
    
    let idx = 0;
    room.participants.forEach(p => {
      if (idx < symbols.length) {
        p.symbol = symbols[idx++];
      }
    });

    io.to(roomId).emit('game-changed', { 
      gameType, 
      state: room.game,
      participants: getParticipantList(room)
    });
  });

  socket.on('send-message', ({ text }) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (!participant) return;

    const validatedText = validateMessage(text);
    if (validatedText.error) return;

    io.to(roomId).emit('new-message', {
      participantId: participant.participantId,
      username: participant.username,
      text: validatedText.value,
      timestamp: Date.now(),
    });
  });

  socket.on('user-typing', () => {
    const roomId = socket.data.roomId;
    const participant = rooms.get(roomId)?.participants.get(socket.id);
    if (!roomId || !participant) return;
    socket.to(roomId).emit('user-typing', participant.username);
  });

  socket.on('user-stopped-typing', () => {
    const roomId = socket.data.roomId;
    const participant = rooms.get(roomId)?.participants.get(socket.id);
    if (!roomId || !participant) return;
    socket.to(roomId).emit('user-stopped-typing', participant.username);
  });

  socket.on('game-move', (move) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    const gameModule = games[room.gameType];

    if (participant && gameModule && gameModule.isValidMove(room.game, participant, move)) {
      room.game = gameModule.applyMove(room.game, participant, move);
      io.to(roomId).emit('game-update', { state: room.game, type: room.gameType });
    }
  });

  socket.on('reset-game', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;

    const gameModule = games[room.gameType];
    room.game = gameModule.createInitialState();

    io.to(roomId).emit('game-update', { state: room.game, type: room.gameType });
    io.to(roomId).emit('game-reset');
  });

  socket.on('leave-room', () => {
    removeParticipant(socket, socket.data.roomId, 'left');
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId || findRoomIdBySocketId(socket.id);
    if (roomId) removeParticipant(socket, roomId, 'disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

