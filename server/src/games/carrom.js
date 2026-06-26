// server/src/games/carrom.js
// Carrom — 2-player, turn-based, server-authoritative. The server simulates each
// flick to rest (carromPhysics) and is the sole source of truth. Modes: classic,
// points, blitz (classic + shot clock), quick (classic, 7 coins).
import { BOARD, simulateShot, POCKETS } from './carromPhysics.js';

const MODES = new Set(['classic', 'points', 'blitz', 'quick']);
const POINTS_TARGET = 7;
const BLITZ_MS = 20000;
const SPEED_K = 0.22;       // power(0..100) -> initial striker speed
const BASE_GAP = 14;        // striker sits this far inside its baseline rail

function normMode(options) {
  const m = options?.mode;
  return MODES.has(m) ? m : 'classic';
}

// Deterministic opening rosette: queen at center, rings of alternating coins.
function makeLayout(mode) {
  const cx = BOARD.W / 2, cy = BOARD.H / 2;
  const d = 2 * BOARD.coinR + 1;
  const coins = [{ id: 0, color: 'queen', x: cx, y: cy }];
  let id = 1;
  const ring = (count, radius, startColor) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const color = i % 2 === 0 ? startColor : startColor === 'white' ? 'black' : 'white';
      coins.push({ id: id++, color, x: Math.round(cx + Math.cos(a) * radius), y: Math.round(cy + Math.sin(a) * radius) });
    }
  };
  if (mode === 'quick') {
    ring(6, d, 'white'); // 3 white + 3 black
  } else {
    ring(6, d, 'white');     // 3 white + 3 black
    ring(12, d * 2, 'black'); // 6 black + 6 white
  }
  return { coins, nextId: id };
}

export function createInitialState(options, seatCount) {
  const mode = normMode(options);
  const { coins, nextId } = makeLayout(mode);
  const coinsPerColor = mode === 'quick' ? 3 : 9;
  return {
    W: BOARD.W, H: BOARD.H, coinR: BOARD.coinR, strikerR: BOARD.strikerR, pocketR: BOARD.pocketR,
    pockets: POCKETS,
    mode,
    target: POINTS_TARGET,
    coins,
    striker: { x: BOARD.W / 2, y: baselineY(0) },
    turn: 0,
    colors: { 0: null, 1: null },
    coinsPerColor,
    pocketedByColor: { white: 0, black: 0 },
    queenOnBoard: true,
    queenAwaitingCover: null,
    queenCoveredBy: null,
    scores: [0, 0],
    phase: 'playing',
    winner: null,
    draw: false,
    lastShot: null,
    nextId,
    seq: 0,
  };
}

// Baseline (striker rest line) y for a seat: seat 0 bottom, seat 1 top.
export function baselineY(seat) {
  return seat === 0
    ? BOARD.H - BOARD.inset - BOARD.strikerR - BASE_GAP
    : BOARD.inset + BOARD.strikerR + BASE_GAP;
}

export default {
  id: 'carrom',
  name: 'Carrom',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  modes: [
    { id: 'classic', name: 'Classic' },
    { id: 'points', name: 'Points Race' },
    { id: 'blitz', name: 'Blitz' },
    { id: 'quick', name: 'Quick' },
  ],
  createInitialState,
  // applyMove / getResult / turnTimeoutMs / onTimeout added in later tasks
};
