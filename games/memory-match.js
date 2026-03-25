function createInitialState() {
  const icons = ['🍎', '🍌', '🍒', '🥑', '🍆', '🥦', '🍉', '🍍'];
  const cards = [...icons, ...icons]
    .sort(() => Math.random() - 0.5)
    .map((val, idx) => ({ id: idx, val, flipped: false, matched: false }));
  
  return {
    cards,
    currentPair: [],
    active: true,
    turn: 'P1',
    scores: { P1: 0, P2: 0 },
    winner: null,
    isDraw: false,
    totalPairs: icons.length,
    lastFlip: null,       // timestamp of last flip for animation timing
    comboCount: 0,        // consecutive matches by same player
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  if (player.symbol !== state.turn) return false;
  
  const { index } = move;
  if (typeof index !== 'number' || index < 0 || index >= state.cards.length) return false;
  
  const card = state.cards[index];
  if (!card || card.matched) return false;
  
  // Can't flip an already-flipped card in current pair
  if (state.currentPair.includes(index)) return false;
  
  // Allow flipping if 0 or 1 card revealed. If 2 are revealed, they get cleared first.
  return state.currentPair.length <= 2;
}

function applyMove(state, player, move) {
  // If there's a pending mismatch from previous turn, clear it
  if (state.currentPair.length === 2) {
    const [i1, i2] = state.currentPair;
    if (state.cards[i1].val !== state.cards[i2].val) {
      state.cards[i1].flipped = false;
      state.cards[i2].flipped = false;
    }
    state.currentPair = [];
  }

  const card = state.cards[move.index];
  card.flipped = true;
  state.currentPair.push(move.index);
  state.lastFlip = Date.now();

  if (state.currentPair.length === 2) {
    const [i1, i2] = state.currentPair;
    if (state.cards[i1].val === state.cards[i2].val) {
      // Match found!
      state.cards[i1].matched = true;
      state.cards[i2].matched = true;
      state.scores[state.turn]++;
      state.comboCount++;
      state.currentPair = [];
      
      // Check game end
      const matchedCount = state.cards.filter(c => c.matched).length;
      if (matchedCount === state.cards.length) {
        state.active = false;
        if (state.scores.P1 > state.scores.P2) {
          state.winner = 'P1';
        } else if (state.scores.P2 > state.scores.P1) {
          state.winner = 'P2';
        } else {
          state.isDraw = true;
          state.winner = 'Draw';
        }
      }
      // Same player keeps their turn on a match
    } else {
      // Mismatch - switch turn, reset combo
      state.comboCount = 0;
      state.turn = state.turn === 'P1' ? 'P2' : 'P1';
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
