const joinContainer = document.getElementById('join-container');
const appContainer = document.getElementById('app-container');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('roomId');

// Initialize Firebase
let db = null;
async function initFirebase() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (config.apiKey && typeof firebase !== 'undefined') {
      firebase.initializeApp(config);
      db = firebase.firestore();
      console.log('Firebase initialized');
      
      // After Firebase is ready, check for a persisted session
      checkPersistedSession();
    }
  } catch (e) {
    console.error('Failed to load Firebase config:', e);
  }
}

function checkPersistedSession() {
  const saved = localStorage.getItem('mate-session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      // Valid session must have these
      if (session.roomId && session.participantId) {
        enterApp(session, true); // true = silent rejoin
      }
    } catch (e) {
      localStorage.removeItem('mate-session');
    }
  }
}
initFirebase();

// Debug input functionality
usernameInput.addEventListener('input', () => {
  console.log('Username input:', usernameInput.value);
});

roomIdInput.addEventListener('input', () => {
  console.log('Room ID input:', roomIdInput.value);
});

// Ensure inputs are focusable (standard behavior is best for mobile keyboard)
document.querySelectorAll('.input-group').forEach(group => {
  group.addEventListener('click', () => {
    const input = group.querySelector('input');
    if (input) input.focus();
  });
});
const joinButton = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const roomTitle = document.getElementById('room-title');
const meLabel = document.getElementById('me-label');
const participantsList = document.getElementById('participants-list');
const connectionStatus = document.getElementById('connection-status');
const copyRoomButton = document.getElementById('copy-room-btn');
const messagesContainer = document.getElementById('messages');
const chatCount = document.getElementById('chat-count');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-btn');
const chatError = document.getElementById('chat-error');
const leaveButton = document.getElementById('leave-btn');
const board = document.getElementById('board');
const turnIndicator = document.getElementById('turn-indicator');
const resetButton = document.getElementById('reset-game');
const gameSelector = document.getElementById('game-selector');
const toast = document.getElementById('toast');
const typingIndicator = document.getElementById('typing-indicator');
const soundToggle = document.getElementById('sound-toggle');
const gameStatusLabel = document.getElementById('game-status-label');
const gameStatusPill = document.getElementById('game-status');
const playerMeName = document.getElementById('player-me-name');
const playerOpName = document.getElementById('player-op-name');
const playerMeSymbol = document.getElementById('player-me-symbol');
const playerOpSymbol = document.getElementById('player-op-symbol');
const playerMeAvatar = document.getElementById('player-me-avatar');
const playerOpAvatar = document.getElementById('player-op-avatar');
const emojiToggle = document.getElementById('emoji-toggle');
const typingText = document.getElementById('typing-text');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const instructionsText = document.getElementById('instructions-text');

let socket = null;
let currentRoomId = '';
let currentUsername = '';
let myParticipantId = null;
let mySymbol = null;
let messages = [];
let participants = [];
let gameState = null;
let gameType = 'tic-tac-toe';
let availableGames = [];
let listenersBound = false;
let toastTimer = null;
let typingTimeout = null;
let activeTypingUsers = new Set();
let soundEnabled = true;

// Selection state for board games (Chess, Checkers)
let selectedPiece = null;

