// server/src/games/carromPhysics.js
// Pure 2D rigid-disc physics for Carrom. No game rules live here — just Newton.
// Coordinate space: x right, y down (canvas convention). The board is a square
// with pockets at the four inset corners. Determinism: pure float math, no RNG,
// so the same input always yields the same result (used by the rules layer and
// unit tests).

export const BOARD = { W: 900, H: 900, inset: 72, coinR: 18, strikerR: 22, pocketR: 34 };

export const POCKETS = [
  { x: BOARD.inset, y: BOARD.inset },
  { x: BOARD.W - BOARD.inset, y: BOARD.inset },
  { x: BOARD.inset, y: BOARD.H - BOARD.inset },
  { x: BOARD.W - BOARD.inset, y: BOARD.H - BOARD.inset },
];

const FRICTION = 0.985;     // velocity retained per substep
const STOP_V = 0.06;        // below this speed a disc is snapped to rest
const RESTITUTION = 0.92;   // disc-disc bounciness
const WALL_REST = 0.7;      // rail bounciness
const MAX_STEPS = 3000;     // hard cap so a shot always terminates
const FRAME_EVERY = 2;      // record a frame every N substeps

function inPocket(d) {
  for (const p of POCKETS) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < BOARD.pocketR) return true;
  }
  return false;
}

function bounceWalls(d) {
  const loX = BOARD.inset + d.r, hiX = BOARD.W - BOARD.inset - d.r;
  const loY = BOARD.inset + d.r, hiY = BOARD.H - BOARD.inset - d.r;
  if (d.x < loX) { d.x = loX; d.vx = -d.vx * WALL_REST; }
  else if (d.x > hiX) { d.x = hiX; d.vx = -d.vx * WALL_REST; }
  if (d.y < loY) { d.y = loY; d.vy = -d.vy * WALL_REST; }
  else if (d.y > hiY) { d.y = hiY; d.vy = -d.vy * WALL_REST; }
}

function resolveCollision(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const minDist = a.r + b.r;
  if (dist >= minDist) return;
  const nx = dx / dist, ny = dy / dist;
  const totInv = 1 / a.mass + 1 / b.mass;
  // positional separation so discs don't sink into each other
  const overlap = minDist - dist;
  a.x -= nx * overlap * (1 / a.mass) / totInv;
  a.y -= ny * overlap * (1 / a.mass) / totInv;
  b.x += nx * overlap * (1 / b.mass) / totInv;
  b.y += ny * overlap * (1 / b.mass) / totInv;
  // elastic impulse along the normal
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn > 0) return; // already separating
  const j = -(1 + RESTITUTION) * vn / totInv;
  const ix = j * nx, iy = j * ny;
  a.vx -= ix / a.mass; a.vy -= iy / a.mass;
  b.vx += ix / b.mass; b.vy += iy / b.mass;
}

function snapshot(live) {
  return live.map((d) => ({ id: d.id, color: d.color, x: Math.round(d.x), y: Math.round(d.y) }));
}

export function simulateShot(discs) {
  const live = discs.map((d) => ({ ...d }));
  const frames = [];
  const pocketed = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    let moving = false;
    for (const d of live) {
      d.x += d.vx; d.y += d.vy;
      d.vx *= FRICTION; d.vy *= FRICTION;
      if (Math.hypot(d.vx, d.vy) < STOP_V) { d.vx = 0; d.vy = 0; }
      else moving = true;
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) resolveCollision(live[i], live[j]);
    }
    for (let k = live.length - 1; k >= 0; k--) {
      if (inPocket(live[k])) { pocketed.push({ id: live[k].id, color: live[k].color }); live.splice(k, 1); }
    }
    for (const d of live) bounceWalls(d);
    if (step % FRAME_EVERY === 0) frames.push(snapshot(live));
    if (!moving) break;
  }
  for (const d of live) { d.vx = 0; d.vy = 0; }
  frames.push(snapshot(live));
  return { frames, finalDiscs: live, pocketed };
}
