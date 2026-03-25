function createInitialState() {
  const icons = ['🍎', '🍌', '🍒', '🥑', '🍆', '🥦', '🍉', '🍍'];
  const cards = [...icons, ...icons]
    .sort(() => Math.random() - 0.5)
    .map((val, idx) => ({ id: idx, val, flipped: false, matched: false }));
  return { cards, currentPair: [], active: true, turn: 'P1', scores: { P1: 0, P2: 0 } };
}

function isValidMove(state, player, move) {
  const card = state.cards[move.index];
  const isMyTurn = state.active && player.symbol === state.turn;
  if (!isMyTurn || !card || card.flipped || card.matched) return false;
  
  // Allow if 0 or 1 card flipped, OR if 2 are flipped (will be cleared by applyMove)
  return state.currentPair.length <= 2;
}

function applyMove(state, player, move) {
  // If there's a pending mismatch, clear it before starting new move
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

  if (state.currentPair.length === 2) {
    const [i1, i2] = state.currentPair;
    if (state.cards[i1].val === state.cards[i2].val) {
      state.cards[i1].matched = true;
      state.cards[i2].matched = true;
      state.scores[state.turn]++;
      state.currentPair = [];
      
      // Check win
      if (state.cards.every(c => c.matched)) {
        state.active = false;
        if (state.scores.P1 > state.scores.P2) state.winner = 'P1';
        else if (state.scores.P2 > state.scores.P1) state.winner = 'P2';
        else state.winner = 'Draw';
      }
    } else {
      // Mismatch: keep flipped but switch turn
      state.turn = state.turn === 'P1' ? 'P2' : 'P1';
    }
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
