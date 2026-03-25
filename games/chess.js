function createInitialState() {
  const board = Array(64).fill(null);
  const setupRow = (row, color) => {
    const pieces = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    pieces.forEach((p, i) => board[row * 8 + i] = color + p);
  };
  setupRow(0, 'B');
  for (let i = 0; i < 8; i++) board[1 * 8 + i] = 'BP';
  for (let i = 0; i < 8; i++) board[6 * 8 + i] = 'WP';
  setupRow(7, 'W');

  return {
    board,
    turn: 'W',
    winner: null,
    active: true,
    isDraw: false,
    history: [],
    lastMove: null,
    inCheck: null,       // Which side is in check ('W' or 'B' or null)
    capturedPieces: { W: [], B: [] },
    moveCount: 0,
    castleRights: { WK: true, WQ: true, BK: true, BQ: true }
  };
}

function isValidMove(state, player, move) {
  const { from, to } = move;
  if (!state.active || player.symbol !== state.turn) return false;
  if (!from || !to) return false;
  if (from.x < 0 || from.x > 7 || from.y < 0 || from.y > 7) return false;
  if (to.x < 0 || to.x > 7 || to.y < 0 || to.y > 7) return false;

  const piece = state.board[from.y * 8 + from.x];
  if (!piece || piece[0] !== state.turn) return false;

  const target = state.board[to.y * 8 + to.x];
  if (target && target[0] === state.turn) return false;

  if (!isLegalPieceMove(state, piece, from, to, target)) return false;

  // Simulate the move and check if own king is left in check
  const simBoard = [...state.board];
  simBoard[to.y * 8 + to.x] = piece;
  simBoard[from.y * 8 + from.x] = null;
  if (isKingInCheck(simBoard, state.turn)) return false;

  return true;
}

function isLegalPieceMove(state, piece, from, to, target) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const type = piece[1];
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const color = piece[0];

  switch (type) {
    case 'P': {
      const dir = color === 'W' ? -1 : 1;
      const startRow = color === 'W' ? 6 : 1;
      // Normal forward move
      if (dx === 0 && !target) {
        if (dy === dir) return true;
        if (dy === dir * 2 && from.y === startRow) {
          return !state.board[(from.y + dir) * 8 + from.x];
        }
      }
      // Diagonal capture
      if (adx === 1 && dy === dir && target && target[0] !== color) return true;
      return false;
    }
    case 'R':
      if (dx !== 0 && dy !== 0) return false;
      return isPathClear(state.board, from, to);

    case 'B':
      if (adx !== ady) return false;
      return isPathClear(state.board, from, to);

    case 'Q':
      if (adx !== ady && dx !== 0 && dy !== 0) return false;
      return isPathClear(state.board, from, to);

    case 'N':
      return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);

    case 'K': {
      if (adx <= 1 && ady <= 1) return true;
      // Castling
      if (ady === 0 && adx === 2) {
        if (isKingInCheck(state.board, color)) return false;
        if (dx === 2) { // Kingside
          const key = color + 'K';
          if (!state.castleRights[key]) return false;
          const rookPos = from.y * 8 + 7;
          if (!state.board[rookPos] || state.board[rookPos] !== color + 'R') return false;
          if (!isPathClear(state.board, from, { x: 7, y: from.y })) return false;
          // Check squares king passes through
          const mid = [...state.board];
          mid[from.y * 8 + from.x + 1] = color + 'K';
          mid[from.y * 8 + from.x] = null;
          if (isKingInCheck(mid, color)) return false;
          return true;
        }
        if (dx === -2) { // Queenside
          const key = color + 'Q';
          if (!state.castleRights[key]) return false;
          const rookPos = from.y * 8;
          if (!state.board[rookPos] || state.board[rookPos] !== color + 'R') return false;
          if (!isPathClear(state.board, from, { x: 0, y: from.y })) return false;
          const mid = [...state.board];
          mid[from.y * 8 + from.x - 1] = color + 'K';
          mid[from.y * 8 + from.x] = null;
          if (isKingInCheck(mid, color)) return false;
          return true;
        }
      }
      return false;
    }
  }
  return false;
}

function isPathClear(board, from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (board[y * 8 + x]) return false;
    x += dx;
    y += dy;
  }
  return true;
}

function findKing(board, color) {
  for (let i = 0; i < 64; i++) {
    if (board[i] === color + 'K') return { x: i % 8, y: Math.floor(i / 8) };
  }
  return null;
}

