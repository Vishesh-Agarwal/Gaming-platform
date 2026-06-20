// Tic-Tac-Toe rules — pure, server-authoritative. No UI, no networking.
// Player indices: 0 = X, 1 = O.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

function createInitialState() {
  return { board: Array(9).fill(null), turn: 0 };
}

// move = { cell: 0..8 }
function applyMove(state, playerIndex, move) {
  if (getResult(state).over) return { error: 'Game is already over.' };
  if (state.turn !== playerIndex) return { error: 'Not your turn.' };
  const cell = move?.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return { error: 'Invalid cell.' };
  }
  if (state.board[cell] !== null) return { error: 'Cell already taken.' };

  const board = state.board.slice();
  board[cell] = playerIndex;
  return { state: { board, turn: playerIndex === 0 ? 1 : 0 } };
}

function getResult(state) {
  for (const [a, b, c] of LINES) {
    const v = state.board[a];
    if (v !== null && v === state.board[b] && v === state.board[c]) {
      return { over: true, winner: v, draw: false };
    }
  }
  if (state.board.every((c) => c !== null)) {
    return { over: true, winner: null, draw: true };
  }
  return { over: false, winner: null, draw: false };
}

export default {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
};
