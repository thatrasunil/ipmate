function createInitialState() {
  const board = Array(64).fill(null);
  // r=red, b=black
  for (let r = 0; r < 3; r++)
    for (let c = (r % 2 === 1 ? 0 : 1); c < 8; c += 2) board[r * 8 + c] = 'b';
  for (let r = 5; r < 8; r++)
    for (let c = (r % 2 === 1 ? 0 : 1); c < 8; c += 2) board[r * 8 + c] = 'r';

  return { board, turn: 'r', active: true, winner: null };
}

function getAllValidMoves(state, symbol) {
  const moves = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = state.board[y * 8 + x];
      if (piece && piece.toLowerCase() === symbol) {
        // Check all 4 diagonal directions for 1 and 2 steps
        const dirs = [1, -1];
        dirs.forEach(dx => {
          dirs.forEach(dy => {
            // Normal move
            const normal = { from: { x, y }, to: { x: x + dx, y: y + dy } };
            if (isValidMoveInternal(state, symbol, normal)) moves.push(normal);
            // Jump
            const jump = { from: { x, y }, to: { x: x + dx * 2, y: y + dy * 2 } };
            if (isValidMoveInternal(state, symbol, jump)) moves.push(jump);
          });
        });
      }
    }
  }
  return moves;
}

function isValidMoveInternal(state, symbol, move) {
  const { from, to } = move;
  if (to.x < 0 || to.x >= 8 || to.y < 0 || to.y >= 8) return false;
  
  const piece = state.board[from.y * 8 + from.x];
  if (!piece || piece.toLowerCase() !== symbol) return false;
  if (state.board[to.y * 8 + to.x] !== null) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx !== ady) return false;

  const isKing = piece === piece.toUpperCase();
  const direction = piece.toLowerCase() === 'r' ? -1 : 1;

  if (adx === 1) {
    if (!isKing && dy !== direction) return false;
    return true;
  }

  if (adx === 2) {
    if (!isKing && dy !== direction * 2) return false;
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    const midPiece = state.board[midY * 8 + midX];
    return midPiece && midPiece.toLowerCase() !== symbol;
  }
  return false;
}

function isValidMove(state, player, move) {
  if (!state.active || state.turn !== player.symbol) return false;
  return isValidMoveInternal(state, player.symbol, move);
}

function applyMove(state, player, move) {
  const { from, to } = move;
  const piece = state.board[from.y * 8 + from.x];
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  state.board[to.y * 8 + to.x] = piece;
  state.board[from.y * 8 + from.x] = null;

  if (Math.abs(dx) === 2) {
    const midX = from.x + dx / 2;
    const midY = from.y + dy / 2;
    state.board[midY * 8 + midX] = null;
  }

  if ((piece === 'r' && to.y === 0) || (piece === 'b' && to.y === 7)) {
    state.board[to.y * 8 + to.x] = piece.toUpperCase();
  }

  const opponent = state.turn === 'r' ? 'b' : 'r';
  state.turn = opponent;

  // Check game over
  let redCount = 0, blackCount = 0;
  state.board.forEach(cell => {
    if (cell && cell.toLowerCase() === 'r') redCount++;
    if (cell && cell.toLowerCase() === 'b') blackCount++;
  });

  if (redCount === 0 || blackCount === 0) {
    state.winner = redCount === 0 ? 'Black' : 'Red';
    state.active = false;
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
