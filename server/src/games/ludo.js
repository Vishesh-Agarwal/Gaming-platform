// Ludo — 2–4 player, server-authoritative, turn-based. Token "progress" 0..57:
// 0 base, 1..51 shared loop (from own color start), 52..57 home column, 57 goal.
export const START = [0, 13, 26, 39];
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const SEAT_COLORS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
export const TURN_TIMEOUT_MS = 20000; // a player has 20s to act before their turn auto-plays
export const MAX_MISSES = 5;          // 5 timed-out turns total -> eliminated

// Absolute loop index (0..51) of a token at `progress` for `color`; -1 if not on the loop.
export function loopCell(color, progress) {
  if (progress < 1 || progress > 51) return -1;
  return (START[color] + (progress - 1)) % 52;
}

export function createInitialState(options, seatCount = 2) {
  const n = Math.max(2, Math.min(4, seatCount));
  const colors = SEAT_COLORS[n];
  // 2v2 teams (only with a full table): partners sit opposite — seats 0&2 vs 1&3.
  const teamMode = options?.mode === 'teams' && n === 4;
  return {
    seatCount: n,
    colors,
    mode: teamMode ? 'teams' : 'classic',
    teams: teamMode ? colors.map((_, seat) => seat % 2) : null, // seat -> team (0|1)
    players: colors.map((color) => ({ color, tokens: [0, 0, 0, 0] })),
    current: 0,
    phase: 'roll',
    dice: null,
    movable: [],
    sixesInRow: 0,
    finishedOrder: [],
    misses: colors.map(() => 0), // per-seat count of timed-out turns
    out: [],                     // seats eliminated by reaching MAX_MISSES
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
  const out = state.out || [];
  let s = from;
  for (let k = 0; k < state.seatCount; k++) {
    s = (s + 1) % state.seatCount;
    if (!state.finishedOrder.includes(s) && !out.includes(s)) return s;
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
      if (state.teams && state.teams[s] === state.teams[seat]) continue; // never capture a teammate
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
    const rolled = applyRoll(state, dice);
    // Only one legal move? Play it for the player — no point making them click the
    // single eligible token. (The client still animates the roll and the hop.)
    if (rolled.phase === 'move' && rolled.movable.length === 1) {
      return { state: applyTokenMove(rolled, rolled.movable[0]) };
    }
    return { state: rolled };
  }
  if (move?.action === 'move') {
    if (state.phase !== 'move') return { error: 'Roll first.' };
    if (!state.movable.includes(move.token)) return { error: 'That token cannot move.' };
    return { state: applyTokenMove(state, move.token) };
  }
  return { error: 'Unknown action.' };
}

export function getResult(state) {
  const out = state.out || [];
  const scores = state.players.map((p) => p.tokens.filter((t) => t === 57).length);

  // 2v2 teams: a team wins when BOTH partners get every token home (or the other
  // team is wiped out by eliminations). Partners share the result.
  if (state.mode === 'teams' && state.teams) {
    const finishedOrder = state.finishedOrder;
    const seatsOf = (t) => [0, 1, 2, 3].filter((s) => state.teams[s] === t);
    const teamDone = (t) => seatsOf(t).every((s) => finishedOrder.includes(s));
    const teamDead = (t) => seatsOf(t).every((s) => out.includes(s));
    const t0done = teamDone(0), t1done = teamDone(1);
    const over = t0done || t1done || teamDead(0) || teamDead(1);
    // team score = total tokens home across both partners (matches the shared overlay)
    const teamScores = [0, 1].map((t) => seatsOf(t).reduce((sum, s) => sum + scores[s], 0));
    if (!over) return { over: false, mode: 'teams', winner: null, draw: false, scores, teams: teamScores };
    const winnerTeam = t0done ? 0 : t1done ? 1 : (teamDead(0) ? 1 : 0);
    // winner is the TEAM id (Game.jsx compares it against the viewer's team)
    return { over: true, mode: 'teams', winner: winnerTeam, winnerTeam, teams: teamScores, draw: false, scores };
  }

  // over once all but one seat is done (finished or eliminated)
  const over = state.finishedOrder.length + out.length >= state.seatCount - 1;
  if (!over) return { over: false, winner: null, draw: false, scores };
  const remaining = [];
  for (let s = 0; s < state.seatCount; s++) {
    if (!state.finishedOrder.includes(s) && !out.includes(s)) remaining.push(s);
  }
  // winners first (finish order), the survivor next, then eliminated (latest-out ranks higher)
  const ranking = [...state.finishedOrder, ...remaining, ...out.slice().reverse()];
  return { over: true, winner: ranking[0], draw: false, ranking, scores };
}

// Pick the current seat's most-progressed movable token (a reasonable autopilot).
function bestMovable(state, seat) {
  const t = state.players[seat].tokens;
  let best = state.movable[0];
  for (const i of state.movable) if (t[i] > t[best]) best = i;
  return best;
}

// The current player ran out of time. Count a miss; at MAX_MISSES they are
// eliminated and the turn passes. Otherwise auto-play their whole turn (rolling
// again whenever a 6/capture/home grants an extra turn) so play keeps moving.
export function onTimeout(state) {
  const seat = state.current;
  const misses = state.misses.slice();
  misses[seat] = (misses[seat] || 0) + 1;

  if (misses[seat] >= MAX_MISSES) {
    const out = state.out.includes(seat) ? state.out : [...state.out, seat];
    const base = {
      ...state, misses, out, dice: null, movable: [], sixesInRow: 0,
      phase: 'roll', lastEvent: { type: 'eliminated', seat },
    };
    base.current = nextActiveSeat(base, seat);
    return { state: base };
  }

  let s = { ...state, misses };
  let guard = 0;
  while (s.current === seat && !getResult(s).over && guard++ < 24) {
    if (s.phase === 'roll') {
      const dice = 1 + Math.floor(Math.random() * 6);
      s = applyRoll(s, dice); // may auto-resolve a single-move roll on its own
    } else {
      s = applyTokenMove(s, bestMovable(s, seat));
    }
  }
  return { state: { ...s, lastEvent: { type: 'timeout', seat } } };
}

export default {
  id: 'ludo', name: 'Ludo', type: 'turn-based',
  minPlayers: 2, maxPlayers: 4,
  modes: [
    { id: 'classic', name: 'Classic' },
    { id: 'teams', name: '2v2 Teams' },
  ],
  turnTimeoutMs: TURN_TIMEOUT_MS,
  createInitialState, applyMove, getResult, onTimeout,
};