// E2EE Helpers
const ENCRYPTION_SALT = new TextEncoder().encode('ipmate-v1-salt');

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: ENCRYPTION_SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptMessage(text, password) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptMessage(cipherText, password) {
  try {
    // If it doesn't look like base64 or is too short, return as is (for legacy/system messages)
    if (!cipherText || cipherText.length < 16) return cipherText;
    
    const key = await deriveKey(password);
    const combined = new Uint8Array(atob(cipherText).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Fallback for non-encrypted legacy messages
    return cipherText;
  }
}

// Mobile View State
let activeView = 'game';
let unreadCount = 0;

function haptic(ms = 15) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

function switchMobileView(viewName) {
  activeView = viewName;

  document.querySelectorAll('.view-container').forEach(el => {
    el.classList.remove('view-active');
  });

  const targetView = document.querySelector(`.${viewName}-card`);
  if (targetView) targetView.classList.add('view-active');

  // Update nav active state
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const targetBtn = document.querySelector(`[data-view="${viewName}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  // Reset unread if chat opened
  if (viewName === 'chat') {
    unreadCount = 0;
    updateBadge();
    // Scroll to bottom when opening chat
    setTimeout(() => {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }
}

function getWinnerName(symbol) {
  if (!symbol) return null;
  const winner = participants.find(p => p.symbol === symbol);
  return winner ? `${winner.username} (${symbol})` : symbol;
}

function updateBadge() {
  const badge = document.querySelector('.badge');
  if (!badge) return;

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function setTypingIndicator(username) {
  if (!username) {
    typingIndicator.classList.add('hidden');
    typingText.textContent = '';
    return;
  }

  typingText.textContent = `${username} is typing...`;
  typingIndicator.classList.remove('hidden');
}

function updateTypingIndicator() {
  if (activeTypingUsers.size === 0) {
    setTypingIndicator(null);
    return;
  }
  const names = Array.from(activeTypingUsers).slice(0, 2);
  const label = names.length === 1 ? `${names[0]} is typing...` : `${names.join(' & ')} are typing...`;
  typingText.textContent = label;
  typingIndicator.classList.remove('hidden');
}

function markUserTyping(username) {
  activeTypingUsers.add(username);
  updateTypingIndicator();
}

function markUserStoppedTyping(username) {
  activeTypingUsers.delete(username);
  updateTypingIndicator();
}

function connectSocket() {
  // Socket.io is removed. Subscriptions are handled by Firestore onSnapshot.
}

function sendMove(move) {
  if (!currentRoomId || !myParticipantId) return;
  fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId, move })
  });
}

function initRealtimeListeners() {
  if (!db || !currentRoomId) return;

  // 1. Listen for Room & Game state
  db.collection('rooms').doc(currentRoomId).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    
    // Update game state
    if (JSON.stringify(gameState) !== JSON.stringify(data.gameState) || gameType !== data.gameType) {
      gameState = data.gameState;
      gameType = data.gameType;
      renderGame();
    }
    
    // We should also check if availableGames list is in the room doc if we want it dynamic
    // For now we keep the local list from join response
  });

  // 2. Listen for Participants & Typing
  db.collection('rooms').doc(currentRoomId).collection('participants').onSnapshot((snapshot) => {
    const nextParticipants = [];
    snapshot.forEach(doc => {
      const p = doc.data();
      nextParticipants.push(p);
      
      // Update typing indicators
      if (p.participantId !== myParticipantId) {
        if (p.isTyping) markUserTyping(p.username);
        else markUserStoppedTyping(p.username);
      }
      
      // Update my symbol if it changed (e.g. game changed)
      if (p.participantId === myParticipantId) {
        mySymbol = p.symbol;
      }
    });
    
    participants = nextParticipants;
    renderParticipants();
    renderGame();
  });

  // 3. Listen for Messages
  db.collection('rooms').doc(currentRoomId).collection('messages')
    .orderBy('timestamp', 'asc')
    .limitToLast(50)
    .onSnapshot(async (snapshot) => {
      // Find only new messages
      const newMsgs = [];
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          newMsgs.push(change.doc.data());
        }
      });
      
      if (newMsgs.length === 0) return;

      for (const msg of newMsgs) {
        // Avoid duplicate rendering of history we already have
        if (messages.find(m => m.timestamp === msg.timestamp && m.participantId === msg.participantId)) continue;
        
        const decryptedText = await decryptMessage(msg.text, currentRoomId);
        messages.push({ ...msg, text: decryptedText, type: 'chat' });
      }
      
      renderMessages();
    });
}

function setConnectionStatus(label, warning) {
  connectionStatus.textContent = label;
  connectionStatus.style.color = warning ? 'var(--accent-danger)' : 'var(--accent-success)';
}

function renderParticipants() {
  participantsList.innerHTML = participants.map(p => `
    <div class="participant-pill" style="margin-bottom: 8px;">
      <span>${p.username} ${p.participantId === myParticipantId ? '(You)' : ''}</span>
      <span class="status-banner" style="padding: 2px 8px;">${p.symbol}</span>
    </div>
  `).join('');

  const me = participants.find(p => p.participantId === myParticipantId);
  const opponent = participants.find(p => p.participantId !== myParticipantId);

  if (me) {
    playerMeName.textContent = `${me.username} (You)`;
    playerMeSymbol.textContent = me.symbol || '-';
    playerMeAvatar.textContent = me.username ? me.username.charAt(0).toUpperCase() : '?';
    
    // Highlight if it's my turn
    const isMyTurn = (typeof gameState?.turn === 'string' && gameState.turn === me.symbol);
    const badgeMe = document.getElementById('player-me');
    if (badgeMe) {
      badgeMe.classList.toggle('active', isMyTurn && gameState?.active);
      badgeMe.classList.toggle('winner', gameState?.winner === me.symbol);
    }
  } else {
    playerMeName.textContent = 'You';
    playerMeSymbol.textContent = '-';
    playerMeAvatar.textContent = '?';
  }

  if (opponent) {
    playerOpName.textContent = opponent.username;
    playerOpSymbol.textContent = opponent.symbol || '-';
    playerOpAvatar.textContent = opponent.username ? opponent.username.charAt(0).toUpperCase() : '?';
    
    // Highlight if it's opponent's turn
    const isOpTurn = (typeof gameState?.turn === 'string' && gameState.turn === opponent.symbol);
    const badgeOp = document.getElementById('player-opponent');
    if (badgeOp) {
      badgeOp.classList.toggle('active', isOpTurn && gameState?.active);
      badgeOp.classList.toggle('winner', gameState?.winner === opponent.symbol);
    }

    const dot = document.querySelector('#player-opponent .status-dot');
    if (dot) {
      dot.classList.remove('waiting', 'danger');
      dot.classList.add('online');
    }
  } else {
    playerOpName.textContent = 'Waiting...';
    playerOpSymbol.textContent = '-';
    playerOpAvatar.textContent = '?';
    const dot = document.querySelector('#player-opponent .status-dot');
    if (dot) {
      dot.classList.remove('online', 'danger');
      dot.classList.add('waiting');
    }
  }
}

function isNearBottom() {
  const threshold = 100; // px
  return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
}

function renderMessages() {
  if (activeView !== 'chat' && appContainer && !appContainer.classList.contains('hidden')) {
    unreadCount++;
    updateBadge();
  }

  const scrolledNearBottom = isNearBottom();
  
  messagesContainer.innerHTML = '';
  messages.forEach(msg => {
    const div = document.createElement('div');
    const isMine = msg.participantId === myParticipantId;
    const isSystem = msg.type === 'system' || !msg.username;
    
    div.className = `message ${isSystem ? 'system' : (isMine ? 'mine' : 'others')}`;
    div.setAttribute('data-participant', msg.participantId || '');
    
    const initial = msg.username ? msg.username.charAt(0).toUpperCase() : '?';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isSystem) {
      div.innerHTML = `<div class="message-body">${msg.text}</div>`;
    } else {
      div.innerHTML = `
        <div class="message-meta">
          <div class="msg-avatar">${initial}</div>
          <span class="msg-author">${msg.username}</span>
          <span class="msg-time">${time}</span>
        </div>
        <div class="message-body">${msg.text}</div>
      `;
    }
    messagesContainer.appendChild(div);
  });

  if (scrolledNearBottom) {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
    scrollBottomBtn.classList.add('hidden');
  } else if (messages.length > 0) {
    scrollBottomBtn.classList.remove('hidden');
  }
  
  updateChatCount();
}

// Scroll Handling
messagesContainer.addEventListener('scroll', () => {
  if (isNearBottom()) {
    scrollBottomBtn.classList.add('hidden');
  }
});

scrollBottomBtn.onclick = () => {
  messagesContainer.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: 'smooth'
  });
  scrollBottomBtn.classList.add('hidden');
};

function updateChatCount() {
  chatCount.textContent = `${messages.length} messages`;
}

function renderGameTabs() {
  gameSelector.innerHTML = availableGames.map(g => `
    <div class="game-tab ${g === gameType ? 'active' : ''}" onclick="selectGame('${g}')">
      ${g.replace(/-/g, ' ').toUpperCase()}
    </div>
  `).join('');
}

window.selectGame = (type) => {
  fetch('/api/select-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, gameType: type })
  });
};

function updateInstructions() {
  if (!gameState) return;
  
  const isMyTurn = gameState.turn === mySymbol;
  let text = '';

  if (!gameState.active) {
    if (gameState.winner) {
      const winnerName = participants.find(p => p.symbol === gameState.winner)?.username || gameState.winner;
      text = `Game Over! Winner: ${winnerName}`;
    } else {
      text = 'Game Over! It\'s a draw.';
    }
  } else if (!isMyTurn) {
    text = 'Waiting for mate to move...';
  } else {
    switch (gameType) {
      case 'tic-tac-toe': text = 'Click an empty square to place your symbol.'; break;
      case 'connect-four': text = 'Click a column to drop your piece.'; break;
      case 'chess': text = selectedPiece ? 'Select a target square to move.' : 'Select a piece to move.'; break;
      case 'checkers': text = selectedPiece ? 'Select a target square to jump/move.' : 'Select a piece to move.'; break;
      case 'othello': text = 'Click a square to place and flip mate discs.'; break;
      case 'rock-paper-scissors': text = 'Choose Rock, Paper, or Scissors.'; break;
      case 'battleship': 
        text = gameState.phase === 'placement' ? 'Click grid to place 5 ship segments.' : 'Click the mate\'s grid to fire!';
        break;
      case 'hangman':
        text = gameState.phase === 'choosing' ? 'Chooser (P1): Type a word for the guesser.' : 'Guesser (P2): Guess a letter to reveal the word.';
        break;
      case 'memory-match': text = 'Find matching pairs of icons.'; break;
      case 'dots-and-boxes': text = 'Click a space between dots to draw a line.'; break;
    }
  }
  if (instructionsText) instructionsText.textContent = text;
  // Use a significantly smaller font size for instructions on smaller screens to save space
  if (window.innerWidth < 480) {
    instructionsText.style.fontSize = '0.75rem';
  } else if (window.innerWidth < 768) {
    instructionsText.style.fontSize = '0.9rem';
  } else {
    instructionsText.style.fontSize = '1.1rem';
  }
  instructionsText.style.fontWeight = '500';
}

function renderGame() {
  if (!gameState) return;

  // Determine if it's the current player's turn
  let isMyTurn = false;
  if (typeof gameState.turn === 'string') {
    // Turn is stored as symbol (X, O, R, Y, etc.)
    isMyTurn = gameState.turn === mySymbol;
  } else if (typeof gameState.turn === 'number') {
    // Turn is stored as participant index
    const currentPlayer = participants[gameState.turn];
    isMyTurn = currentPlayer && currentPlayer.participantId === myParticipantId;
  }

  const statusText = gameState.winner ? `Winner: ${gameState.winner}` : 
                      gameState.isDraw ? "It's a draw!" :
                      isMyTurn ? "Your Turn" : "Waiting for mate...";

  // Remove old winner banners if any
  const oldBanner = document.querySelector('.game-result');
  if (oldBanner) oldBanner.remove();

  if (gameState.winner || gameState.isDraw) {
    // Premium Winner Banner
    const banner = document.createElement('div');
    banner.className = 'game-result';
    if (gameState.winner) {
      banner.innerHTML = `🏆 WINNER: <span class="winner-name">${getWinnerName(gameState.winner)}</span>`;
    } else {
      banner.innerHTML = `🤝 GAME OVER: <span class="winner-name">IT'S A DRAW</span>`;
    }
    board.before(banner); // Place before board for hierarchy

    if (gameState.winner && gameState.winner === mySymbol) {
      if (!window.hasFiredConfetti) {
        fireConfetti();
        window.hasFiredConfetti = true;
      }
    }

    if (db && !window.hasSavedMatchResult) {
      let shouldSave = false;
      if (gameState.winner && gameState.winner === mySymbol) shouldSave = true;
      if (gameState.isDraw && participants.length > 0 && mySymbol === participants[0].symbol) shouldSave = true;

      if (shouldSave) {
        db.collection('matches').add({
          roomId: currentRoomId,
          gameType: gameType,
          winner: gameState.winner || 'Draw',
          timestamp: Date.now(),
          participants: participants.map(p => p.username)
        }).catch(e => console.error("Error saving match", e));
      }
      window.hasSavedMatchResult = true;
    }
  } else {
    window.hasFiredConfetti = false;
    window.hasSavedMatchResult = false;
  }

  // Consolidate status labels
  if (gameStatusLabel) {
    if (gameState.winner) {
      gameStatusLabel.textContent = "GAME FINISHED";
      gameStatusPill.className = 'status-pill finished';
    } else if (gameState.active) {
      gameStatusLabel.textContent = "LIVE MATCH";
      gameStatusPill.className = 'status-pill live';
    } else {
      gameStatusLabel.textContent = "WAITING...";
      gameStatusPill.className = 'status-pill waiting';
    }
  }

  if (turnIndicator) {
    turnIndicator.className = 'turn-chip ' + (gameState.active ? (isMyTurn ? 'live' : 'waiting') : 'finished');
    if (gameState.winner) {
      turnIndicator.textContent = "GAME OVER";
    } else if (gameState.active) {
      turnIndicator.textContent = isMyTurn ? "YOUR TURN" : "WAITING FOR MATE";
    } else {
      turnIndicator.textContent = "WAITING...";
    }
  }
  
  board.innerHTML = '';
  try {
    updateInstructions();
  } catch (e) {
    console.error("Instructions render error", e);
  }

  try {
    switch (gameType) {
      case 'tic-tac-toe': renderTicTacToe(); break;
      case 'connect-four': renderConnectFour(); break;
      case 'chess': renderChess(); break;
      case 'checkers': renderCheckers(); break;
      case 'othello': renderOthello(); break;
      case 'rock-paper-scissors': renderRockPaperScissors(); break;
      case 'battleship': renderBattleship(); break;
      case 'hangman': renderHangman(); break;
      case 'memory-match': renderMemoryMatch(); break;
      case 'dots-and-boxes': renderDotsAndBoxes(); break;
    }
  } catch (e) {
     console.error("Game render error", e);
     board.innerHTML = `<div class='error-card'><h3>Game Error</h3><p>${e.message}</p><p>The room state might be stale. Try Leaving and re-joining.</p></div>`;
  }
}

