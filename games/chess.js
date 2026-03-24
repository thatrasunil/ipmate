function createInitialState() {
  const board = Array(64).fill(null);
  // R=Rook, N=Knight, B=Bishop, Q=Queen, K=King, P=Pawn
  const setupRow = (row, color) => {
    const pieces = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    pieces.forEach((p, i) => board[row * 8 + i] = color + p);
  };
  setupRow(0, 'B'); // Black
  for (let i = 0; i < 8; i++) board[1 * 8 + i] = 'BP';
  for (let i = 0; i < 8; i++) board[6 * 8 + i] = 'WP';
  setupRow(7, 'W'); // White

  return { board, turn: 'W', winner: null, active: true };
}

function isValidMove(state, player, move) {
  const { from, to } = move;
  if (!state.active || player.symbol !== state.turn) return false;
  
  const piece = state.board[from.y * 8 + from.x];
  if (!piece || piece[0] !== state.turn) return false;

  const target = state.board[to.y * 8 + to.x];
  if (target && target[0] === state.turn) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const type = piece[1];
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  switch (type) {
    case 'P':
      const dir = piece[0] === 'W' ? -1 : 1;
      // Normal move
      if (dx === 0 && !target) {
        if (dy === dir) return true;
        if (dy === dir * 2 && ((piece[0] === 'W' && from.y === 6) || (piece[0] === 'B' && from.y === 1))) {
          return !state.board[(from.y + dir) * 8 + from.x];
        }
      }
      // Capture
      if (adx === 1 && dy === dir && target && target[0] !== piece[0]) return true;
      return false;

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

    case 'K':
      return adx <= 1 && ady <= 1;
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

function applyMove(state, player, move) {
  const { from, to } = move;
  const piece = state.board[from.y * 8 + from.x];
  const target = state.board[to.y * 8 + to.x];

  if (target && target[1] === 'K') {
    state.winner = state.turn === 'W' ? 'White' : 'Black';
    state.active = false;
  }

  state.board[to.y * 8 + to.x] = piece;
  state.board[from.y * 8 + from.x] = null;
  state.turn = state.turn === 'W' ? 'B' : 'W';
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
