function createInitialState() {
  return {
    board: Array(42).fill(null), // 6 rows * 7 columns flattened
    turn: 'R', // Red and Yellow
    winner: null,
    active: true,
    isDraw: false,
  };
}

function isValidMove(state, player, move) {
  const { col } = move;
  return (
    state.active &&
    player.symbol === state.turn &&
    col >= 0 && col < 7 &&
    state.board[col] === null // Top row is indices 0-6
  );
}

function applyMove(state, player, move) {
  const { col } = move;
  let row = -1;
  // Start from bottom row (row 5) and go up
  for (let r = 5; r >= 0; r--) {
    const idx = r * 7 + col;
    if (state.board[idx] === null) {
      row = r;
      state.board[idx] = state.turn;
      break;
    }
  }

  if (row !== -1 && checkWin(state.board, row, col, state.turn)) {
    state.winner = state.turn;
    state.active = false;
  } else if (state.board.every(c => c !== null)) {
    state.isDraw = true;
    state.active = false;
  } else {
    state.turn = state.turn === 'R' ? 'Y' : 'R';
  }
  return state;
}

function checkWin(board, r, c, s) {
  const check = (dr, dc) => {
    let count = 1;
    for (let i = 1; i < 4; i++) {
      let nr = r + dr * i, nc = c + dc * i;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr * 7 + nc] === s) count++;
      else break;
    }
    for (let i = 1; i < 4; i++) {
      let nr = r - dr * i, nc = c - dc * i;
      if (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr * 7 + nc] === s) count++;
      else break;
    }
    return count >= 4;
  };
  return check(0, 1) || check(1, 0) || check(1, 1) || check(1, -1);
}

module.exports = { createInitialState, isValidMove, applyMove };