// Selection state already declared above


function _makeGridCell(size) {
  const c = document.createElement('div');
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  c.style.display = 'grid';
  c.style.gridTemplateColumns = `repeat(8, ${size}px)`;
  c.style.gap = '2px';
  return c;
}

function renderChess() {
  const mainContainer = document.createElement('div');
  mainContainer.style.display = 'flex';
  mainContainer.style.flexDirection = 'column';
  mainContainer.style.alignItems = 'center';
  mainContainer.style.gap = '20px';
  mainContainer.style.width = '100%';

  const boardWrapper = document.createElement('div');
  boardWrapper.style.position = 'relative';
  boardWrapper.style.padding = '25px';
  boardWrapper.style.background = 'var(--bg-surface)';
  boardWrapper.style.borderRadius = '16px';
  boardWrapper.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)';
  boardWrapper.style.border = '1px solid var(--border-glass)';

  // Labels (1-8)
  for (let i = 0; i < 8; i++) {
    const label = document.createElement('div');
    label.textContent = 8 - i;
    label.style.position = 'absolute';
    label.style.left = '8px';
    label.style.top = `${25 + i * 45 + 15}px`;
    label.style.fontSize = '0.8rem';
    label.style.color = 'var(--text-muted)';
    boardWrapper.appendChild(label);
  }
  // Labels (A-H)
  for (let i = 0; i < 8; i++) {
    const label = document.createElement('div');
    label.textContent = String.fromCharCode(65 + i);
    label.style.position = 'absolute';
    label.style.bottom = '5px';
    label.style.left = `${25 + i * 45 + 20}px`;
    label.style.fontSize = '0.8rem';
    label.style.color = 'var(--text-muted)';
    boardWrapper.appendChild(label);
  }

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(8, 45px)';
  grid.style.gridTemplateRows = 'repeat(8, 45px)';
  grid.style.border = '2px solid #34495e';

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cell = gameState.board[y * 8 + x];
      const square = document.createElement('div');
      square.style.width = '45px';
      square.style.height = '45px';
      square.style.display = 'grid';
      square.style.placeItems = 'center';
      square.style.fontSize = '1.8rem';
      square.style.cursor = 'pointer';
      
      const isBlack = (x + y) % 2 !== 0;
      square.style.background = isBlack ? '#769656' : '#eeeed2';

      // Last move highlight
      if (gameState.lastMove) {
        const { from, to } = gameState.lastMove;
        if ((from.x === x && from.y === y) || (to.x === x && to.y === y)) {
           square.style.background = isBlack ? '#b9ca43' : '#f7f769';
        }
      }

      // Selected piece highlight
      if (selectedPiece && selectedPiece.x === x && selectedPiece.y === y) {
        square.style.background = '#f1c40f';
      }

      if (cell) {
        const pieceIcons = {
          'WK': '♔', 'WQ': '♕', 'WR': '♖', 'WB': '♗', 'WN': '♘', 'WP': '♙',
          'BK': '♚', 'BQ': '♛', 'BR': '♜', 'BB': '♝', 'BN': '♞', 'BP': '♟'
        };
        square.textContent = pieceIcons[cell] || cell;
        square.style.color = cell[0] === 'W' ? '#fff' : '#000';
        square.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))';
      }

      square.onclick = () => {
        if (!gameState.active || gameState.turn !== mySymbol) return;
        if (selectedPiece) {
          if (selectedPiece.x === x && selectedPiece.y === y) {
            selectedPiece = null;
          } else {
            haptic();
            sendMove({ from: selectedPiece, to: { x, y } });
            selectedPiece = null;
          }
          renderGame();
        } else if (cell && cell[0] === mySymbol) {
          selectedPiece = { x, y };
          renderGame();
        }
      };
      grid.appendChild(square);
    }
  }

  boardWrapper.appendChild(grid);
  mainContainer.appendChild(boardWrapper);

  // History Panel
  if (gameState.history && gameState.history.length > 0) {
    const historyBox = document.createElement('div');
    historyBox.style.width = '100%';
    historyBox.style.maxHeight = '150px';
    historyBox.style.overflowY = 'auto';
    historyBox.style.background = 'rgba(0,0,0,0.2)';
    historyBox.style.borderRadius = '12px';
    historyBox.style.padding = '10px';
    historyBox.style.fontSize = '0.9rem';
    
    const hTitle = document.createElement('div');
    hTitle.textContent = 'Move History';
    hTitle.style.fontWeight = 'bold';
    hTitle.style.marginBottom = '8px';
    hTitle.style.color = 'var(--accent-primary)';
    historyBox.appendChild(hTitle);

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(2, 1fr)';
    list.style.gap = '5px';

    gameState.history.forEach((h, i) => {
      const item = document.createElement('div');
      item.textContent = `${Math.floor(i/2) + 1}. ${h.move}`;
      item.style.padding = '4px 8px';
      item.style.background = 'rgba(255,255,255,0.05)';
      item.style.borderRadius = '4px';
      list.appendChild(item);
    });
    
    historyBox.appendChild(list);
    mainContainer.appendChild(historyBox);
    // Auto scroll to bottom
    setTimeout(() => historyBox.scrollTop = historyBox.scrollHeight, 100);
  }

  board.appendChild(mainContainer);
}

