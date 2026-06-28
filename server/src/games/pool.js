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
  // applyMove / getResult / turnTimeoutMs / onTimeout added in later tasks
};
