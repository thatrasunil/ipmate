function createInitialState() {
  return {
    board: Array(9).fill(null),
    turn: 'X',
    winner: null,
    active: true,
    isDraw: false,
  };
}

function isValidMove(state, player, move) {
  const { index } = move;
  return (
    state.active &&
    !state.winner &&
    !state.isDraw &&
    player.symbol === state.turn &&
    Number.isInteger(index) &&
    index >= 0 &&
    index <= 8 &&
    state.board[index] === null
  );
}

function applyMove(state, player, move) {
  const { index } = move;
  state.board[index] = player.symbol;

  const winner = checkWinner(state.board);
  const isDraw = !winner && state.board.every((cell) => cell !== null);

  state.winner = winner;
  state.isDraw = isDraw;
  state.active = !winner && !isDraw;
  state.turn = state.turn === 'X' ? 'O' : 'X';

  return state;
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

module.exports = {
  createInitialState,
  isValidMove,
  applyMove,
};