function renderHangman() {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '20px';

  if (gameState.phase === 'choosing') {
    if (mySymbol === 'P1') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Enter word...';
      input.className = 'pill-btn';
      input.style.textAlign = 'center';
      input.style.fontSize = '1.2rem';
      
      const btn = document.createElement('button');
      btn.textContent = 'Set Word';
      btn.className = 'primary-btn pill-btn';
      btn.onclick = () => {
        if (input.value) {
          haptic();
          sendMove({ word: input.value });
        }
      };
      container.appendChild(input);
      container.appendChild(btn);
    } else {
      container.innerHTML = '<h3>Mate is choosing a word...</h3>';
    }
  } else {
    // Guessing phase
    const wordDisplay = document.createElement('div');
    wordDisplay.style.fontSize = '2.5rem';
    wordDisplay.style.letterSpacing = '10px';
    wordDisplay.style.fontFamily = 'monospace';
    wordDisplay.textContent = gameState.word.split('').map(l => gameState.guessed.includes(l) ? l : '_').join('');
    container.appendChild(wordDisplay);

    const wrongLabel = document.createElement('div');
    wrongLabel.textContent = `Wrong guesses: ${gameState.wrong} / ${gameState.maxWrong}`;
    wrongLabel.style.color = '#f43f5e';
    container.appendChild(wrongLabel);

    if (mySymbol === 'P2' && gameState.active) {
      const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const keyboard = document.createElement('div');
      keyboard.style.display = 'flex';
      keyboard.style.flexWrap = 'wrap';
      keyboard.style.justifyContent = 'center';
      keyboard.style.gap = '8px';
      keyboard.style.maxWidth = '400px';

      letters.forEach(l => {
        const btn = document.createElement('button');
        btn.textContent = l.toUpperCase();
        btn.style.width = '35px';
        btn.style.height = '35px';
        btn.disabled = gameState.guessed.includes(l);
        btn.onclick = () => {
        haptic();
        sendMove({ letter: l });
      };
        keyboard.appendChild(btn);
      });
      container.appendChild(keyboard);
    }
  }

  board.appendChild(container);
}

