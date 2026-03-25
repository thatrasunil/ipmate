function createInitialState() {
  return {
    players: {},   // { symbol: { board, hits, ships, shipCount } }
    active: true,
    turn: 'P1',
    phase: 'placement', // 'placement' | 'battle'
    winner: null,
    totalShipCells: 5,
    lastShot: null, // { x, y, result: 'hit'|'miss' }
  };
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  
  if (state.phase === 'placement') {
    // Player can only place if they haven't placed yet
    if (state.players[player.symbol]) return false;
    
    // Validate board
    if (!move.board || !Array.isArray(move.board) || move.board.length !== 100) return false;
    
    // Count ship cells - must be exactly 5
    const shipCells = move.board.filter(x => x).length;
    if (shipCells !== 5) return false;
    
    return true;
  }
  
  if (state.phase === 'battle') {
    if (state.turn !== player.symbol || state.winner) return false;
    
    const { x, y } = move;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (x < 0 || x > 9 || y < 0 || y > 9) return false;
    
    // Can't shoot where you've already shot
    const opponentSymbol = player.symbol === 'P1' ? 'P2' : 'P1';
    const opponent = state.players[opponentSymbol];
    if (!opponent) return false;
    
    const idx = y * 10 + x;
    if (opponent.hits[idx] !== null) return false;
    
    return true;
  }
  
  return false;
}

function applyMove(state, player, move) {
  if (state.phase === 'placement') {
    state.players[player.symbol] = {
      board: move.board,
      hits: Array(100).fill(null),
      ships: move.ships || [],
      shipCount: move.board.filter(x => x).length,
    };
    
    // Both players placed? Begin battle
    if (Object.keys(state.players).length === 2) {
      state.phase = 'battle';
    }
    return state;
  }
  
  // Battle phase
  const opponentSymbol = player.symbol === 'P1' ? 'P2' : 'P1';
  const opponent = state.players[opponentSymbol];
  const { x, y } = move;
  const idx = y * 10 + x;

  if (opponent.hits[idx] !== null) return state;

  if (opponent.board[idx]) {
    opponent.hits[idx] = 'hit';
    state.lastShot = { x, y, result: 'hit', by: player.symbol };
    
    // Check win: all ship cells hit
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
    // On a hit, player gets another turn (stay on same turn)
  } else {
    opponent.hits[idx] = 'miss';
    state.lastShot = { x, y, result: 'miss', by: player.symbol };
    // Switch turn on miss
    state.turn = opponentSymbol;
  }
  
  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
