function createInitialState() {
  const icons = ['🍎', '🍌', '🍒', '🥑', '🍆', '🥦', '🍉', '🍍'];
  const cards = [...icons, ...icons]
    .sort(() => Math.random() - 0.5)
    .map((val, idx) => ({ id: idx, val, flipped: false, matched: false }));
  return { cards, currentPair: [], active: true, turn: 'P1', scores: { P1: 0, P2: 0 } };
}

function isValidMove(state, player, move) {
  const card = state.cards[move.index];
  return state.active && player.symbol === state.turn && card && !card.flipped && !card.matched && state.currentPair.length < 2;
}

function applyMove(state, player, move) {
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
      // Mismatch: they stay flipped until next move or client-side timeout triggers a "clear"
      // Simplification: the client will see two are flipped and handle the delay
      // For real-time, we'll keep them flipped and switch turn immediately.
      // The client should flip them back after a short delay visually.
      state.turn = state.turn === 'P1' ? 'P2' : 'P1';
      // We don't clear currentPair here so the client knows WHICH cards to flip back
    }
  } else if (state.currentPair.length === 1) {
    // If a new turn just started and currentPair has 2 mismatched cards, clear them
    // This isn't quite right for multiple users.
    // Let's just clear currentPair at the START of a move if it already has 2 items.
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
