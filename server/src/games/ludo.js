// Ludo — 2–4 player, server-authoritative, turn-based. Token "progress" 0..57:
// 0 base, 1..51 shared loop (from own color start), 52..57 home column, 57 goal.
export const START = [0, 13, 26, 39];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const SEAT_COLORS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

// Absolute loop index (0..51) of a token at `progress` for `color`; -1 if not on the loop.
export function loopCell(color, progress) {
  if (progress < 1 || progress > 51) return -1;
  return (START[color] + (progress - 1)) % 52;
}

export function createInitialState(_options, seatCount = 2) {
  const n = Math.max(2, Math.min(4, seatCount));
  const colors = SEAT_COLORS[n];
  return {
    seatCount: n,
    colors,
    players: colors.map((color) => ({ color, tokens: [0, 0, 0, 0] })),
    current: 0,
    phase: 'roll',
    dice: null,
    movable: [],
    sixesInRow: 0,
    finishedOrder: [],
    lastEvent: null,
    lastRoll: null, // { seat, value, seq } — last die rolled, so the client always shows it
  };
}

export function legalMoves(state, seat, dice) {
  const t = state.players[seat].tokens;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = t[i];
    if (p === 0) { if (dice === 6) out.push(i); }
    else if (p < 57 && p + dice <= 57) out.push(i);
  }
  return out;
}

export function nextActiveSeat(state, from) {
  let s = from;
  for (let k = 0; k < state.seatCount; k++) {
    s = (s + 1) % state.seatCount;
    if (!state.finishedOrder.includes(s)) return s;
  }
  return from;
}

// Apply a concrete dice value to state.current (the testable core of the roll action).
export function applyRoll(state, dice) {
  const seat = state.current;
  const lastRoll = { seat, value: dice, seq: (state.lastRoll?.seq || 0) + 1 };
  // three consecutive 6s -> void the turn
  if (dice === 6 && state.sixesInRow >= 2) {
    return { ...state, dice: null, movable: [], sixesInRow: 0, lastRoll,
      phase: 'roll', current: nextActiveSeat(state, seat), lastEvent: { type: 'sixes', seat } };
  }
  const sixes = dice === 6 ? state.sixesInRow + 1 : state.sixesInRow;
  const movable = legalMoves(state, seat, dice);
  if (movable.length === 0) {
    return { ...state, dice: null, movable: [], sixesInRow: dice === 6 ? sixes : 0, lastRoll,
      phase: 'roll', current: nextActiveSeat(state, seat), lastEvent: { type: 'pass', seat } };
  }
  return { ...state, dice, movable, sixesInRow: sixes, lastRoll, phase: 'move', lastEvent: null };
}

// Apply a move of `token` for state.current by state.dice (testable core of the move action).
export function applyTokenMove(state, token) {
  const seat = state.current;
  const dice = state.dice;
  const players = state.players.map((p) => ({ color: p.color, tokens: p.tokens.slice() }));
  const me = players[seat];
  const from = me.tokens[token];
  const to = from === 0 ? 1 : from + dice;
  me.tokens[token] = to;

  let captured = false;
  const cell = loopCell(me.color, to);
  if (cell !== -1 && !SAFE.has(cell)) {
    for (let s = 0; s < players.length; s++) {
      if (s === seat) continue;
      const op = players[s];
      for (let i = 0; i < 4; i++) {
        if (op.tokens[i] !== 0 && loopCell(op.color, op.tokens[i]) === cell) {
          op.tokens[i] = 0; captured = true;
        }
      }
    }
  }

  const reachedHome = to === 57;
  const finishedOrder = state.finishedOrder.slice();
  if (me.tokens.every((p) => p === 57) && !finishedOrder.includes(seat)) finishedOrder.push(seat);

  const extraTurn = dice === 6 || captured || reachedHome;
  const base = { ...state, players, finishedOrder, dice: null, movable: [], phase: 'roll' };
  base.lastEvent = captured ? { type: 'capture', seat } : reachedHome ? { type: 'home', seat } : null;
  if (extraTurn) {
    base.sixesInRow = dice === 6 ? state.sixesInRow : 0;
    base.current = seat;
  } else {
    base.sixesInRow = 0;
    base.current = nextActiveSeat(state, seat);
  }
  return base;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (seat !== state.current) return { error: 'Not your turn.' };
  if (move?.action === 'roll') {
    if (state.phase !== 'roll') return { error: 'Roll already done.' };
    const dice = 1 + Math.floor(Math.random() * 6);
    return { state: applyRoll(state, dice) };
  }
  if (move?.action === 'move') {
    if (state.phase !== 'move') return { error: 'Roll first.' };
    if (!state.movable.includes(move.token)) return { error: 'That token cannot move.' };
    return { state: applyTokenMove(state, move.token) };
  }
  return { error: 'Unknown action.' };
}

export function getResult(state) {
  const scores = state.players.map((p) => p.tokens.filter((t) => t === 57).length);
  const over = state.finishedOrder.length >= state.seatCount - 1;
  if (!over) return { over: false, winner: null, draw: false, scores };
  const remaining = [];
  for (let s = 0; s < state.seatCount; s++) if (!state.finishedOrder.includes(s)) remaining.push(s);
  const ranking = [...state.finishedOrder, ...remaining];
  return { over: true, winner: ranking[0], draw: false, ranking, scores };
}

export default {
  id: 'ludo', name: 'Ludo', type: 'turn-based',
  minPlayers: 2, maxPlayers: 4,
  createInitialState, applyMove, getResult,
};