function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  const enemy = color === 'W' ? 'B' : 'W';

  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p[0] !== enemy) continue;
    const from = { x: i % 8, y: Math.floor(i / 8) };
    if (canPieceAttack(board, p, from, king)) return true;
  }
  return false;
}

function canPieceAttack(board, piece, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const type = piece[1];
  const color = piece[0];

  switch (type) {
    case 'P': {
      const dir = color === 'W' ? -1 : 1;
      return adx === 1 && dy === dir;
    }
    case 'R':
      if (dx !== 0 && dy !== 0) return false;
      return isPathClear(board, from, to);
    case 'B':
      if (adx !== ady) return false;
      return isPathClear(board, from, to);
    case 'Q':
      if (adx !== ady && dx !== 0 && dy !== 0) return false;
      return isPathClear(board, from, to);
    case 'N':
      return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);
    case 'K':
      return adx <= 1 && ady <= 1;
  }
  return false;
}

function hasAnyLegalMove(state, color) {
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece || piece[0] !== color) continue;
    const from = { x: i % 8, y: Math.floor(i / 8) };
    for (let j = 0; j < 64; j++) {
      const to = { x: j % 8, y: Math.floor(j / 8) };
      if (i === j) continue;
      const target = state.board[j];
      if (target && target[0] === color) continue;
      if (!isLegalPieceMove(state, piece, from, to, target)) continue;
      // Simulate
      const sim = [...state.board];
      sim[j] = piece;
      sim[i] = null;
      if (!isKingInCheck(sim, color)) return true;
    }
  }
  return false;
}

function applyMove(state, player, move) {
  const { from, to } = move;
  const piece = state.board[from.y * 8 + from.x];
  const target = state.board[to.y * 8 + to.x];
  const color = piece[0];

  // Track captured pieces
  if (target) {
    const capturedBy = color === 'W' ? 'W' : 'B';
    state.capturedPieces[capturedBy].push(target);
  }

  // Move piece
  state.board[to.y * 8 + to.x] = piece;
  state.board[from.y * 8 + from.x] = null;

  // Handle castling move (move the rook too)
  if (piece[1] === 'K' && Math.abs(to.x - from.x) === 2) {
    if (to.x > from.x) { // Kingside
      state.board[to.y * 8 + 5] = state.board[to.y * 8 + 7];
      state.board[to.y * 8 + 7] = null;
    } else { // Queenside
      state.board[to.y * 8 + 3] = state.board[to.y * 8 + 0];
      state.board[to.y * 8 + 0] = null;
    }
  }

  // Update castling rights
  if (piece[1] === 'K') {
    state.castleRights[color + 'K'] = false;
    state.castleRights[color + 'Q'] = false;
  }
  if (piece[1] === 'R') {
    if (from.x === 0) state.castleRights[color + 'Q'] = false;
    if (from.x === 7) state.castleRights[color + 'K'] = false;
  }

  // Pawn Promotion (auto-promote to Queen)
  if (piece[1] === 'P') {
    const promoRow = color === 'W' ? 0 : 7;
    if (to.y === promoRow) {
      state.board[to.y * 8 + to.x] = color + 'Q';
    }
  }

  // Record history
  const fromStr = `${String.fromCharCode(97 + from.x)}${8 - from.y}`;
  const toStr = `${String.fromCharCode(97 + to.x)}${8 - to.y}`;
  const captureStr = target ? 'x' : '→';
  const moveStr = `${piece[1] === 'P' ? '' : piece[1]}${fromStr}${captureStr}${toStr}`;
  state.history.push({ move: moveStr, piece, symbol: state.turn });
  state.lastMove = { from, to };
  state.moveCount++;

  // Switch turn
  const nextTurn = state.turn === 'W' ? 'B' : 'W';
  state.turn = nextTurn;

  // Check / Checkmate / Stalemate detection
  const inCheck = isKingInCheck(state.board, nextTurn);
  state.inCheck = inCheck ? nextTurn : null;

  if (!hasAnyLegalMove(state, nextTurn)) {
    state.active = false;
    if (inCheck) {
      // Checkmate
      state.winner = color === 'W' ? 'W' : 'B';
      state.history[state.history.length - 1].move += '#';
    } else {
      // Stalemate
      state.isDraw = true;
    }
  } else if (inCheck) {
    state.history[state.history.length - 1].move += '+';
  }

  // Draw by insufficient material (K vs K)
  const remaining = state.board.filter(p => p !== null);
  if (remaining.length === 2) {
    state.active = false;
    state.isDraw = true;
  }

  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
