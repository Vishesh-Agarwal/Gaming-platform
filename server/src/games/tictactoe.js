// Tic-Tac-Toe rules — pure, server-authoritative. No UI, no networking.
// Player indices: 0 = X, 1 = O.
//
// Two modes (chosen at invite time, stored on state.mode):
//   classic  — standard 3x3; fill three in a row; full board = draw.
//   shifting — Three Men's Morris: each player places 3 pieces, then on every
//              turn SLIDES one of their pieces to a connected empty cell. No
//              draw; if the side to move can't slide, it loses.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

// Classic Three Men's Morris adjacency (moves run along the drawn lines).
const ADJ = {
  0: [1, 3, 4],
  1: [0, 2, 4],
  2: [1, 5, 4],
  3: [0, 6, 4],
  4: [0, 1, 2, 3, 5, 6, 7, 8],
  5: [2, 8, 4],
  6: [3, 7, 4],
  7: [6, 8, 4],
  8: [5, 7, 4],
};

const PIECES_PER_PLAYER = 3;

const MODES = [
  { id: 'classic', name: 'Classic' },
  { id: 'shifting', name: 'Shifting' },
];

function createInitialState(options) {
  const mode = options?.mode === 'shifting' ? 'shifting' : 'classic';
  return { board: Array(9).fill(null), turn: 0, mode };
}

function lineWinner(board) {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) return v;
  }
  return null;
}

const inMovePhase = (state) =>
  state.mode === 'shifting' && state.board.filter((c) => c !== null).length >= 2 * PIECES_PER_PLAYER;

// move = { cell } during placement (and all of classic), or { from, to } when sliding.
function applyMove(state, playerIndex, move) {
  if (getResult(state).over) return { error: 'Game is already over.' };
  if (state.turn !== playerIndex) return { error: 'Not your turn.' };
  const board = state.board;

  if (!inMovePhase(state)) {
    // placement (classic always lands here)
    const cell = move?.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { error: 'Invalid cell.' };
    if (board[cell] !== null) return { error: 'Cell already taken.' };
    if (state.mode === 'shifting') {
      const mine = board.filter((c) => c === playerIndex).length;
      if (mine >= PIECES_PER_PLAYER) return { error: 'All pieces placed — slide one instead.' };
    }
    const nb = board.slice();
    nb[cell] = playerIndex;
    return { state: { ...state, board: nb, turn: playerIndex === 0 ? 1 : 0 } };
  }

  // shifting move phase: slide a piece to a connected empty cell
  const { from, to } = move || {};
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return { error: 'Pick one of your pieces, then a connected empty cell.' };
  }
  if (board[from] !== playerIndex) return { error: 'That is not your piece.' };
  if (board[to] !== null) return { error: 'That cell is taken.' };
  if (!ADJ[from]?.includes(to)) return { error: 'You can only slide to a connected empty cell.' };

  const nb = board.slice();
  nb[to] = playerIndex;
  nb[from] = null;
  return { state: { ...state, board: nb, turn: playerIndex === 0 ? 1 : 0 } };
}

function getResult(state) {
  const { board, mode } = state;

  const w = lineWinner(board);
  if (w !== null) return { over: true, winner: w, draw: false };

  if (mode === 'shifting') {
    if (inMovePhase(state)) {
      // side to move with no legal slide loses (stalemate guard)
      const mover = state.turn;
      const canMove = board.some(
        (v, i) => v === mover && ADJ[i].some((j) => board[j] === null)
      );
      if (!canMove) return { over: true, winner: mover === 0 ? 1 : 0, draw: false };
    }
    return { over: false, winner: null, draw: false };
  }

  if (board.every((c) => c !== null)) return { over: true, winner: null, draw: true };
  return { over: false, winner: null, draw: false };
}

export default {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  modes: MODES,
  createInitialState,
  applyMove,
  getResult,
};
