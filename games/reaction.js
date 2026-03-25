function createInitialState() {
  return {
    phase: 'waiting', // 'waiting' | 'prep' | 'go' | 'result'
    startTime: 0,
    results: {}, // { symbol: [ms1, ms2, ...] }
    active: true,
    turn: 'P1',
    round: 1,
    maxRounds: 5,
    lastClick: null, // { symbol, time, valid: true|false }
    delay: 0
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  return move.action === 'click';
}

function applyMove(state, player, move) {
  const now = Date.now();
  
  if (state.phase === 'waiting' || state.phase === 'prep') {
    // Early click!
    state.results[player.symbol] = state.results[player.symbol] || [];
    state.results[player.symbol].push('foul');
    state.lastClick = { symbol: player.symbol, time: now, valid: false };
    
    // If both clicked or someone fouled, show result
    checkRoundEnd(state);
  } else if (state.phase === 'go') {
    const reactionTime = now - state.startTime;
    state.results[player.symbol] = state.results[player.symbol] || [];
    state.results[player.symbol].push(reactionTime);
    state.lastClick = { symbol: player.symbol, time: now, valid: true, ms: reactionTime };
    
    checkRoundEnd(state);
  } else if (state.phase === 'result') {
    // Both players must signal "Ready" for next round? 
    // For now, let's keep it simple: first one to click resets the round if both finished
    if (Object.keys(state.results).length >= 2 && state.results['P1'].length === state.results['P2'].length) {
        startNewRound(state);
    }
  }

  return state;
}

function checkRoundEnd(state) {
  const p1 = state.results['P1'] || [];
  const p2 = state.results['P2'] || [];
  
  if (p1.length === state.round && p2.length === state.round) {
    state.phase = 'result';
    if (state.round >= state.maxRounds) {
      state.active = false;
      calculateWinner(state);
    }
  }
}

function startNewRound(state) {
  state.round++;
  state.phase = 'waiting';
  state.delay = 2000 + Math.random() * 3000;
  // The server-side doesn't have a timer, so we rely on the client or a background task
  // But in this architecture, we'll let the client that "resets" provide the trigger?
  // Actually, we can use the `gameState` to store when the 'GO' should happen.
  state.goAt = Date.now() + state.delay;
}

function calculateWinner(state) {
  const getAvg = (list) => {
    const valid = list.filter(x => typeof x === 'number');
    if (valid.length === 0) return 9999;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  };
  
  const avg1 = getAvg(state.results['P1'] || []);
  const avg2 = getAvg(state.results['P2'] || []);
  
  if (avg1 < avg2) state.winner = 'P1';
  else if (avg2 < avg1) state.winner = 'P2';
  else state.winner = 'Draw';
}

module.exports = { createInitialState, isValidMove, applyMove };
