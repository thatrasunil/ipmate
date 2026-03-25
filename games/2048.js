function createInitialState() {
  const board = Array(16).fill(null);
  addRandomTile(board);
  addRandomTile(board);
  
  return {
    board,
    score: 0,
    active: true,
    winner: null,
    moveCount: 0,
    bestTile: 2,
    players: {} // { symbol: { board, score, bestTile, moveCount } }
  };
}

function addRandomTile(board) {
  const empty = [];
  board.forEach((val, i) => { if (val === null) empty.push(i); });
  if (empty.length > 0) {
    const idx = empty[Math.floor(Math.random() * empty.length)];
    board[idx] = Math.random() < 0.9 ? 2 : 4;
  }
}

function isValidMove(state, player, move) {
  if (!state.active) return false;
  const directions = ['up', 'down', 'left', 'right'];
  if (!directions.includes(move.direction)) return false;
  
  // We'll allow each player to have their own board for a competitive "race"
  const playerState = state.players[player.symbol] || { board: [...state.board], score: 0 };
  const { canMove } = simulateMove(playerState.board, move.direction);
  return canMove;
}

function simulateMove(board, direction) {
  let newBoard = [...board];
  let scoreGain = 0;
  let changed = false;

  const getIdx = (r, c) => r * 4 + c;

  const traverse = (callback) => {
    if (direction === 'up' || direction === 'down') {
      for (let c = 0; c < 4; c++) {
        let col = [];
        for (let r = 0; r < 4; r++) col.push(newBoard[getIdx(r, c)]);
        if (direction === 'down') col.reverse();
        
        const { result, score, changed: colChanged } = mergeArray(col);
        if (direction === 'down') result.reverse();
        
        for (let r = 0; r < 4; r++) {
          if (newBoard[getIdx(r, c)] !== result[r]) changed = true;
          newBoard[getIdx(r, c)] = result[r];
        }
        scoreGain += score;
      }
    } else {
      for (let r = 0; r < 4; r++) {
        let row = [];
        for (let c = 0; c < 4; c++) row.push(newBoard[getIdx(r, c)]);
        if (direction === 'right') row.reverse();
        
        const { result, score, changed: rowChanged } = mergeArray(row);
        if (direction === 'right') result.reverse();
        
        for (let c = 0; c < 4; c++) {
          if (newBoard[getIdx(r, c)] !== result[c]) changed = true;
          newBoard[getIdx(r, c)] = result[c];
        }
        scoreGain += score;
      }
    }
  };

  traverse();
  return { newBoard, scoreGain, canMove: changed };
}

function mergeArray(arr) {
  let filtered = arr.filter(x => x !== null);
  let result = [];
  let score = 0;
  let changed = false;

  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const newVal = filtered[i] * 2;
      result.push(newVal);
      score += newVal;
      i++;
      changed = true;
    } else {
      result.push(filtered[i]);
    }
  }

  while (result.length < 4) result.push(null);
  
  // Check if actually changed from original (including spacing)
  for(let i=0; i<4; i++) if(result[i] !== arr[i]) changed = true;

  return { result, score, changed };
}

function applyMove(state, player, move) {
  if (!state.players[player.symbol]) {
    state.players[player.symbol] = {
      board: [...state.board],
      score: 0,
      bestTile: 2,
      moveCount: 0
    };
  }

  const p = state.players[player.symbol];
  const { newBoard, scoreGain } = simulateMove(p.board, move.direction);
  
  p.board = newBoard;
  p.score += scoreGain;
  p.moveCount++;
  addRandomTile(p.board);
  
  p.bestTile = Math.max(...p.board.map(v => v || 0));

  // Check if player reached 2048
  if (p.bestTile >= 2048) {
    state.active = false;
    state.winner = player.symbol;
  }

  // Check for game over (no moves left)
  if (!canMoveAnywhere(p.board)) {
    p.gameOver = true;
    const allOver = Object.values(state.players).every(pl => pl.gameOver);
    if (allOver && Object.keys(state.players).length >= 2) {
      state.active = false;
      // Winner is highest score
      const p1 = state.players['P1'];
      const p2 = state.players['P2'];
      if (p1.score > p2.score) state.winner = 'P1';
      else if (p2.score > p1.score) state.winner = 'P2';
      else state.winner = 'Draw';
    }
  }

  return state;
}

function canMoveAnywhere(board) {
  const directions = ['up', 'down', 'left', 'right'];
  for (const dir of directions) {
    const { canMove } = simulateMove(board, dir);
    if (canMove) return true;
  }
  return false;
}

module.exports = { createInitialState, isValidMove, applyMove };
