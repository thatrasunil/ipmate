function createInitialState() {
  const board = Array(64).fill(null);
  board[3 * 8 + 3] = 'white'; board[4 * 8 + 4] = 'white';
  board[3 * 8 + 4] = 'black'; board[4 * 8 + 3] = 'black';
  return { board, turn: 'black', active: true, winner: null };
}

const directions = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

function getFlips(board, r, c, turn) {
  if (board[r * 8 + c] !== null) return [];
  const opponent = turn === 'black' ? 'white' : 'black';
  let allFlips = [];

  for (const [dr, dc] of directions) {
    let currentFlips = [];
    let nr = r + dr;
    let nc = c + dc;

    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === opponent) {
      currentFlips.push([nr, nc]);
      nr += dr;
      nc += dc;
    }

    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === turn) {
      allFlips = allFlips.concat(currentFlips);
    }
  }

  return allFlips;
}

function isValidMove(state, player, move) {
  const { r, c } = move;
  if (!state.active || player.symbol !== state.turn) return false;
  return getFlips(state.board, r, c, state.turn).length > 0;
}

function applyMove(state, player, move) {
  const { r, c } = move;
  const flips = getFlips(state.board, r, c, state.turn);

  state.board[r * 8 + c] = state.turn;
  for (const [fr, fc] of flips) {
    state.board[fr * 8 + fc] = state.turn;
  }

  const nextTurn = state.turn === 'black' ? 'white' : 'black';
  
  // Check if next player has any moves
  let nextHasMoves = false;
  for (let ir = 0; ir < 8; ir++) {
    for (let ic = 0; ic < 8; ic++) {
      if (getFlips(state.board, ir, ic, nextTurn).length > 0) {
        nextHasMoves = true;
        break;
      }
    }
    if (nextHasMoves) break;
  }

  if (nextHasMoves) {
    state.turn = nextTurn;
  } else {
    // Current player might still have moves if next player skipped
    let currentStillHasMoves = false;
    for (let ir = 0; ir < 8; ir++) {
      for (let ic = 0; ic < 8; ic++) {
        if (getFlips(state.board, ir, ic, state.turn).length > 0) {
          currentStillHasMoves = true;
          break;
        }
      }
      if (currentStillHasMoves) break;
    }

    if (!currentStillHasMoves) {
      // Game over
      state.active = false;
      let black = 0, white = 0;
      state.board.forEach(cell => {
        if (cell === 'black') black++;
        if (cell === 'white') white++;
      });
      if (black > white) state.winner = 'Black';
      else if (white > black) state.winner = 'White';
      else state.winner = 'Draw';
    }
  }

  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