function renderBattleship() {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '24px';
  container.style.width = '100%';

  const phaseLabel = document.createElement('div');
  phaseLabel.className = 'pill-btn';
  phaseLabel.style.background = 'var(--accent-primary)';
  phaseLabel.textContent = gameState.phase === 'placement' ? 'DEPLOYING FLEET' : 'COMBAT PHASE';
  container.appendChild(phaseLabel);

  if (gameState.phase === 'placement' && !gameState.players[mySymbol]) {
    const instructions = document.createElement('div');
    instructions.style.fontSize = '0.9rem';
    instructions.style.color = 'var(--text-muted)';
    const count = window.tempPlacement ? window.tempPlacement.filter(x => x).length : 0;
    instructions.textContent = `Select 5 positions for your fleet (${count}/5)`;
    container.appendChild(instructions);

    if (count === 5) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'pill-btn';
      confirmBtn.style.marginTop = '10px';
      confirmBtn.style.background = 'var(--accent-success)';
      confirmBtn.textContent = 'CONFIRM PLACEMENT';
      confirmBtn.onclick = () => {
        haptic();
        sendMove({ board: window.tempPlacement, ships: [] });
        window.tempPlacement = null;
      };
      container.appendChild(confirmBtn);
    }
  }

  const gridWrap = document.createElement('div');
  gridWrap.style.display = 'flex';
  gridWrap.style.gap = '30px';
  gridWrap.style.flexWrap = 'wrap';
  gridWrap.style.justifyContent = 'center';

  const renderGrid = (label, isOpponent) => {
    const wrap = document.createElement('div');
    wrap.style.textAlign = 'center';
    wrap.innerHTML = `<h4 style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.8rem; letter-spacing: 1px;">${label.toUpperCase()}</h4>`;
    
    const radarContainer = document.createElement('div');
    radarContainer.className = 'radar-container';
    radarContainer.style.padding = '20px'; // Space for labels

    const sweep = document.createElement('div');
    sweep.className = 'radar-sweep';
    radarContainer.appendChild(sweep);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(10, 28px)';
    grid.style.gridTemplateRows = 'repeat(10, 28px)';
    grid.style.gap = '1px';
    grid.style.position = 'relative';
    grid.style.zIndex = '2';

    const playerData = gameState.players[mySymbol];
    const opponentSymbol = mySymbol === 'P1' ? 'P2' : 'P1';
    const opponentData = gameState.players[opponentSymbol];

    // Add coordinate labels
    for (let i = 0; i < 10; i++) {
        const xLabel = document.createElement('div');
        xLabel.className = 'coordinate-label';
        xLabel.textContent = String.fromCharCode(65 + i);
        xLabel.style.position = 'absolute';
        xLabel.style.top = '-18px';
        xLabel.style.left = `${i * 29 + 10}px`;
        grid.appendChild(xLabel);

        const yLabel = document.createElement('div');
        yLabel.className = 'coordinate-label';
        yLabel.textContent = i + 1;
        yLabel.style.position = 'absolute';
        yLabel.style.left = '-18px';
        yLabel.style.top = `${i * 29 + 8}px`;
        grid.appendChild(yLabel);
    }

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        const cell = document.createElement('div');
        cell.className = 'radar-cell';
        cell.style.width = '28px';
        cell.style.height = '28px';
        cell.style.background = 'rgba(0, 209, 255, 0.03)';

        if (isOpponent) {
          if (opponentData && opponentData.hits[idx]) {
            cell.style.background = opponentData.hits[idx] === 'hit' ? 'rgba(244, 63, 94, 0.6)' : 'rgba(100, 116, 139, 0.4)';
            cell.innerHTML = opponentData.hits[idx] === 'hit' ? '💥' : '💧';
          }
          cell.onclick = () => {
            if (gameState.phase === 'battle' && gameState.turn === mySymbol) {
              haptic();
              sendMove({ x: c, y: r });
            }
          };
        } else {
          if (playerData) {
            if (playerData.board[idx]) cell.style.background = 'rgba(93, 216, 255, 0.4)';
            if (playerData.hits[idx]) {
              cell.innerHTML = playerData.hits[idx] === 'hit' ? '💥' : '💧';
              if (playerData.hits[idx] === 'hit') cell.style.background = 'rgba(244, 63, 94, 0.4)';
            }
          } else if (gameState.phase === 'placement') {
            cell.style.cursor = 'pointer';
            if (window.tempPlacement && window.tempPlacement[idx]) cell.style.background = 'rgba(93, 216, 255, 0.6)';
            cell.onclick = () => {
              if (!window.tempPlacement) window.tempPlacement = Array(100).fill(0);
              const currentCount = window.tempPlacement.filter(x => x).length;
              if (window.tempPlacement[idx]) {
                window.tempPlacement[idx] = 0;
              } else if (currentCount < 5) {
                window.tempPlacement[idx] = 1;
              }
              renderGame();
            };
          }
        }
        grid.appendChild(cell);
      }
    }
    radarContainer.appendChild(grid);
    wrap.appendChild(radarContainer);
    return wrap;
  };

  gridWrap.appendChild(renderGrid('Your Fleet', false));
  gridWrap.appendChild(renderGrid('Attack Grid', true));
  container.appendChild(gridWrap);
  board.appendChild(container);
}

