function createInitialState() {
  const board = Array(8).fill().map(() => Array(8).fill(null));
  // r=red, b=black
  for (let r = 0; r < 3; r++)
    for (let c = (r % 2 === 1 ? 0 : 1); c < 8; c += 2) board[r][c] = 'b';
  for (let r = 5; r < 8; r++)
    for (let c = (r % 2 === 1 ? 0 : 1); c < 8; c += 2) board[r][c] = 'r';

  return { board, turn: 'r', active: true, winner: null };
}

function isValidMove(state, player, move) {
  const { from, to } = move;
  if (!state.active || state.turn !== player.symbol) return false;
  
  const piece = state.board[from.y][from.x];
  if (!piece || piece.toLowerCase() !== state.turn) return false;
  if (state.board[to.y][to.x] !== null) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx !== ady) return false;

  const isKing = piece === piece.toUpperCase();
  const direction = piece.toLowerCase() === 'r' ? -1 : 1;

  // Normal move
  if (adx === 1) {
    if (!isKing && dy !== direction) return false;
    return true;
  }

  // Jump
  if (adx === 2) {
    if (!isKing && dy !== direction * 2) return false;
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    const midPiece = state.board[midY][midX];
    return midPiece && midPiece.toLowerCase() !== state.turn;
  }

  return false;
}

function applyMove(state, player, move) {
  const { from, to } = move;
  const piece = state.board[from.y][from.x];
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  state.board[to.y][to.x] = piece;
  state.board[from.y][from.x] = null;

  // Capture
  if (Math.abs(dx) === 2) {
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    state.board[midY][midX] = null;
  }

  // Promotion
  if ((piece === 'r' && to.y === 0) || (piece === 'b' && to.y === 7)) {
    state.board[to.y][to.x] = piece.toUpperCase();
  }

  // Check for winner
  const opponent = state.turn === 'r' ? 'b' : 'r';
  let opponentPieces = 0;
  state.board.forEach(row => row.forEach(cell => {
    if (cell && cell.toLowerCase() === opponent) opponentPieces++;
  }));

  if (opponentPieces === 0) {
    state.winner = state.turn === 'r' ? 'Red' : 'Black';
    state.active = false;
  } else {
    state.turn = opponent;
  }

  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
