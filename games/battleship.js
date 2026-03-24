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
      board: move.board, // 100-element binary array
      hits: Array(100).fill(null),
      ships: move.ships || [],
    };
    if (Object.keys(state.players).length === 2) {
      state.phase = 'battle';
    }
  } else {
    const opponentSymbol = player.symbol === 'P1' ? 'P2' : 'P1';
    const opponent = state.players[opponentSymbol];
    const { x, y } = move;
    const idx = y * 10 + x;

    if (opponent.hits[idx] !== null) return state; // Already shot here

    if (opponent.board[idx]) {
      opponent.hits[idx] = 'hit';
      // Check win
      let allSunk = true;
      for (let i = 0; i < 100; i++) {
        if (opponent.board[i] && opponent.hits[i] !== 'hit') {
          allSunk = false;
          break;
        }
      }
      if (allSunk) {
        state.winner = player.symbol;
        state.active = false;
      }
    } else {
      opponent.hits[idx] = 'miss';
      state.turn = opponentSymbol;
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