function renderCheckers() {
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(8, clamp(40px, 9vmin, 85px))';
  container.style.gap = '2px';
  container.style.padding = '12px';
  container.style.background = '#333';
  container.style.borderRadius = '8px';

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cell = gameState.board[y * 8 + x];
      const square = document.createElement('div');
      square.style.width = 'clamp(40px, 9vmin, 85px)';
      square.style.height = 'clamp(40px, 9vmin, 85px)';
      square.style.background = (x + y) % 2 === 1 ? '#555' : '#888';
      square.style.display = 'grid';
      square.style.placeItems = 'center';
      square.style.cursor = 'pointer';

      if (selectedPiece && selectedPiece.x === x && selectedPiece.y === y) {
        square.style.boxShadow = 'inset 0 0 10px #f1c40f';
      }

      if (cell) {
        const piece = document.createElement('div');
        piece.style.width = '80%';
        piece.style.height = '80%';
        piece.style.borderRadius = '50%';
        piece.style.background = cell.toLowerCase() === 'r' ? '#e74c3c' : '#222';
        piece.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
        piece.style.display = 'grid';
        piece.style.placeItems = 'center';
        piece.style.border = '2px solid rgba(255,255,255,0.2)';
        
        if (cell === cell.toUpperCase()) {
          const crown = document.createElement('i');
          crown.className = 'fas fa-crown';
          crown.style.color = '#f1c40f';
          crown.style.fontSize = 'clamp(0.8rem, 2vmin, 1.2rem)';
          piece.appendChild(crown);
        }
        square.appendChild(piece);
      }

      square.onclick = () => {
        if (!gameState.active || gameState.turn !== mySymbol) return;

        if (selectedPiece) {
          if (selectedPiece.x === x && selectedPiece.y === y) {
            selectedPiece = null;
          } else {
            haptic();
            sendMove({ from: selectedPiece, to: { x, y } });
            selectedPiece = null;
          }
          renderGame();
        } else if (cell && cell.toLowerCase() === mySymbol) {
          selectedPiece = { x, y };
          renderGame();
        }
      };

      container.appendChild(square);
    }
  }

  board.appendChild(container);
}

function renderOthello() {
  const mainContainer = document.createElement('div');
  mainContainer.style.display = 'flex';
  mainContainer.style.flexDirection = 'column';
  mainContainer.style.alignItems = 'center';
  mainContainer.style.gap = '20px';
  mainContainer.style.width = '100%';

  // Score Board
  const scoreBoard = document.createElement('div');
  scoreBoard.style.display = 'flex';
  scoreBoard.style.gap = '30px';
  scoreBoard.style.padding = '10px 20px';
  scoreBoard.style.background = 'rgba(0,0,0,0.3)';
  scoreBoard.style.borderRadius = '12px';
  scoreBoard.style.color = 'white';
  scoreBoard.style.fontSize = '1.1rem';
  scoreBoard.style.fontWeight = '600';

  const blackScore = (gameState.scores?.black) || 0;
  const whiteScore = (gameState.scores?.white) || 0;

  scoreBoard.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px">
      <div style="width:12px; height:12px; border-radius:50%; background:#222; border:1px solid #555"></div>
      Black: ${blackScore}
    </div>
    <div style="display:flex; align-items:center; gap:8px">
      <div style="width:12px; height:12px; border-radius:50%; background:#eee; border:1px solid #777"></div>
      White: ${whiteScore}
    </div>
  `;
  mainContainer.appendChild(scoreBoard);

  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(8, clamp(35px, 8vmin, 60px))';
  container.style.gap = '4px';
  container.style.padding = '12px';
  container.style.background = '#2e7d32';
  container.style.borderRadius = '8px';
  container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5), inset 0 2px 10px rgba(255,255,255,0.1)';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = gameState.board[r * 8 + c];
      const square = document.createElement('div');
      square.style.width = 'clamp(35px, 8vmin, 60px)';
      square.style.height = 'clamp(35px, 8vmin, 60px)';
      square.style.background = 'rgba(255,255,255,0.05)';
      square.style.borderRadius = '4px';
      square.style.display = 'grid';
      square.style.placeItems = 'center';
      square.style.cursor = 'pointer';
      square.style.transition = 'background 0.2s';

      // Possible Move Hint
      const isPossible = gameState.possibleMoves?.some(m => m.r === r && m.c === c);
      const isMyTurn = gameState.active && gameState.turn === mySymbol;

      if (isPossible && isMyTurn) {
        const hint = document.createElement('div');
        hint.style.width = '20%';
        hint.style.height = '20%';
        hint.style.borderRadius = '50%';
        hint.style.background = 'rgba(255,255,255,0.3)';
        square.appendChild(hint);
        
        square.onmouseenter = () => square.style.background = 'rgba(255,255,255,0.15)';
        square.onmouseleave = () => square.style.background = 'rgba(255,255,255,0.05)';
      }

      if (cell) {
        const disc = document.createElement('div');
        disc.style.width = '85%';
        disc.style.height = '85%';
        disc.style.borderRadius = '50%';
        disc.style.background = cell === 'black' ? '#1a1a1a' : '#f0f0f0';
        disc.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
        disc.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        square.appendChild(disc);
      }

      square.onclick = () => {
        if (!gameState.active || gameState.turn !== mySymbol) return;
        haptic();
        sendMove({ r, c });
      };
      container.appendChild(square);
    }
  }

  mainContainer.appendChild(container);
  board.appendChild(mainContainer);
}

let moveInFlight = false;
async function sendMove(move) {
  if (moveInFlight) return;
  moveInFlight = true;
  
  try {
    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId, move })
    });
    if (!res.ok) {
       const err = await res.json();
       console.error("Move failed", err);
    }
  } catch (e) {
    console.error("Network error on move", e);
  } finally {
    moveInFlight = false;
  }
}

function renderMemoryMatch() {
  const container = document.createElement('div');
  container.className = 'memory-grid';
  container.style.width = '100%';
  container.style.maxWidth = '500px';
  container.style.margin = '10px auto';

  gameState.cards.forEach((card, i) => {
    const cardEl = document.createElement('div');
    cardEl.className = `memory-card ${card.flipped || card.matched ? 'flipped' : ''} ${card.matched ? 'matched' : ''}`;
    
    const back = document.createElement('div');
    back.className = 'memory-card-back';
    back.textContent = '?';
    
    const front = document.createElement('div');
    front.className = 'memory-card-front';
    front.textContent = card.val;

    cardEl.appendChild(back);
    cardEl.appendChild(front);

    cardEl.onclick = () => {
      if (moveInFlight) return;
      if (!gameState.active || gameState.turn !== mySymbol) return;
      if (card.flipped || card.matched) return;
      
      haptic();
      sendMove({ index: i });
      cardEl.classList.add('flipped');
    };

    container.appendChild(cardEl);
  });

  board.appendChild(container);
}

function renderDotsAndBoxes() {
  const container = document.createElement('div');
  container.className = 'dots-boxes-container';
  container.style.position = 'relative';
  
  const size = gameState.size;
  const boardActualWidth = board.clientWidth || 320; // Fallback for background load
  const boardWidth = boardActualWidth - 40; // Subtract padding
  const cellSize = Math.min(100, Math.floor(boardWidth / (size - 1.2)));
  const dotSize = Math.max(10, Math.floor(cellSize * 0.2));
  
  container.style.width = `${(size - 1) * cellSize + dotSize}px`;
  container.style.height = `${(size - 1) * cellSize + dotSize}px`;
  container.style.margin = '20px auto';

  // Render Boxes
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const idx = r * (size - 1) + c;
      const owner = gameState.boxes[idx];
      if (owner) {
        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.top = `${r * cellSize + dotSize / 2}px`;
        box.style.left = `${c * cellSize + dotSize / 2}px`;
        box.style.width = `${cellSize}px`;
        box.style.height = `${cellSize}px`;
        box.style.background = owner === 'P1' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(244, 63, 94, 0.2)';
        box.style.display = 'grid';
        box.style.placeItems = 'center';
        box.style.fontSize = '1.5rem';
        box.textContent = owner === 'P1' ? 'P1' : 'P2';
        container.appendChild(box);
      }
    }
  }

  // Render Lines
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size - 1; c++) {
      const line = document.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${c * cellSize + dotSize / 2}px`;
      line.style.top = `${r * cellSize}px`;
      line.style.width = `${cellSize}px`;
      line.style.height = `${dotSize}px`;
      line.style.borderRadius = `${dotSize/2}px`;
      const owner = gameState.lines.h[`${r}-${c}`];
      line.style.background = owner ? (owner === 'P1' ? '#6366f1' : '#10b981') : 'rgba(255,255,255,0.05)';
      line.style.cursor = 'pointer';
      line.onclick = () => {
        haptic();
        sendMove({ type: 'h', r, c });
      };
      container.appendChild(line);
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size; c++) {
      const line = document.createElement('div');
      line.style.position = 'absolute';
      line.style.left = `${c * cellSize}px`;
      line.style.top = `${r * cellSize + dotSize / 2}px`;
      line.style.width = `${dotSize}px`;
      line.style.height = `${cellSize}px`;
      line.style.borderRadius = `${dotSize/2}px`;
      const owner = gameState.lines.v[`${r}-${c}`];
      line.style.background = owner ? (owner === 'P1' ? '#6366f1' : '#10b981') : 'rgba(255,255,255,0.05)';
      line.style.cursor = 'pointer';
      line.onclick = () => {
        haptic();
        sendMove({ type: 'v', r, c });
      };
      container.appendChild(line);
    }
  }

  // Render Dots
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dot = document.createElement('div');
      dot.style.position = 'absolute';
      dot.style.left = `${c * cellSize}px`;
      dot.style.top = `${r * cellSize}px`;
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      dot.style.background = '#fff';
      dot.style.borderRadius = '50%';
      dot.style.zIndex = '2';
      container.appendChild(dot);
    }
  }

  board.appendChild(container);
}

