// Tank Duel — turn-based artillery (Pocket Tanks / Gorillas style). Pure rules,
// fully server-authoritative: the server simulates every shot and is the only
// source of truth, so it's cheat-proof. Player 0 sits on the left and fires
// right; player 1 sits on the right and fires left. Each turn a player picks an
// angle + power; the server traces the shell (gravity + per-turn wind), applies
// blast damage by proximity to either tank, and hands the turn over. Deplete the
// opponent's HP to win.

const W = 1200;
const H = 560;
const STEP = 8;             // ground heightmap resolution (px)
const MAX_HP = 100;
const GRAVITY = 0.18;       // px / step^2
const SPEED_K = 0.16;       // power(0..100) -> initial speed
const MAX_WIND = 0.045;     // horizontal accel added each step
const BLAST = 95;           // splash radius (px)
const MAX_DMG = 55;         // damage at the centre of the blast
const TANK_R = 16;          // tank body radius (for hit tests)
const BARREL = 22;          // barrel length (shell spawns at the tip)
const MAX_STEPS = 4000;
const MOVE_BUDGET = 150;    // how far a tank may drive on its own turn (px)
const EDGE = 40;            // keep tanks this far from the map edges
const CRATER_R = 58;        // radius of the crater carved on impact (px)

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Carve a circular bite out of the heightmap at the impact point (y grows down,
// so lowering the surface = increasing y). Returns a new ground array.
function carveCrater(ground, step, ix, iy, r) {
  const out = ground.slice();
  for (let i = 0; i < out.length; i++) {
    const dx = i * step - ix;
    if (Math.abs(dx) > r) continue;
    const bowl = iy + Math.sqrt(r * r - dx * dx); // bottom of the bite at this column
    if (bowl > out[i]) out[i] = Math.min(H, Math.round(bowl));
  }
  return out;
}

function frand(seed, n) {
  const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// Deterministic rolling terrain from the seed (surface y at each STEP; y grows down).
function makeGround(seed) {
  const p1 = frand(seed, 1) * Math.PI * 2;
  const p2 = frand(seed, 2) * Math.PI * 2;
  const p3 = frand(seed, 3) * Math.PI * 2;
  const base = H * 0.72;
  const n = Math.floor(W / STEP) + 1;
  const arr = [];
  for (let i = 0; i < n; i++) {
    const x = i * STEP;
    let y =
      base -
      Math.sin(x * 0.0042 + p1) * 70 -
      Math.sin(x * 0.0090 + p2) * 32 -
      Math.sin(x * 0.0185 + p3) * 14;
    if (y < H * 0.34) y = H * 0.34;
    if (y > H * 0.92) y = H * 0.92;
    arr.push(Math.round(y));
  }
  return arr;
}

function groundYAt(state, x) {
  const { ground, step } = state;
  if (x <= 0) return ground[0];
  const maxX = step * (ground.length - 1);
  if (x >= maxX) return ground[ground.length - 1];
  const fi = x / step;
  const i = Math.floor(fi);
  const f = fi - i;
  return ground[i] * (1 - f) + ground[i + 1] * f;
}

function pickWind() {
  return Math.round((Math.random() * 2 - 1) * MAX_WIND * 1000) / 1000;
}

const ROUNDS_TO_WIN = 2; // best of 3

// Per-round playfield (terrain + tanks reset). starter = who fires first.
function freshRound(starter) {
  const seed = Math.floor(Math.random() * 1e9);
  return {
    seed,
    ground: makeGround(seed),
    tanks: [
      { x: Math.round(W * 0.12), hp: MAX_HP },
      { x: Math.round(W * 0.88), hp: MAX_HP },
    ],
    turn: starter,
    starter,
    wind: pickWind(),
    lastShot: null,
  };
}

function createInitialState() {
  return {
    W,
    H,
    step: STEP,
    maxHp: MAX_HP,
    blast: BLAST,
    moveBudget: MOVE_BUDGET,
    roundsToWin: ROUNDS_TO_WIN,
    scores: [0, 0],
    round: 1,
    phase: 'playing',
    roundResult: null,
    seq: 0,
    ...freshRound(0),
  };
}

// Start the next round, preserving match score; loser opens (alternate on a draw).
function advanceRound(state) {
  const starter =
    state.roundResult && state.roundResult.winner != null
      ? 1 - state.roundResult.winner
      : 1 - state.starter;
  return {
    ...state,
    round: state.round + 1,
    phase: 'playing',
    roundResult: null,
    seq: (state.seq || 0) + 1,
    ...freshRound(starter),
  };
}

// move = { angle: 1..89, power: 5..100, x? } to fire, or { next: true } between rounds.
function applyMove(state, playerIndex, move) {
  if (getResult(state).over) return { error: 'Game is already over.' };

  // between rounds: either player advances to the next round (idempotent)
  if (state.phase === 'roundover') {
    if (move?.next) return { state: advanceRound(state) };
    return { error: 'Round over — waiting for the next round.' };
  }

  if (state.turn !== playerIndex) return { error: 'Not your turn.' };

  let angle = Number(move?.angle);
  let power = Number(move?.power);
  if (!Number.isFinite(angle) || !Number.isFinite(power)) {
    return { error: 'Invalid shot.' };
  }
  angle = Math.max(1, Math.min(89, angle));
  power = Math.max(5, Math.min(100, power));

  const dir = playerIndex === 0 ? 1 : -1; // left player fires right, right fires left
  const shooter = state.tanks[playerIndex];

  // optional drive this turn: clamp to the move budget and the map edges
  let shooterX = shooter.x;
  if (Number.isFinite(Number(move?.x))) {
    shooterX = clampN(Number(move.x), shooter.x - MOVE_BUDGET, shooter.x + MOVE_BUDGET);
    shooterX = Math.round(clampN(shooterX, EDGE, W - EDGE));
  }

  const rad = (angle * Math.PI) / 180;
  const speed = power * SPEED_K;
  let vx = Math.cos(rad) * speed * dir;
  let vy = -Math.sin(rad) * speed;

  // spawn at the barrel tip, just above the (possibly moved) tank
  const baseY = groundYAt(state, shooterX) - TANK_R;
  let x = shooterX + Math.cos(rad) * BARREL * dir;
  let y = baseY - Math.sin(rad) * BARREL;

  const path = [{ x: Math.round(x), y: Math.round(y) }];
  let impact = null;
  for (let s = 0; s < MAX_STEPS; s++) {
    vx += state.wind;
    vy += GRAVITY;
    x += vx;
    y += vy;
    if (s % 3 === 0) path.push({ x: Math.round(x), y: Math.round(y) });
    if (x < -60 || x > W + 60) {
      impact = { x: Math.round(x), y: Math.round(y), off: true };
      break;
    }
    if (y >= groundYAt(state, x)) {
      y = groundYAt(state, x);
      impact = { x: Math.round(x), y: Math.round(y) };
      break;
    }
  }
  if (!impact) impact = { x: Math.round(x), y: Math.round(y), off: true };
  path.push({ x: impact.x, y: impact.y });

  // commit the drive, then apply blast damage by proximity (you can dud yourself)
  const tanks = state.tanks.map((t) => ({ ...t }));
  tanks[playerIndex].x = shooterX;
  let ground = state.ground;
  let crater = null;
  if (!impact.off) {
    for (const t of tanks) {
      const ty = groundYAt(state, t.x) - TANK_R * 0.5;
      const d = Math.hypot(impact.x - t.x, impact.y - ty);
      if (d < BLAST) {
        const dmg = Math.round(MAX_DMG * (1 - d / BLAST));
        t.hp = Math.max(0, t.hp - dmg);
      }
    }
    // deform the terrain (permanent, accumulates across the match)
    ground = carveCrater(state.ground, state.step, impact.x, impact.y, CRATER_R);
    crater = { x: impact.x, y: impact.y, r: CRATER_R };
  }

  const next = {
    ...state,
    tanks,
    ground,
    turn: playerIndex === 0 ? 1 : 0,
    wind: pickWind(),
    lastShot: { by: playerIndex, angle, power, path, impact, crater, blast: BLAST },
    seq: (state.seq || 0) + 1,
  };

  // resolve the round if a tank died
  const ad = tanks[0].hp <= 0;
  const bd = tanks[1].hp <= 0;
  if (ad || bd) {
    const winner = ad && bd ? null : ad ? 1 : 0; // null = draw round
    const scores = state.scores.slice();
    if (winner != null) scores[winner] += 1;
    next.scores = scores;
    // match decided? leave phase 'playing' so getResult reports it; else pause.
    if (winner == null || scores[winner] < state.roundsToWin) {
      next.phase = 'roundover';
      next.roundResult = { winner, scores };
    }
  }

  return { state: next };
}

function getResult(state) {
  const [s0, s1] = state.scores;
  if (s0 >= state.roundsToWin) return { over: true, winner: 0, draw: false };
  if (s1 >= state.roundsToWin) return { over: true, winner: 1, draw: false };
  return { over: false, winner: null, draw: false };
}

export default {
  id: 'artillery',
  name: 'Tank Duel',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
  advanceRound,
};
