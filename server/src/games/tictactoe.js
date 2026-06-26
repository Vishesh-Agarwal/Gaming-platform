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
  { id: 'ultimate', name: 'Ultimate' },
];

function createInitialState(options) {
  const mode = options?.mode === 'shifting' ? 'shifting'
    : options?.mode === 'ultimate' ? 'ultimate'
    : 'classic';
  if (mode === 'ultimate') return createUltimate();
  return { board: Array(9).fill(null), turn: 0, mode };
}

// ---- Ultimate Tic-Tac-Toe ----
// Nine small boards in a 3x3 meta-grid. The cell you play in dictates which
// small board your opponent must play in next; if that board is already decided
// they may play anywhere. Win three small boards in a line to win the game.
function createUltimate() {
  return {
    mode: 'ultimate',
    boards: Array.from({ length: 9 }, () => Array(9).fill(null)),
    won: Array(9).fill(null), // per small board: null | 0 | 1 | 'draw'
    active: null,             // forced small board (0..8), or null = play anywhere
    turn: 0,
  };
}

function metaWinner(won) {
  for (const [a, b, c] of LINES) {
    const v = won[a];
    if ((v === 0 || v === 1) && v === won[b] && v === won[c]) return v;
  }
  return null;
}

function applyUltimate(state, playerIndex, move) {
  if (ultimateResult(state).over) return { error: 'Game is already over.' };
  if (state.turn !== playerIndex) return { error: 'Not your turn.' };
  const b = move?.board;
  const c = move?.cell;
  if (!Number.isInteger(b) || b < 0 || b > 8 || !Number.isInteger(c) || c < 0 || c > 8) {
    return { error: 'Invalid move.' };
  }
  if (state.active !== null && b !== state.active) return { error: 'Play in the highlighted board.' };
  if (state.won[b] !== null) return { error: 'That board is already finished.' };
  if (state.boards[b][c] !== null) return { error: 'Cell already taken.' };

  const boards = state.boards.map((bd, i) => (i === b ? bd.slice() : bd));
  boards[b][c] = playerIndex;

  const won = state.won.slice();
  const w = lineWinner(boards[b]);
  if (w !== null) won[b] = w;
  else if (boards[b].every((x) => x !== null)) won[b] = 'draw';

  // the cell index just played points at the next board; free move if it's decided
  const active = won[c] !== null ? null : c;
  return { state: { ...state, boards, won, active, turn: playerIndex === 0 ? 1 : 0 } };
}

function ultimateResult(state) {
  const w = metaWinner(state.won);
  if (w !== null) return { over: true, winner: w, draw: false };
  if (state.won.every((x) => x !== null)) return { over: true, winner: null, draw: true };
  return { over: false, winner: null, draw: false };
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
  if (state.mode === 'ultimate') return applyUltimate(state, playerIndex, move);
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

// Blitz move clock: every turn is capped at TURN_TIMEOUT_MS. When a player runs
// out of time the server plays a random legal move for them so the game can't
// stall on an idle/disconnected opponent.
const TURN_TIMEOUT_MS = 30000;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A random legal move for the side to move, in whatever mode/phase we're in.
function legalRandomMove(state) {
  const seat = state.turn;
  if (state.mode === 'ultimate') {
    const boards = state.active !== null && state.won[state.active] === null
      ? [state.active]
      : state.won.map((w, i) => (w === null ? i : -1)).filter((i) => i >= 0);
    const opts = [];
    for (const b of boards) {
      state.boards[b].forEach((v, c) => { if (v === null) opts.push({ board: b, cell: c }); });
    }
    return opts.length ? pick(opts) : null;
  }

  if (inMovePhase(state)) {
    // shifting slide phase: any of my pieces -> a connected empty cell
    const slides = [];
    state.board.forEach((v, from) => {
      if (v !== seat) return;
      for (const to of ADJ[from]) if (state.board[to] === null) slides.push({ from, to });
    });
    return slides.length ? pick(slides) : null;
  }

  // placement (classic + shifting placement): any empty cell
  const empties = state.board.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  return empties.length ? { cell: pick(empties) } : null;
}

// Turn expired — auto-play a random legal move for the current player.
function onTimeout(state) {
  const move = legalRandomMove(state);
  if (!move) return { state }; // nothing legal (e.g. stalemate); let getResult decide
  const out = applyMove(state, state.turn, move);
  return out.state ? { state: out.state } : { state };
}

function getResult(state) {
  if (state.mode === 'ultimate') return ultimateResult(state);
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
  turnTimeoutMs: TURN_TIMEOUT_MS,
  createInitialState,
  applyMove,
  getResult,
  onTimeout,
};
