// Shared 2D rigid-disc physics solver for board games (Carrom, Pool). Pure: no
// game rules and no hardcoded geometry — the caller passes a `table` describing
// bounds, pockets, and tuning. Coordinate space: x right, y down (canvas).
// Deterministic (no RNG), so identical input yields identical output.

// Elastic collision between two discs with positional separation. Returns true
// if they were overlapping (i.e. a contact happened this step).
function resolve(a, b, restitution) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const minDist = a.r + b.r;
  if (dist >= minDist) return false;
  const nx = dx / dist, ny = dy / dist;
  const totInv = 1 / a.mass + 1 / b.mass;
  // separate so discs don't sink into each other
  const overlap = minDist - dist;
  a.x -= nx * overlap * (1 / a.mass) / totInv;
  a.y -= ny * overlap * (1 / a.mass) / totInv;
  b.x += nx * overlap * (1 / b.mass) / totInv;
  b.y += ny * overlap * (1 / b.mass) / totInv;
  // elastic impulse along the normal
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn > 0) return true; // already separating, but they did touch
  const j = -(1 + restitution) * vn / totInv;
  const ix = j * nx, iy = j * ny;
  a.vx -= ix / a.mass; a.vy -= iy / a.mass;
  b.vx += ix / b.mass; b.vy += iy / b.mass;
  return true;
}

function inPocket(d, pockets) {
  for (const p of pockets) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < p.r) return true;
  }
  return false;
}

function bounceWalls(d, bounds, wallRest) {
  const loX = bounds.loX + d.r, hiX = bounds.hiX - d.r;
  const loY = bounds.loY + d.r, hiY = bounds.hiY - d.r;
  if (d.x < loX) { d.x = loX; d.vx = -d.vx * wallRest; }
  else if (d.x > hiX) { d.x = hiX; d.vx = -d.vx * wallRest; }
  if (d.y < loY) { d.y = loY; d.vy = -d.vy * wallRest; }
  else if (d.y > hiY) { d.y = hiY; d.vy = -d.vy * wallRest; }
}

// Simulate a shot to rest. `discs` are not mutated. The cue/striker disc is
// identified by id 0 for first-contact reporting.
export function simulateShot(discs, table) {
  const { bounds, pockets, friction, stopV, restitution, wallRest, maxSteps, frameEvery } = table;
  const live = discs.map((d) => ({ ...d }));
  const frames = [];
  const pocketed = [];
  let firstContact = null;
  const snap = () => live.map((d) => ({ id: d.id, x: Math.round(d.x), y: Math.round(d.y) }));

  for (let step = 0; step < maxSteps; step++) {
    let moving = false;
    for (const d of live) {
      d.x += d.vx; d.y += d.vy;
      d.vx *= friction; d.vy *= friction;
      if (Math.hypot(d.vx, d.vy) < stopV) { d.vx = 0; d.vy = 0; }
      else moving = true;
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (!resolve(live[i], live[j], restitution)) continue;
        if (firstContact === null) {
          if (live[i].id === 0 && live[j].id !== 0) firstContact = live[j].id;
          else if (live[j].id === 0 && live[i].id !== 0) firstContact = live[i].id;
        }
      }
    }
    for (let k = live.length - 1; k >= 0; k--) {
      if (inPocket(live[k], pockets)) { pocketed.push({ id: live[k].id }); live.splice(k, 1); }
    }
    for (const d of live) bounceWalls(d, bounds, wallRest);
    if (step % frameEvery === 0) frames.push(snap());
    if (!moving) break;
  }
  for (const d of live) { d.vx = 0; d.vy = 0; }
  frames.push(snap());
  return { frames, finalDiscs: live, pocketed, firstContact };
}