function renderTicTacToe() {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '16px';

  const grid = document.createElement('div');
  grid.className = 'ttt-grid';

  gameState.board.forEach((cell, i) => {
    const btn = document.createElement('button');
    btn.className = `cell ${cell ? 'disabled' : ''}`;
    btn.textContent = cell || '';
    btn.style.fontSize = 'clamp(2rem, 5vmin, 3.5rem)';
    btn.style.fontWeight = 'bold';
    btn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';

    if (cell === 'X') {
      btn.style.color = 'var(--accent-primary)';
      btn.style.textShadow = '0 2px 8px rgba(99, 102, 241, 0.5)';
    } else if (cell === 'O') {
      btn.style.color = 'var(--accent-success)';
      btn.style.textShadow = '0 2px 8px rgba(16, 185, 129, 0.5)';
    }

    btn.onclick = () => {
      if (!cell && gameState.turn === mySymbol) {
        haptic();
        sendMove({ index: i });
      }
    };

    btn.onmouseenter = () => {
      if (!cell) {
        btn.style.transform = 'scale(1.05)';
        btn.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.3)';
      }
    };

    btn.onmouseleave = () => {
      if (!cell) {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = 'none';
      }
    };

    grid.appendChild(btn);
  });

  container.appendChild(grid);
  board.appendChild(container);
}

function renderConnectFour() {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '20px';

  const title = document.createElement('h3');
  title.textContent = 'Connect Four';
  title.style.color = 'var(--text-primary)';
  title.style.fontSize = '1.2rem';
  title.style.fontWeight = '600';
  title.style.margin = '0';
  container.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'c4-grid';

  for (let ri = 0; ri < 6; ri++) {
    for (let ci = 0; ci < 7; ci++) {
      const cell = gameState.board[ri * 7 + ci];
      const div = document.createElement('div');
      div.className = `c4-cell ${cell || ''}`;
      div.style.background = 'radial-gradient(circle, var(--bg-surface) 0%, var(--bg-dark) 100%)';

      if (cell === 'R') {
        div.style.background = 'radial-gradient(circle, #ef4444 0%, #dc2626 100%)';
        div.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.6)';
      } else if (cell === 'Y') {
        div.style.background = 'radial-gradient(circle, #eab308 0%, #ca8a04 100%)';
        div.style.boxShadow = '0 0 20px rgba(234, 179, 8, 0.6)';
      }

      div.onclick = () => {
        if (gameState.active && gameState.turn === mySymbol) {
          haptic();
          sendMove({ col: ci });
        }
      };

      div.onmouseenter = () => {
        if (!cell) {
          div.style.transform = 'scale(1.1)';
          div.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.4)';
        }
      };

      div.onmouseleave = () => {
        if (!cell) {
          div.style.transform = 'scale(1)';
          div.style.boxShadow = 'none';
        }
      };

      grid.appendChild(div);
    }
  }

  container.appendChild(grid);
  board.appendChild(container);
}

