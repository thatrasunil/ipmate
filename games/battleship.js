function createInitialState() {
  return {
    players: {}, // { symbol: { board, hits, ships } }
    active: true,
    turn: 'P1',
    phase: 'placement', // placement or battle
    winner: null,
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  if (state.phase === 'placement') {
    return !state.players[player.symbol];
  }
  return state.turn === player.symbol && !state.winner;
}

function applyMove(state, player, move) {
  if (state.phase === 'placement') {
    state.players[player.symbol] = {
      board: move.board, // 10x10 binary grid
      hits: Array(10).fill().map(() => Array(10).fill(null)),
      ships: move.ships, // Ship definitions if needed
    };
    if (Object.keys(state.players).length === 2) {
      state.phase = 'battle';
    }
  } else {
    const opponentSymbol = player.symbol === 'P1' ? 'P2' : 'P1';
    const opponent = state.players[opponentSymbol];
    const { x, y } = move;

    if (opponent.hits[y][x] !== null) return state; // Already shot here

    if (opponent.board[y][x]) {
      opponent.hits[y][x] = 'hit';
      // Check win
      let allSunk = true;
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          if (opponent.board[r][c] && opponent.hits[r][c] !== 'hit') {
            allSunk = false;
            break;
          }
        }
        if (!allSunk) break;
      }
      if (allSunk) {
        state.winner = player.symbol;
        state.active = false;
      }
    } else {
      opponent.hits[y][x] = 'miss';
      state.turn = opponentSymbol;
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
