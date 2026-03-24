function createInitialState() {
  return {
    moves: {}, // { symbol: 'rock' }
    active: true,
    winner: null,
    draw: false,
  };
}

function isValidMove(state, player, move) {
  const validMoves = ['rock', 'paper', 'scissors'];
  return state.active && validMoves.includes(move.choice) && !state.moves[player.symbol];
}

function applyMove(state, player, move) {
  state.moves[player.symbol] = move.choice;

  const symbols = Object.keys(state.moves);
  if (symbols.length === 2) {
    const s1 = 'P1';
    const s2 = 'P2';
    const m1 = state.moves[s1];
    const m2 = state.moves[s2];

    if (m1 === m2) {
      state.draw = true;
    } else if (
      (m1 === 'rock' && m2 === 'scissors') ||
      (m1 === 'paper' && m2 === 'rock') ||
      (m1 === 'scissors' && m2 === 'paper')
    ) {
      state.winner = s1;
    } else {
      state.winner = s2;
    }
    state.active = false;
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
