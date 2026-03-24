function createInitialState() {
  const size = 4; // 4x4 grid of dots = 3x3 boxes
  return {
    size,
    lines: { h: {}, v: {} }, // 'r-c': symbol
    boxes: Array(size - 1).fill().map(() => Array(size - 1).fill(null)),
    turn: 'P1',
    scores: { P1: 0, P2: 0 },
    active: true,
    winner: null
  };
}

function isValidMove(state, player, move) {
  if (!state.active || state.turn !== player.symbol) return false;
  const { type, r, c } = move;
  const key = `${r}-${c}`;
  return !state.lines[type][key];
}

function applyMove(state, player, move) {
  const { type, r, c } = move;
  const key = `${r}-${c}`;
  state.lines[type][key] = state.turn;

  let boxCompleted = false;
  const size = state.size;

  // Check boxes affected by this line
  const checkAndFillBox = (br, bc) => {
    if (br < 0 || bc < 0 || br >= size - 1 || bc >= size - 1) return false;
    if (state.boxes[br][bc]) return false;

    // A box is completed if all 4 lines are present
    const top = state.lines.h[`${br}-${bc}`];
    const bottom = state.lines.h[`${br + 1}-${bc}`];
    const left = state.lines.v[`${br}-${bc}`];
    const right = state.lines.v[`${br}-${bc + 1}`];

    if (top && bottom && left && right) {
      state.boxes[br][bc] = state.turn;
      state.scores[state.turn]++;
      return true;
    }
    return false;
  };

  if (type === 'h') {
    if (checkAndFillBox(r - 1, c)) boxCompleted = true;
    if (checkAndFillBox(r, c)) boxCompleted = true;
  } else {
    if (checkAndFillBox(r, c - 1)) boxCompleted = true;
    if (checkAndFillBox(r, c)) boxCompleted = true;
  }

  // Check game over
  const totalBoxes = (size - 1) * (size - 1);
  if (state.scores.P1 + state.scores.P2 === totalBoxes) {
    state.active = false;
    if (state.scores.P1 > state.scores.P2) state.winner = 'P1';
    else if (state.scores.P2 > state.scores.P1) state.winner = 'P2';
    else state.winner = 'Draw';
  } else if (!boxCompleted) {
    state.turn = state.turn === 'P1' ? 'P2' : 'P1';
  }

  return state;
}

module.exports = { createInitialState, isValidMove, applyMove };