function renderRockPaperScissors() {
  const container = document.createElement('div');
  container.className = 'rps-container';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.gap = '30px';

  const title = document.createElement('h3');
  title.textContent = 'Rock Paper Scissors';
  title.style.color = 'var(--text-primary)';
  title.style.fontSize = '1.2rem';
  title.style.fontWeight = '600';
  container.appendChild(title);

  const status = document.createElement('div');
  status.style.fontSize = '1.1rem';
  status.style.color = 'var(--text-muted)';
  status.style.textAlign = 'center';
  
  if (!gameState.active) {
    // Show results
    const results = document.createElement('div');
    results.style.textAlign = 'center';
    const p1Choice = gameState.moves['P1'] || '?';
    const p2Choice = gameState.moves['P2'] || '?';
    
    results.innerHTML = `
      <div style="display: flex; gap: 40px; margin-bottom: 20px; font-size: 3rem;">
        <div style="text-align: center"><div style="font-size: 1rem">P1</div>${p1Choice === 'rock' ? '🪨' : p1Choice === 'paper' ? '📄' : '✂️'}</div>
        <div style="text-align: center"><div style="font-size: 1rem">P2</div>${p2Choice === 'rock' ? '🪨' : p2Choice === 'paper' ? '📄' : '✂️'}</div>
      </div>
      <h2 style="color: var(--accent-primary)">${gameState.draw ? "It's a Draw!" : (gameState.winner + " Wins!")}</h2>
    `;
    container.appendChild(results);
  } else {
    // Check if I already chose
    if (gameState.moves[mySymbol]) {
      status.textContent = "Waiting for Mate to choose...";
      container.appendChild(status);
    } else {
      const choicesContainer = document.createElement('div');
      choicesContainer.style.display = 'flex';
      choicesContainer.style.gap = '20px';
      choicesContainer.style.flexWrap = 'wrap';
      choicesContainer.style.justifyContent = 'center';

      const choices = [
        { name: 'rock', emoji: '🪨', color: '#6366f1' },
        { name: 'paper', emoji: '📄', color: '#10b981' },
        { name: 'scissors', emoji: '✂️', color: '#f59e0b' }
      ];

      choices.forEach(({ name, emoji, color }) => {
        const btn = document.createElement('button');
        btn.innerHTML = `<div style="font-size: 2.5rem">${emoji}</div><div style="font-weight: bold">${name.toUpperCase()}</div>`;
        btn.style.padding = '20px';
        btn.style.borderRadius = '16px';
        btn.style.background = 'rgba(255,255,255,0.05)';
        btn.style.border = `2px solid rgba(255,255,255,0.1)`;
        btn.style.color = 'white';
        btn.style.cursor = 'pointer';
        
        btn.onclick = () => {
          haptic();
          sendMove({ choice: name });
        };
        choicesContainer.appendChild(btn);
      });
      container.appendChild(choicesContainer);
    }
  }

  board.appendChild(container);
}

function enterApp(roomState, isSilentRejoin = false) {
  currentRoomId = roomState.roomId;
  myParticipantId = roomState.participantId;
  mySymbol = roomState.symbol;
  currentUsername = roomState.username;
  availableGames = roomState.availableGames || ['tic-tac-toe'];

  // Save for persistence
  localStorage.setItem('mate-session', JSON.stringify({
    roomId: currentRoomId,
    participantId: myParticipantId,
    username: currentUsername,
    symbol: mySymbol,
    availableGames: availableGames
  }));

  // Start heartbeat
  if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
  window.heartbeatInterval = setInterval(() => {
    if (currentRoomId && myParticipantId) {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId })
      }).catch(err => console.error("Heartbeat failed", err));
    }
  }, 45000);

  roomTitle.textContent = currentRoomId;
  meLabel.textContent = `${currentUsername} (${mySymbol})`;
  
  joinContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');

  if (!isSilentRejoin && !localStorage.getItem('mate-room-welcome')) {
    showToast('Welcome back to Mate!');
    localStorage.setItem('mate-room-welcome', '1');
  }
  
  // Initialize Real-time Listeners
  initRealtimeListeners();
  
  renderParticipants();
  renderGameTabs();
  renderGame();
  
  if (window.innerWidth <= 1100) {
    switchMobileView('game');
  }
}

joinButton.onclick = () => {
  const username = usernameInput.value.trim();
  const roomId = roomIdInput.value.trim();
  if (!username || !roomId) return;

  fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, roomId })
  })
  .then(res => res.json())
  .then(res => {
    if (res.success) enterApp(res);
    else joinError.textContent = res.error;
  })
  .catch(err => {
    joinError.textContent = 'Server error. Please try again.';
  });
};

sendButton.onclick = async () => {
  const text = chatInput.value.trim();
  if (text && currentRoomId) {
    const encryptedText = await encryptMessage(text, currentRoomId);
    
    db.collection('rooms').doc(currentRoomId).collection('messages').add({
      roomId: currentRoomId,
      participantId: myParticipantId,
      username: currentUsername,
      text: encryptedText,
      timestamp: Date.now(),
      type: 'chat'
    }).catch(e => console.error("Error saving message", e));

    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId, isTyping: false })
    });

    chatInput.value = '';
  }
};

chatInput.addEventListener('input', () => {
  if (!currentRoomId) return;
  fetch('/api/typing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId, isTyping: true })
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: currentRoomId, participantId: myParticipantId, isTyping: false })
    });
  }, 1500);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendButton.click();
  }
});

leaveButton.onclick = () => {
  localStorage.removeItem('mate-session');
  location.reload();
};

const mobileLeaveBtn = document.getElementById('mobile-leave-btn');
if (mobileLeaveBtn) {
  mobileLeaveBtn.onclick = () => {
    localStorage.removeItem('mate-session');
    location.reload();
  };
}

// Bind Mobile Nav Events
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchMobileView(btn.dataset.view);
  });
});

window.addEventListener('resize', () => {
  if (appContainer.classList.contains('hidden')) return;
  
  if (window.innerWidth > 1100) {
    // Show all panels on desktop
    document.querySelectorAll('.view-container').forEach(el => {
      el.classList.remove('view-active');
    });
  } else {
    // Ensure one view is active on mobile
    switchMobileView(activeView);
  }
  
  renderGame();
});

resetButton.onclick = () => {
  fetch('/api/reset-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId })
  });
};

if (soundToggle) {
  soundToggle.onclick = () => {
    soundEnabled = !soundEnabled;
    soundToggle.classList.toggle('muted', !soundEnabled);
    soundToggle.innerHTML = `<i class="fas fa-volume-${soundEnabled ? 'up' : 'mute'}"></i>`;
    showToast(soundEnabled ? 'Sound on' : 'Sound muted');
  };
}

if (emojiToggle) {
  emojiToggle.onclick = () => showToast('Reactions coming soon');
}

function fireConfetti() {
  if (typeof confetti !== 'undefined') {
    var duration = 3000;
    var end = Date.now() + duration;

    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#5dd8ff', '#9b6bff', '#4ade80'] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#5dd8ff', '#9b6bff', '#4ade80'] });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
}


function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

