// Connect Four - 2-player, turn-based, server-authoritative.
// Board columns are stored bottom-up: board[col][row] = seat index.

const COLS = 7;
const ROWS = 6;
const MODES = [
  { id: 'classic', name: 'Classic' },
  { id: 'popout', name: 'PopOut' },
  { id: 'five', name: 'Five-in-a-Row' },
];

function modeFrom(options) {
  return MODES.some((m) => m.id === options?.mode) ? options.mode : 'classic';
}

function targetFor(mode) {
  return mode === 'five' ? 5 : 4;
}

export function createInitialState(options) {
  const mode = modeFrom(options);
  return {
    mode,
    target: targetFor(mode),
    cols: COLS,
    rows: ROWS,
    board: Array.from({ length: COLS }, () => []),
    turn: 0,
    lastDrop: null,
    seq: 0,
  };
}

function cellAt(board, col, row) {
  if (!board[col] || row < 0 || row >= board[col].length) return null;
  return board[col][row];
}

export function winnerFrom(board, cols = COLS, rows = ROWS, target = 4) {
  return winningLine(board, cols, rows, target)?.owner ?? null;
}

export function winningLine(board, cols = COLS, rows = ROWS, target = 4) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const owner = cellAt(board, col, row);
      if (owner === null) continue;
      for (const [dc, dr] of dirs) {
        const line = [{ col, row }];
        let run = 1;
        while (cellAt(board, col + dc * run, row + dr * run) === owner) {
          line.push({ col: col + dc * run, row: row + dr * run });
          run += 1;
        }
        if (run >= target) return { owner, cells: line.slice(0, target) };
      }
    }
  }
  return null;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };

  const col = Number(move?.col);
  if (!Number.isInteger(col) || col < 0 || col >= state.cols) {
    return { error: 'Choose a valid column.' };
  }
  const board = state.board.map((stack) => stack.slice());
  let row;
  let action = 'drop';

  if (move?.action === 'pop') {
    if (state.mode !== 'popout') return { error: 'PopOut is not enabled.' };
    if (board[col].length === 0) return { error: 'Column is empty.' };
    if (board[col][0] !== seat) return { error: 'You can only pop your own bottom disc.' };
    board[col].shift();
    row = 0;
    action = 'pop';
  } else {
    if (state.board[col].length >= state.rows) return { error: 'Column is full.' };
    board[col].push(seat);
    row = board[col].length - 1;
  }

  return {
    state: {
      ...state,
      board,
      turn: seat === 0 ? 1 : 0,
      lastDrop: { col, row, by: seat, action },
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  const line = winningLine(state.board, state.cols, state.rows, state.target || targetFor(state.mode));
  if (line) return { over: true, winner: line.owner, draw: false, line: line.cells };

  const full = state.board.every((stack) => stack.length >= state.rows);
  if (full) return { over: true, winner: null, draw: true };

  return { over: false, winner: null, draw: false };
}

export default {
  id: 'connect4',
  name: 'Connect Four',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  modes: MODES,
  createInitialState,
  applyMove,
  getResult,
};
