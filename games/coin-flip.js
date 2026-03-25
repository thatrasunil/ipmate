function createInitialState() {
  return {
    flipped: false,
    result: null,
    active: true,
    bets: {}, // { symbol: 'heads'|'tails' }
    winner: null
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  if (move.action === 'bet') return !state.bets[player.symbol];
  if (move.action === 'flip') return Object.keys(state.bets).length >= 1;
  return false;
}

function applyMove(state, player, move) {
  if (move.action === 'bet') {
    state.bets[player.symbol] = move.choice;
  } else if (move.action === 'flip') {
    state.flipped = true;
    state.result = Math.random() < 0.5 ? 'heads' : 'tails';
    state.active = false;
    
    // Check winners
    const winners = [];
    Object.entries(state.bets).forEach(([symbol, choice]) => {
      if (choice === state.result) winners.push(symbol);
    });
    
    if (winners.length === 1) state.winner = winners[0];
    else if (winners.length === 2) state.winner = 'Draw';
    else state.winner = 'House Wins';
  }
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
