function createInitialState() {
  return {
    phase: 'battle',
    targets: [],
    scores: { P1: 0, P2: 0 },
    stats: { 
      P1: { hits: 0, misses: 0, accuracy: 100 },
      P2: { hits: 0, misses: 0, accuracy: 100 }
    },
    active: true,
    round: 1,
    maxRounds: 30, // 30 targets total?
    startTime: Date.now(),
    duration: 30000, // 30 seconds
    winner: null
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  return move.action === 'hit' || move.action === 'miss';
}

function applyMove(state, player, move) {
  const p = state.stats[player.symbol];
  if (move.action === 'hit') {
    p.hits++;
    state.scores[player.symbol] += 100;
  } else {
    p.misses++;
  }
  
  p.accuracy = Math.round((p.hits / (p.hits + p.misses)) * 100);
  
  // Game ends after time or max targets
  if (Date.now() - state.startTime > state.duration) {
    state.active = false;
    if (state.scores.P1 > state.scores.P2) state.winner = 'P1';
    else if (state.scores.P2 > state.scores.P1) state.winner = 'P2';
    else state.winner = 'Draw';
  }
  
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
