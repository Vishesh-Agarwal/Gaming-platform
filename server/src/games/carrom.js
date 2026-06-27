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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toDisc(coin) {
  return { id: coin.id, color: coin.color, x: coin.x, y: coin.y, vx: 0, vy: 0, r: BOARD.coinR, mass: 1 };
}

function buildStriker(seat, x, dx, dy, power) {
  const slotX = clamp(Math.round(x), BOARD.inset + BOARD.strikerR, BOARD.W - BOARD.inset - BOARD.strikerR);
  const len = Math.hypot(dx, dy) || 1;
  const speed = clamp(power, 5, 100) * SPEED_K;
  return {
    id: 'striker', color: 'striker',
    x: slotX, y: baselineY(seat),
    vx: (dx / len) * speed, vy: (dy / len) * speed,
    r: BOARD.strikerR, mass: 1.5,
  };
}

// Place a coin at the center spot, nudging outward until it doesn't overlap.
function placeFree(coins, color, id) {
  const cx = BOARD.W / 2, cy = BOARD.H / 2, step = 2 * BOARD.coinR + 2;
  for (let ring = 0; ring < 8; ring++) {
    const n = ring === 0 ? 1 : ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * step * ring);
      const y = Math.round(cy + Math.sin(a) * step * ring);
      const clash = coins.some((c) => Math.hypot(c.x - x, c.y - y) < step - 1);
      if (!clash) return { id, color, x, y };
    }
  }
  return { id, color, x: cx, y: cy };
}

function aimsIntoBoard(seat, dy) {
  return seat === 0 ? dy < 0 : dy > 0;
}

export function applyMove(state, seat, move) {
  if (state.phase === 'gameover') return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const power = Number(move?.power), dx = Number(move?.dx), dy = Number(move?.dy), x = Number(move?.x);
  if (![power, dx, dy, x].every(Number.isFinite) || (dx === 0 && dy === 0)) return { error: 'Invalid shot.' };
  if (!aimsIntoBoard(seat, dy)) return { error: 'Aim into the board.' };

  const striker = buildStriker(seat, x, dx, dy, power);
  const discs = [...state.coins.map(toDisc), striker];
  const { frames, finalDiscs, pocketed } = simulateShot(discs);

  if (state.mode === 'points') return { state: resolvePoints(state, seat, frames, finalDiscs, pocketed) };
  return { state: resolveClassic(state, seat, striker, frames, finalDiscs, pocketed) };
}

function resolveClassic(state, seat, striker, frames, finalDiscs, pocketed) {
  const colors = { ...state.colors };
  const pocketedByColor = { ...state.pocketedByColor };
  let { queenAwaitingCover, queenCoveredBy, queenOnBoard, nextId } = state;

  const strikerPocketed = pocketed.some((p) => p.id === 'striker');
  const coinPockets = pocketed.filter((p) => p.id !== 'striker');
  const newCoins = finalDiscs
    .filter((d) => d.id !== 'striker')
    .map((d) => ({ id: d.id, color: d.color, x: Math.round(d.x), y: Math.round(d.y) }));

  // claim color on the first pocketed non-queen coin
  if (!colors[seat]) {
    const first = coinPockets.find((p) => p.color !== 'queen');
    if (first) { colors[seat] = first.color; colors[1 - seat] = first.color === 'white' ? 'black' : 'white'; }
  }

  let pocketedOwn = 0;
  let pocketedQueen = false;
  for (const p of coinPockets) {
    if (p.color === 'queen') { pocketedQueen = true; continue; }
    if (p.color === colors[seat]) { pocketedByColor[p.color]++; pocketedOwn++; }
    else { newCoins.push(placeFree(newCoins, p.color, nextId++)); } // opponent coin returns
  }

  // queen cover logic (same-or-next-shot)
  let queenReturned = false;
  if (pocketedQueen) {
    queenOnBoard = false;
    if (pocketedOwn > 0) { queenCoveredBy = seat; queenAwaitingCover = null; }
    else { queenAwaitingCover = seat; }
  } else if (queenAwaitingCover === seat) {
    if (pocketedOwn > 0) { queenCoveredBy = seat; queenAwaitingCover = null; }
    else { queenAwaitingCover = null; queenOnBoard = true; newCoins.push(placeFree(newCoins, 'queen', nextId++)); queenReturned = true; }
  }

  let foul = null;
  if (strikerPocketed) {
    foul = 'striker';
    // return one of the shooter's pocketed coins, if any
    if (colors[seat] && pocketedByColor[colors[seat]] > 0) {
      pocketedByColor[colors[seat]]--;
      newCoins.push(placeFree(newCoins, colors[seat], nextId++));
    }
    // a queen left tentatively this shot can't be covered after a foul: return it
    if (queenAwaitingCover === seat) {
      queenAwaitingCover = null; queenOnBoard = true;
      newCoins.push(placeFree(newCoins, 'queen', nextId++)); queenReturned = true;
    }
  }

  const continues = !strikerPocketed && (pocketedOwn > 0 || pocketedQueen);
  const scores = [colors[0] ? pocketedByColor[colors[0]] : 0, colors[1] ? pocketedByColor[colors[1]] : 0];

  const next = {
    ...state,
    coins: newCoins,
    striker: { x: striker.x, y: striker.y },
    turn: continues ? seat : 1 - seat,
    colors, pocketedByColor, queenOnBoard, queenAwaitingCover, queenCoveredBy,
    scores, nextId,
    lastShot: { frames, pocketed, foul, queenReturned, by: seat },
    seq: state.seq + 1,
  };
  const r = getResult(next);
  if (r.over) { next.phase = 'gameover'; next.winner = r.winner; next.draw = r.draw; }
  return next;
}

function resolvePoints(state, seat, frames, finalDiscs, pocketed) {
  // real implementation in Task 7
  return { ...state, turn: 1 - seat, seq: state.seq + 1, lastShot: { frames, pocketed, foul: null, by: seat } };
}

export function getResult(state) {
  return { over: false, winner: null, draw: false, scores: state.scores };
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
  applyMove,
  getResult,
  // turnTimeoutMs / onTimeout added in later tasks
};
