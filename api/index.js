require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '../serviceAccount.json');

if (!admin.apps.length) {
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
  } else if (fs.existsSync(path.resolve(serviceAccountPath))) {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
}

const db = admin.apps.length ? admin.firestore() : null;

if (!db) {
  console.error('FATAL: Firebase Firestore is not initialized.');
  if (!process.env.FIREBASE_PROJECT_ID) console.error('MISSING: FIREBASE_PROJECT_ID');
  if (!process.env.FIREBASE_CLIENT_EMAIL) console.error('MISSING: FIREBASE_CLIENT_EMAIL');
  if (!process.env.FIREBASE_PRIVATE_KEY) console.error('MISSING: FIREBASE_PRIVATE_KEY');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Detailed error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`ERROR in ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'Internal server error.', message: err.message });
  });
};

// Static game modules for Vercel NFT tracing
const games = {
  'tic-tac-toe': require('../games/tic-tac-toe'),
  'connect-four': require('../games/connect-four'),
  'checkers': require('../games/checkers'),
  'othello': require('../games/othello'),
  'chess': require('../games/chess'),
  'rock-paper-scissors': require('../games/rock-paper-scissors'),
  'battleship': require('../games/battleship'),
  'hangman': require('../games/hangman'),
  'memory-match': require('../games/memory-match'),
  'dots-and-boxes': require('../games/dots-and-boxes'),
  '2048': require('../games/2048'),
  'reaction': require('../games/reaction'),
  'aim-trainer': require('../games/aim-trainer'),
  'coin-flip': require('../games/coin-flip')
};

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

app.post('/api/join', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
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
    let isStale = (participantsSnap.size === 0);
    
    if (!isStale) {
      // Check if all existing participants are "dead" (no heartbeat for 2 mins)
      const now = Date.now();
      const activeThreshold = 2 * 60 * 1000;
      let anyActive = false;
      
      participantsSnap.forEach(doc => {
        const p = doc.data();
        const lastSeen = p.lastSeen?.toMillis ? p.lastSeen.toMillis() : (p.lastSeen || 0);
        if (now - lastSeen < activeThreshold) anyActive = true;
      });
      
      if (!anyActive) isStale = true;
    }

    if (isStale) {
      console.log(`[CLEANUP] Room ${vRoom.value} is stale. Resetting...`);
      const batch = db.batch();
      
      // Delete old participants
      participantsSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete messages
      const msgsSnap = await roomRef.collection('messages').get();
      msgsSnap.forEach(doc => batch.delete(doc.ref));
      
      // Reset game state to default (1D array compatible)
      const gameType = 'tic-tac-toe';
      batch.set(roomRef, {
        roomId: vRoom.value,
        gameType,
        gameState: games[gameType].createInitialState(),
        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: false });
      
      await batch.commit();
      
      // Refetch room data after reset
      roomData = (await roomRef.get()).data();
    } else if (participantsSnap.size >= 2) {
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
      'dots-and-boxes': ['P1', 'P2'],
      '2048': ['P1', 'P2'],
      'reaction': ['P1', 'P2'],
      'aim-trainer': ['P1', 'P2'],
      'coin-flip': ['P1', 'P2']
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
}));

app.post('/api/move', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
  const { roomId, participantId, move } = req.body;
  console.log(`[MOVE] room:${roomId} part:${participantId} move:`, move);
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
      console.warn(`[MOVE_REJECTED] Room:${roomId} Participant:${participantId} Symbols:${participant.symbol}/${roomData.gameState.turn} Move:`, JSON.stringify(move));
      res.status(400).json({ error: 'Invalid move.' });
    }
  } catch (err) {
    console.error('Error in /api/move:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}));

app.post('/api/heartbeat', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
  const { roomId, participantId } = req.body;
  if (!roomId || !participantId) return res.status(400).json({ error: 'Missing fields.' });

  await db.collection('rooms').doc(roomId)
    .collection('participants').doc(participantId)
    .update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() });

  res.json({ success: true });
}));

app.post('/api/select-game', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
  const { roomId, gameType } = req.body;
  console.log(`[SELECT-GAME] room:${roomId} type:${gameType}`);
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
      'dots-and-boxes': ['P1', 'P2'],
      '2048': ['P1', 'P2'],
      'reaction': ['P1', 'P2'],
      'aim-trainer': ['P1', 'P2'],
      'coin-flip': ['P1', 'P2']
    };
    const symbols = symbolMap[gameType] || ['P1', 'P2'];
    
    const batch = db.batch();
    participantsSnap.docs.forEach((doc, idx) => {
      if (idx < symbols.length) {
        batch.update(doc.ref, { symbol: symbols[idx] });
      }
    });

    batch.set(roomRef, {
      gameType,
      gameState: games[gameType].createInitialState(),
      lastUpdate: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Clear messages for new game
    const msgsSnap = await roomRef.collection('messages').get();
    msgsSnap.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    console.error('FATAL Error in /api/select-game:', err);
    res.status(500).json({ error: 'Internal server error.', details: err.message });
  }
}));

app.post('/api/reset-game', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
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
}));

app.post('/api/typing', asyncHandler(async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not initialized.' });
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
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

module.exports = app;
