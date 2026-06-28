// Pool — 2-player, turn-based, server-authoritative. The server simulates each
// shot to rest (poolPhysics) and is the sole source of truth. Modes: eightball,
// blitz (8-ball + shot clock), nineball, practice (points race).
import { TABLE, simulateShot, POCKETS } from './poolPhysics.js';

const MODES = new Set(['eightball', 'blitz', 'nineball', 'practice']);

const FOOT_X = 750, FOOT_Y = TABLE.H / 2;   // apex of the rack
const CUE_X = 220, CUE_Y = TABLE.H / 2;     // head spot (in the kitchen)
const ROW_DX = 23;                          // spacing between rack rows
const ROW_DY = 27;                          // spacing between balls in a row

// 8-ball rack (15 balls, slot order top→bottom rows): 8 in the center, the two
// back corners a solid and a stripe.
const RACK8 = [2, 10, 3, 11, 8, 12, 4, 13, 5, 6, 1, 14, 7, 15, 9];
const ROWS8 = [1, 2, 3, 4, 5];
// 9-ball diamond (1 at apex, 9 in the center).
const RACK9 = [1, 2, 3, 4, 9, 5, 6, 7, 8];
const ROWS9 = [1, 2, 3, 2, 1];

export function group(n) {
  if (n === 0) return 'cue';
  if (n === 8) return 'eight';
  return n < 8 ? 'solid' : 'stripe';
}

function buildRack(rows, numbers) {
  const balls = [];
  let slot = 0;
  for (let r = 0; r < rows.length; r++) {
    const count = rows[r];
    const x = FOOT_X + r * ROW_DX;
    for (let i = 0; i < count; i++) {
      const y = FOOT_Y + (i - (count - 1) / 2) * ROW_DY;
      const n = numbers[slot++];
      balls.push({ id: n, n, group: group(n), x: Math.round(x), y: Math.round(y) });
    }
  }
  return balls;
}

function normMode(options) {
  const m = options?.mode;
  return MODES.has(m) ? m : 'eightball';
}

export function createInitialState(options /* , seatCount */) {
  const mode = normMode(options);
  const rack = mode === 'nineball' ? buildRack(ROWS9, RACK9) : buildRack(ROWS8, RACK8);
  const cue = { id: 0, n: 0, group: 'cue', x: CUE_X, y: CUE_Y };
  return {
    W: TABLE.W, H: TABLE.H, ballR: TABLE.ballR, pockets: POCKETS,
    mode,
    balls: [cue, ...rack],
    cue: { x: CUE_X, y: CUE_Y },
    turn: 0,
    groups: { 0: null, 1: null },
    ballInHand: false,
    onBreak: true,
    eightPottedBy: null,
    scores: [0, 0],
    phase: 'playing',
    winner: null,
    draw: false,
    lastShot: null,
    seq: 0,
  };
}

const SPEED_K = 0.18;       // power(0..100) -> cue ball speed
const BLITZ_MS = 20000;

const LO_X = TABLE.inset + TABLE.ballR, HI_X = TABLE.W - TABLE.inset - TABLE.ballR;
const LO_Y = TABLE.inset + TABLE.ballR, HI_Y = TABLE.H - TABLE.inset - TABLE.ballR;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Place a ball at/near (x,y) within bounds, nudging outward to avoid overlap.
function placeFree(x, y, balls, loX, hiX) {
  const step = 2 * TABLE.ballR + 2;
  const bx = clamp(x, loX, hiX), by = clamp(y, LO_Y, HI_Y);
  for (let ring = 0; ring < 10; ring++) {
    const n = ring === 0 ? 1 : ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = clamp(Math.round(bx + Math.cos(a) * step * ring), loX, hiX);
      const py = clamp(Math.round(by + Math.sin(a) * step * ring), LO_Y, HI_Y);
      if (!balls.some((b) => Math.hypot(b.x - px, b.y - py) < step - 1)) return { x: px, y: py };
    }
  }
  return { x: Math.round(bx), y: Math.round(by) };
}

const respotKitchen = (balls) => placeFree(CUE_X, CUE_Y, balls, LO_X, TABLE.W / 2 - TABLE.ballR);

