// Reversi / Othello - 2-player server-authoritative board game.

const SIZE = 8;
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

const idx = (r, c) => r * SIZE + c;
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const opponent = (seat) => (seat === 0 ? 1 : 0);

export function createInitialState() {
  const board = Array(SIZE * SIZE).fill(null);
  board[idx(3, 3)] = 1;
  board[idx(3, 4)] = 0;
  board[idx(4, 3)] = 0;
  board[idx(4, 4)] = 1;
  return {
    size: SIZE,
    board,
    turn: 0,
    passes: 0,
    lastMove: null,
    history: [],
    scores: [2, 2],
    seq: 0,
  };
}

function flipsFor(board, seat, pos) {
  if (board[pos] !== null) return [];
  const r0 = Math.floor(pos / SIZE);
  const c0 = pos % SIZE;
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (inside(r, c) && board[idx(r, c)] === opponent(seat)) {
      line.push(idx(r, c));
      r += dr;
      c += dc;
    }
    if (line.length && inside(r, c) && board[idx(r, c)] === seat) flips.push(...line);
  }
  return flips;
}

export function legalMoves(board, seat) {
  return board
    .map((cell, pos) => (cell === null && flipsFor(board, seat, pos).length ? pos : -1))
    .filter((pos) => pos >= 0);
}

function score(board) {
  const scores = [0, 0];
  board.forEach((cell) => { if (cell !== null) scores[cell] += 1; });
  return scores;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const legal = legalMoves(state.board, seat);

  if (move?.pass) {
    if (legal.length) return { error: 'You have a legal move.' };
    return {
      state: {
        ...state,
        turn: opponent(seat),
        passes: state.passes + 1,
        lastMove: { seat, pass: true },
        history: [...(state.history || []).slice(-9), { seat, pass: true }],
        seq: state.seq + 1,
      },
    };
  }

  const pos = Number(move?.pos);
  if (!Number.isInteger(pos) || pos < 0 || pos >= SIZE * SIZE) return { error: 'Choose a valid square.' };
  const flips = flipsFor(state.board, seat, pos);
  if (!flips.length) return { error: 'Illegal move.' };

  const board = state.board.slice();
  board[pos] = seat;
  for (const p of flips) board[p] = seat;
  let nextTurn = opponent(seat);
  let passes = 0;
  if (legalMoves(board, nextTurn).length === 0 && legalMoves(board, seat).length > 0) {
    nextTurn = seat;
    passes = 1;
  }

  return {
    state: {
      ...state,
      board,
      turn: nextTurn,
      passes,
      lastMove: { seat, pos, flips },
      history: [...(state.history || []).slice(-9), { seat, pos, flips: flips.length }],
      scores: score(board),
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  const scores = state.scores || score(state.board);
  const noSquares = state.board.every((cell) => cell !== null);
  const noMoves = legalMoves(state.board, 0).length === 0 && legalMoves(state.board, 1).length === 0;
  if (!noSquares && !noMoves && state.passes < 2) return { over: false, winner: null, draw: false, scores };
  const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
  return { over: true, winner, draw: winner === null, scores };
}

export default {
  id: 'reversi',
  name: 'Reversi',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
};
