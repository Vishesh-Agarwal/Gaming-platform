const SIZE = 5;
const CELLS = SIZE * SIZE;
const BACK_ROW = ['rook', 'knight', 'bishop', 'queen', 'king'];

const idx = (r, c) => r * SIZE + c;
const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function makePiece(owner, type) {
  return { owner, type };
}

function cloneBoard(board) {
  return board.map((p) => (p ? { ...p } : null));
}

function pathClear(board, from, to, dr, dc) {
  const a = rc(from);
  const b = rc(to);
  let r = a.r + dr;
  let c = a.c + dc;
  while (r !== b.r || c !== b.c) {
    if (board[idx(r, c)]) return false;
    r += dr;
    c += dc;
  }
  return true;
}

function isLegalMove(board, from, to) {
  const piece = board[from];
  if (!piece || from === to || to < 0 || to >= CELLS) return false;
  const target = board[to];
  if (target?.owner === piece.owner) return false;
  const a = rc(from);
  const b = rc(to);
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  if (piece.type === 'king') return Math.max(adr, adc) === 1;
  if (piece.type === 'knight') return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
  if (piece.type === 'pawn') {
    const forward = piece.owner === 0 ? -1 : 1;
    if (dc === 0 && dr === forward && !target) return true;
    return adc === 1 && dr === forward && target && target.owner !== piece.owner;
  }
  if (piece.type === 'rook' && (dr === 0 || dc === 0)) {
    return pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
  }
  if (piece.type === 'bishop' && adr === adc) {
    return pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
  }
  if (piece.type === 'queen') {
    if (dr === 0 || dc === 0 || adr === adc) {
      return pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
    }
  }
  return false;
}

function winnerFromBoard(board) {
  const kings = [false, false];
  for (const piece of board) {
    if (piece?.type === 'king') kings[piece.owner] = true;
  }
  if (!kings[0]) return 1;
  if (!kings[1]) return 0;
  return null;
}

export function createInitialState() {
  const board = Array(CELLS).fill(null);
  for (let c = 0; c < SIZE; c += 1) {
    board[idx(0, c)] = makePiece(1, BACK_ROW[c]);
    board[idx(1, c)] = makePiece(1, 'pawn');
    board[idx(3, c)] = makePiece(0, 'pawn');
    board[idx(4, c)] = makePiece(0, BACK_ROW[c]);
  }
  return {
    size: SIZE,
    board,
    turn: 0,
    winner: null,
    lastMove: null,
    history: [],
    captured: [0, 0],
  };
}

export function applyMove(state, seat, move) {
  if (state.winner != null) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const from = Number(move?.from);
  const to = Number(move?.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= CELLS || to < 0 || to >= CELLS) {
    return { error: 'Choose a valid square.' };
  }
  const piece = state.board[from];
  if (!piece || piece.owner !== seat) return { error: 'Choose your own piece.' };
  if (!isLegalMove(state.board, from, to)) return { error: 'Illegal move.' };

  const board = cloneBoard(state.board);
  const captured = state.captured.slice();
  const taken = board[to];
  if (taken) captured[seat] += 1;
  board[to] = board[from];
  board[from] = null;
  const dest = rc(to);
  if (board[to].type === 'pawn' && (dest.r === 0 || dest.r === SIZE - 1)) {
    board[to] = { ...board[to], type: 'queen' };
  }
  const winner = taken?.type === 'king' ? seat : winnerFromBoard(board);
  return {
    state: {
      ...state,
      board,
      winner,
      captured,
      turn: winner == null ? 1 - seat : seat,
      lastMove: { from, to, seat, captured: taken || null },
      history: [...(state.history || []).slice(-9), { seat, from, to, piece: piece.type, captured: taken?.type || null }],
    },
  };
}

export function getResult(state) {
  const winner = state.winner ?? winnerFromBoard(state.board);
  if (winner == null) return { over: false, winner: null, draw: false };
  return { over: true, winner, draw: false };
}

export default {
  id: 'microchess',
  name: 'Micro Chess',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
};