export function applyMove(state, seat, move) {
  if (state.phase === 'gameover') return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const power = Number(move?.power), dx = Number(move?.dx), dy = Number(move?.dy);
  if (![power, dx, dy].every(Number.isFinite) || (dx === 0 && dy === 0)) return { error: 'Invalid shot.' };

  const objectBalls = state.balls.filter((b) => b.id !== 0);
  const canPlace = state.ballInHand || state.onBreak;
  let cuePos;
  if (canPlace && Number.isFinite(move?.cue?.x) && Number.isFinite(move?.cue?.y)) {
    const hiX = state.onBreak ? TABLE.W / 2 - TABLE.ballR : HI_X;
    cuePos = placeFree(move.cue.x, move.cue.y, objectBalls, LO_X, hiX);
  } else {
    cuePos = { x: state.cue.x, y: state.cue.y };
  }

  const speed = clamp(power, 5, 100) * SPEED_K;
  const len = Math.hypot(dx, dy) || 1;
  const cueDisc = { id: 0, x: cuePos.x, y: cuePos.y, vx: (dx / len) * speed, vy: (dy / len) * speed, r: TABLE.ballR, mass: 1 };
  const discs = [cueDisc, ...objectBalls.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, r: TABLE.ballR, mass: 1 }))];

  const { frames, finalDiscs, pocketed, firstContact } = simulateShot(discs);

  const metaById = new Map(objectBalls.map((b) => [b.id, b]));
  const newObjects = finalDiscs
    .filter((d) => d.id !== 0)
    .map((d) => ({ ...metaById.get(d.id), x: Math.round(d.x), y: Math.round(d.y) }));
  const cueDiscFinal = finalDiscs.find((d) => d.id === 0);
  const cueScratched = !cueDiscFinal;
  const newCue = cueScratched
    ? respotKitchen(newObjects)
    : { x: Math.round(cueDiscFinal.x), y: Math.round(cueDiscFinal.y) };
  const newBalls = [{ id: 0, n: 0, group: 'cue', x: newCue.x, y: newCue.y }, ...newObjects];

  const ctx = { pocketed, firstContact, cueScratched, newBalls, newObjects, newCue, frames };
  if (state.mode === 'nineball') return { state: resolveNineball(state, seat, ctx) };
  if (state.mode === 'practice') return { state: resolvePractice(state, seat, ctx) };
  return { state: resolveEightball(state, seat, ctx) }; // eightball + blitz
}

function resolveEightball(state, seat, ctx) {
  const { pocketed, firstContact, cueScratched, frames } = ctx;
  let { newBalls, newCue } = ctx;
  const groups = { ...state.groups };
  const myGroup = state.groups[seat];
  const groupClearedBefore = !!myGroup && state.balls.filter((b) => b.group === myGroup).length === 0;
  const pottedNonCue = pocketed.filter((p) => p.id !== 0);

  // foul detection
  let foul = false;
  if (cueScratched) foul = true;
  else if (firstContact === null) foul = true; // hit nothing
  else if (!state.onBreak) {
    const fcGroup = group(firstContact);
    if (myGroup) {
      const legalFirst = groupClearedBefore ? 'eight' : myGroup;
      if (fcGroup !== legalFirst) foul = true;
    } else if (fcGroup === 'eight') {
      foul = true; // can't legally strike the 8 first on an open table
    }
  }

  // group assignment on a legal, non-break pot
  if (!groups[seat] && !state.onBreak && !foul) {
    const firstObj = pottedNonCue.find((p) => p.id !== 8);
    if (firstObj) {
      const g = group(firstObj.id);
      groups[seat] = g;
      groups[1 - seat] = g === 'solid' ? 'stripe' : 'solid';
    }
  }

  // the 8 ball
  const eightPotted = pottedNonCue.some((p) => p.id === 8);
  let phase = state.phase, winner = state.winner, eightPottedBy = state.eightPottedBy;
  if (eightPotted) {
    if (state.onBreak) {
      newBalls = [...newBalls, { id: 8, n: 8, group: 'eight', ...placeFree(FOOT_X, FOOT_Y, newBalls, LO_X, HI_X) }];
    } else {
      eightPottedBy = seat;
      const legal8 = !!myGroup && groupClearedBefore && !cueScratched && firstContact === 8;
      winner = legal8 ? seat : 1 - seat;
      phase = 'gameover';
    }
  }

  const pocketedOwn = groups[seat] ? pottedNonCue.filter((p) => group(p.id) === groups[seat]).length : 0;
  const continues = !foul && phase !== 'gameover' && pocketedOwn > 0;
  const ballInHand = foul && phase !== 'gameover';
  const turn = phase === 'gameover' ? seat : continues ? seat : 1 - seat;

  const scores = [0, 1].map((s) => (groups[s] ? 7 - newBalls.filter((b) => b.group === groups[s]).length : 0));

  return {
    ...state,
    balls: newBalls,
    cue: newCue,
    turn,
    groups,
    ballInHand,
    onBreak: false,
    eightPottedBy,
    scores,
    phase,
    winner,
    draw: false,
    lastShot: { frames, pocketed, foul, by: seat },
    seq: state.seq + 1,
  };
}

