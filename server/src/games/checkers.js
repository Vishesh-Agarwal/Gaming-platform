// Checkers - 2-player draughts on an 8x8 board.

const SIZE = 8;

const idx = (r, c) => r * SIZE + c;
const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const opponent = (seat) => (seat === 0 ? 1 : 0);

function initialBoard() {
  const board = Array(SIZE * SIZE).fill(null);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < SIZE; c += 1) if ((r + c) % 2 === 1) board[idx(r, c)] = { owner: 1, king: false };
  }
  for (let r = 5; r < 8; r += 1) {
    for (let c = 0; c < SIZE; c += 1) if ((r + c) % 2 === 1) board[idx(r, c)] = { owner: 0, king: false };
  }
  return board;
}

export function createInitialState() {
  return {
    size: SIZE,
    board: initialBoard(),
    turn: 0,
    mustFrom: null,
    captured: [0, 0],
    lastMove: null,
    history: [],
    seq: 0,
  };
}

function dirsFor(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.owner === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function capturesFrom(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const { r, c } = rc(from);
  const out = [];
  for (const [dr, dc] of dirsFor(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const tr = r + dr * 2;
    const tc = c + dc * 2;
    if (!inside(tr, tc) || !inside(mr, mc)) continue;
    const mid = board[idx(mr, mc)];
    if (mid && mid.owner !== piece.owner && !board[idx(tr, tc)]) {
      out.push({ from, to: idx(tr, tc), over: idx(mr, mc) });
    }
  }
  return out;
}

function legalCaptures(board, seat) {
  const out = [];
  board.forEach((piece, i) => {
    if (piece?.owner === seat) out.push(...capturesFrom(board, i));
  });
  return out;
}

function legalMoves(board, seat) {
  const captures = legalCaptures(board, seat);
  if (captures.length) return captures;
  const out = [];
  board.forEach((piece, from) => {
    if (piece?.owner !== seat) return;
    const { r, c } = rc(from);
    for (const [dr, dc] of dirsFor(piece)) {
      const tr = r + dr;
      const tc = c + dc;
      if (inside(tr, tc) && !board[idx(tr, tc)]) out.push({ from, to: idx(tr, tc), over: null });
    }
  });
  return out;
}

function crowned(piece, to) {
  const { r } = rc(to);
  return piece.king || (piece.owner === 0 && r === 0) || (piece.owner === 1 && r === SIZE - 1);
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const from = Number(move?.from);
  const to = Number(move?.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= 64 || to < 0 || to >= 64) {
    return { error: 'Choose a valid move.' };
  }
  if (state.mustFrom !== null && from !== state.mustFrom) return { error: 'Continue the capture with the same piece.' };
  const piece = state.board[from];
  if (!piece || piece.owner !== seat) return { error: 'Choose one of your pieces.' };
  if (state.board[to]) return { error: 'Target square is occupied.' };

  const captures = state.mustFrom !== null ? capturesFrom(state.board, from) : legalCaptures(state.board, seat);
  const legal = captures.length ? captures : legalMoves(state.board, seat);
  const chosen = legal.find((m) => m.from === from && m.to === to);
  if (!chosen) return { error: captures.length ? 'You must capture.' : 'Illegal move.' };

  const board = state.board.map((p) => (p ? { ...p } : null));
  const moved = { ...piece, king: crowned(piece, to) };
  board[from] = null;
  board[to] = moved;
  const captured = state.captured.slice();
  let mustFrom = null;
  let nextTurn = opponent(seat);
  if (chosen.over !== null) {
    board[chosen.over] = null;
    captured[seat] += 1;
    const more = capturesFrom(board, to);
    if (more.length && moved.king === piece.king) {
      mustFrom = to;
      nextTurn = seat;
    }
  }

  return {
    state: {
      ...state,
      board,
      turn: nextTurn,
      mustFrom,
      captured,
      lastMove: { from, to, by: seat, captured: chosen.over },
      history: [...(state.history || []).slice(-9), { by: seat, from, to, captured: chosen.over !== null }],
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  const counts = [0, 0];
  state.board.forEach((piece) => { if (piece) counts[piece.owner] += 1; });
  if (counts[0] === 0) return { over: true, winner: 1, draw: false, scores: state.captured };
  if (counts[1] === 0) return { over: true, winner: 0, draw: false, scores: state.captured };
  const moves = legalMoves(state.board, state.turn);
  if (moves.length === 0) return { over: true, winner: opponent(state.turn), draw: false, scores: state.captured };
  return { over: false, winner: null, draw: false, scores: state.captured };
}

export default {
  id: 'checkers',
  name: 'Checkers',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
};
