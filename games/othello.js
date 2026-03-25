function createInitialState() {
  const board = Array(64).fill(null);
  board[3 * 8 + 3] = 'white'; board[4 * 8 + 4] = 'white';
  board[3 * 8 + 4] = 'black'; board[4 * 8 + 3] = 'black';
  const possibleMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlips(board, r, c, 'black').length > 0) possibleMoves.push({ r, c });
    }
  }

  return { board, turn: 'black', active: true, winner: null, scores: { black: 2, white: 2 }, possibleMoves };
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
  const turnSymbol = state.turn; // 'black' or 'white'
  if (!state.active || player.symbol !== turnSymbol) return false;
  return getFlips(state.board, r, c, turnSymbol).length > 0;
}

function applyMove(state, player, move) {
  const { r, c } = move;
  const flips = getFlips(state.board, r, c, state.turn);

  state.board[r * 8 + c] = state.turn;
  for (const [fr, fc] of flips) {
    state.board[fr * 8 + fc] = state.turn;
  }

  const nextTurn = state.turn === 'black' ? 'white' : 'black';
  
  // Calculate potential moves for next player
  const getPossible = (t) => {
    const list = [];
    for (let ir = 0; ir < 8; ir++) {
      for (let ic = 0; ic < 8; ic++) {
        if (getFlips(state.board, ir, ic, t).length > 0) list.push({ r: ir, c: ic });
      }
    }
    return list;
  };

  let nextMoves = getPossible(nextTurn);
  if (nextMoves.length > 0) {
    state.turn = nextTurn;
    state.possibleMoves = nextMoves;
  } else {
    // Check if current player still has moves
    let currentMoves = getPossible(state.turn);
    if (currentMoves.length > 0) {
      state.possibleMoves = currentMoves;
    } else {
      // Game over
      state.active = false;
      state.possibleMoves = [];
      let blackCount = 0, whiteCount = 0;
      state.board.forEach(cell => {
        if (cell === 'black') blackCount++;
        if (cell === 'white') whiteCount++;
      });
      state.scores = { black: blackCount, white: whiteCount };
      if (blackCount > whiteCount) state.winner = 'black';
      else if (whiteCount > blackCount) state.winner = 'white';
      else state.winner = 'Draw';
    }
  }

  // Update real-time score
  let blackCount = 0, whiteCount = 0;
  state.board.forEach(cell => {
    if (cell === 'black') blackCount++;
    if (cell === 'white') whiteCount++;
  });
  state.scores = { black: blackCount, white: whiteCount };

  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