// 9-Ball: must contact the lowest-numbered ball first; legally pot the 9 to win.
function resolveNineball(state, seat, ctx) {
  const { pocketed, firstContact, cueScratched, frames } = ctx;
  let { newBalls, newCue } = ctx;
  const pottedNonCue = pocketed.filter((p) => p.id !== 0);
  const remaining = state.balls.filter((b) => b.id !== 0).map((b) => b.n);
  const lowest = remaining.length ? Math.min(...remaining) : null;

  let foul = false;
  if (cueScratched) foul = true;
  else if (firstContact === null) foul = true;
  else if (lowest !== null && firstContact !== lowest) foul = true;

  const ninePotted = pottedNonCue.some((p) => p.id === 9);
  let phase = state.phase, winner = state.winner;
  if (ninePotted) {
    if (!foul) { winner = seat; phase = 'gameover'; }
    else { newBalls = [...newBalls, { id: 9, n: 9, group: group(9), ...placeFree(FOOT_X, FOOT_Y, newBalls, LO_X, HI_X) }]; }
  }

  const continues = !foul && phase !== 'gameover' && pottedNonCue.length > 0;
  const ballInHand = foul && phase !== 'gameover';
  const turn = phase === 'gameover' ? seat : continues ? seat : 1 - seat;
  const scores = state.scores.slice();
  if (!foul) scores[seat] += pottedNonCue.length;

  return {
    ...state, balls: newBalls, cue: newCue, turn, ballInHand, onBreak: false,
    phase, winner, scores, lastShot: { frames, pocketed, foul, by: seat }, seq: state.seq + 1,
  };
}
// Practice: points race. Pot any ball to score; scratch just re-spots the cue.
function resolvePractice(state, seat, ctx) {
  const { pocketed, cueScratched, newBalls, newCue, frames } = ctx;
  const pottedNonCue = pocketed.filter((p) => p.id !== 0);
  const scores = state.scores.slice();
  scores[seat] += pottedNonCue.length;

  const continues = !cueScratched && pottedNonCue.length > 0;
  const turn = continues ? seat : 1 - seat;

  let phase = state.phase, winner = state.winner, draw = state.draw;
  if (newBalls.filter((b) => b.id !== 0).length === 0) {
    phase = 'gameover';
    if (scores[0] === scores[1]) { winner = null; draw = true; }
    else { winner = scores[0] > scores[1] ? 0 : 1; draw = false; }
  }

  return {
    ...state, balls: newBalls, cue: newCue, turn, scores, onBreak: false, ballInHand: false,
    phase, winner, draw, lastShot: { frames, pocketed, foul: cueScratched, by: seat }, seq: state.seq + 1,
  };
}

export function getResult(state) {
  return { over: state.phase === 'gameover', winner: state.winner, draw: state.draw, scores: state.scores };
}

export default {
  id: 'pool',
  name: 'Pool',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  modes: [
    { id: 'eightball', name: '8-Ball' },
    { id: 'blitz', name: 'Blitz' },
    { id: 'nineball', name: '9-Ball' },
    { id: 'practice', name: 'Practice' },
  ],
  createInitialState,
  applyMove,
  getResult,
  // turnTimeoutMs / onTimeout added in a later task
};
