function createInitialState() {
  return {
    word: '',
    guessed: [],
    wrong: 0,
    maxWrong: 6,
    active: true,
    winner: null,
    phase: 'choosing',
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  if (state.phase === 'choosing') {
    return player.symbol === 'P1' && move.word && move.word.length > 0;
  }
  return state.phase === 'guessing' && player.symbol === 'P2' && move.letter && !state.guessed.includes(move.letter.toLowerCase());
}

function applyMove(state, player, move) {
  if (state.phase === 'choosing') {
    state.word = move.word.toLowerCase();
    state.phase = 'guessing';
  } else {
    const letter = move.letter.toLowerCase();
    state.guessed.push(letter);
    if (!state.word.includes(letter)) {
      state.wrong++;
      if (state.wrong >= state.maxWrong) {
        state.active = false;
        state.winner = 'P1'; // Chooser wins
      }
    } else {
      const won = state.word.split('').every(l => !/[a-z]/.test(l) || state.guessed.includes(l));
      if (won) {
        state.active = false;
        state.winner = 'P2'; // Guesser wins
      }
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
