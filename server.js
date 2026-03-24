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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!db) {
  console.error('FATAL: Firebase Firestore is not initialized. Please check your environment variables.');
}

const games = {};
const gamesDir = path.join(__dirname, 'games');
if (fs.existsSync(gamesDir)) {
  fs.readdirSync(gamesDir).forEach(file => {
    if (file.endsWith('.js')) {
      const gameName = file.replace('.js', '');
      games[gameName] = require(path.join(gamesDir, file));
    }
  });
}

const PORT = process.env.PORT || 3000;
const MAX_NAME_LENGTH = 24;
const MAX_ROOM_LENGTH = 24;

// Validation Helpers
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

// API Endpoints
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

app.post('/api/join', async (req, res) => {
  const { username, roomId } = req.body;
  const vUser = validateUsername(username);
  const vRoom = validateRoomId(roomId);

  if (vUser.error || vRoom.error) {
    return res.status(400).json({ error: vUser.error || vRoom.error });
  }

  const roomRef = db.collection('rooms').doc(vRoom.value);
  const participantsRef = roomRef.collection('participants');

  try {
    const roomSnap = await roomRef.get();
    let roomData = roomSnap.data();

    // Create room if it doesn't exist
    if (!roomSnap.exists) {
      const gameType = 'tic-tac-toe';
      roomData = {
        roomId: vRoom.value,
        gameType,
        gameState: games[gameType].createInitialState(),
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      };
      await roomRef.set(roomData);
    }

    const participantsSnap = await participantsRef.get();
    if (participantsSnap.size >= 2) {
      return res.status(400).json({ error: 'Room is full.' });
    }

    const docId = crypto.randomUUID();
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
    const symbols = symbolMap[roomData.gameType] || ['P1', 'P2'];
    const symbol = participantsSnap.size === 0 ? symbols[0] : symbols[1];

    const participant = {
      participantId: docId,
      username: vUser.value,
      symbol,
      isTyping: false,
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    };

    await participantsRef.doc(docId).set(participant);

    res.json({
      success: true,
      participantId: docId,
      username: vUser.value,
      symbol,
      roomId: vRoom.value,
      gameType: roomData.gameType,
      availableGames: Object.keys(games)
    });
  } catch (err) {
    console.error('Error in /api/join:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/move', async (req, res) => {
  const { roomId, participantId, move } = req.body;
  if (!roomId || !participantId) return res.status(400).json({ error: 'Missing required fields.' });

  const roomRef = db.collection('rooms').doc(roomId);
  const partRef = roomRef.collection('participants').doc(participantId);

  try {
    const [roomSnap, partSnap] = await Promise.all([roomRef.get(), partRef.get()]);
    if (!roomSnap.exists || !partSnap.exists) {
      return res.status(404).json({ error: 'Room or participant not found.' });
    }

    const roomData = roomSnap.data();
    const participant = partSnap.data();
    const gameModule = games[roomData.gameType];

    if (gameModule && gameModule.isValidMove(roomData.gameState, participant, move)) {
      const nextState = gameModule.applyMove(roomData.gameState, participant, move);
      await roomRef.update({
        gameState: nextState,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid move.' });
    }
  } catch (err) {
    console.error('Error in /api/move:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/select-game', async (req, res) => {
  const { roomId, gameType } = req.body;
  if (!roomId || !gameType || !games[gameType]) return res.status(400).json({ error: 'Invalid game type or room.' });

  const roomRef = db.collection('rooms').doc(roomId);
  const partsRef = roomRef.collection('participants');

  try {
    const participantsSnap = await partsRef.get();
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
    
    // Update participant symbols for new game in a batch
    const batch = db.batch();
    participantsSnap.docs.forEach((doc, idx) => {
      if (idx < symbols.length) {
        batch.update(doc.ref, { symbol: symbols[idx] });
      }
    });

    batch.update(roomRef, {
      gameType,
      gameState: games[gameType].createInitialState(),
      lastUpdate: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/select-game:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/reset-game', async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'Room ID required.' });

  const roomRef = db.collection('rooms').doc(roomId);
  try {
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) return res.status(404).json({ error: 'Room not found.' });

    const roomData = roomSnap.data();
    await roomRef.update({
      gameState: games[roomData.gameType].createInitialState(),
      lastUpdate: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/reset-game:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/typing', async (req, res) => {
  const { roomId, participantId, isTyping } = req.body;
  if (!roomId || !participantId) return res.status(400).json({ error: 'Missing fields.' });

  try {
    await db.collection('rooms').doc(roomId)
      .collection('participants').doc(participantId)
      .update({ isTyping: !!isTyping });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update typing state.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

