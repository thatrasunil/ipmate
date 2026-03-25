function createInitialState() {
  return {
    word: '',
    guessed: [],
    wrong: 0,
    maxWrong: 6,
    active: true,
    winner: null,
    phase: 'choosing',   // 'choosing' | 'guessing'
    turn: 'P1',          // P1 chooses, P2 guesses
    hint: '',            // optional hint from P1
    correctGuesses: 0,
    totalLetters: 0,
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  
  if (state.phase === 'choosing') {
    if (player.symbol !== 'P1') return false;
    if (!move.word || typeof move.word !== 'string') return false;
    const cleanWord = move.word.trim().toLowerCase();
    if (cleanWord.length < 2 || cleanWord.length > 20) return false;
    if (!/^[a-z\s]+$/.test(cleanWord)) return false;
    return true;
  }
  
  if (state.phase === 'guessing') {
    if (player.symbol !== 'P2') return false;
    if (!move.letter || typeof move.letter !== 'string') return false;
    const letter = move.letter.toLowerCase().trim();
    if (letter.length !== 1 || !/^[a-z]$/.test(letter)) return false;
    if (state.guessed.includes(letter)) return false;
    return true;
  }
  
  return false;
}

function applyMove(state, player, move) {
  if (state.phase === 'choosing') {
    const cleanWord = move.word.trim().toLowerCase();
    state.word = cleanWord;
    state.hint = move.hint || '';
    state.phase = 'guessing';
    state.turn = 'P2';
    
    // Count unique letters
    const uniqueLetters = new Set(cleanWord.split('').filter(l => /[a-z]/.test(l)));
    state.totalLetters = uniqueLetters.size;
    state.correctGuesses = 0;
  } else {
    const letter = move.letter.toLowerCase().trim();
    state.guessed.push(letter);
    
    if (!state.word.includes(letter)) {
      state.wrong++;
      if (state.wrong >= state.maxWrong) {
        state.active = false;
        state.winner = 'P1'; // Chooser wins
      }
    } else {
      // Count how many unique letters have been found
      const wordLetters = new Set(state.word.split('').filter(l => /[a-z]/.test(l)));
      const guessedLetters = new Set(state.guessed.filter(g => state.word.includes(g)));
      
      state.correctGuesses = guessedLetters.size;
      
      if (guessedLetters.size >= wordLetters.size) {
        state.active = false;
        state.winner = 'P2'; // Guesser wins
      }
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
