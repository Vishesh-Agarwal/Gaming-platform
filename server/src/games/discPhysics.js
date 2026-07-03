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

// Apply english (spin) to a disc on its first object-ball contact, using the
// disc's travel direction just before impact. `along` > 0 is follow (cue rolls
// forward through the contact), < 0 is draw (cue comes back); `side` curves the
// rebound. Pure: deterministic, and a zero spin is a no-op.
const FOLLOW_K = 0.62, SIDE_K = 0.42;
function applySpin(d, pre) {
  const sp = Math.hypot(pre.vx, pre.vy) || 1;
  const fx = pre.vx / sp, fy = pre.vy / sp; // forward (travel) unit
  const px = -fy, py = fx;                   // perpendicular (left) unit
  d.vx += fx * sp * d.spin.along * FOLLOW_K + px * sp * d.spin.side * SIDE_K;
  d.vy += fy * sp * d.spin.along * FOLLOW_K + py * sp * d.spin.side * SIDE_K;
  d.spinApplied = true;
}

function inPocket(d, pockets) {
  for (const p of pockets) {
    if (Math.hypot(d.x - p.x, d.y - p.y) < p.r) return true;
  }
  return false;
}

// Bounce off the table bounds. Returns the impact speed along the flipped
// axes (0 when no wall was hit) so callers can report a rail event.
function bounceWalls(d, bounds, wallRest) {
  const loX = bounds.loX + d.r, hiX = bounds.hiX - d.r;
  const loY = bounds.loY + d.r, hiY = bounds.hiY - d.r;
  let impact = 0;
  if (d.x < loX) { d.x = loX; impact = Math.abs(d.vx); d.vx = -d.vx * wallRest; }
  else if (d.x > hiX) { d.x = hiX; impact = Math.abs(d.vx); d.vx = -d.vx * wallRest; }
  if (d.y < loY) { d.y = loY; impact = Math.max(impact, Math.abs(d.vy)); d.vy = -d.vy * wallRest; }
  else if (d.y > hiY) { d.y = hiY; impact = Math.max(impact, Math.abs(d.vy)); d.vy = -d.vy * wallRest; }
  return impact;
}

// Simulate a shot to rest. `discs` are not mutated. The cue/striker disc is
// identified by id 0 for first-contact reporting. Besides frames, returns an
// `events` timeline ({ f, type: 'ball'|'rail'|'pocket', id, id2?, speed },
// f = index into frames) so clients can sync sounds/animations to the replay.
export function simulateShot(discs, table) {
  const { bounds, pockets, friction, stopV, restitution, wallRest, maxSteps, frameEvery } = table;
  const live = discs.map((d) => ({ ...d }));
  const frames = [];
  const pocketed = [];
  const events = [];
  const touching = new Set(); // "id:id2" pairs currently overlapping (one event per touch)
  let firstContact = null;
  const snap = () => live.map((d) => ({ id: d.id, x: Math.round(d.x), y: Math.round(d.y) }));
  // Frame index the current step will land on (frames are pushed post-step).
  const frameAt = (step) => Math.floor(step / frameEvery);

  for (let step = 0; step < maxSteps; step++) {
    let moving = false;
    for (const d of live) {
      d.x += d.vx; d.y += d.vy;
      d.vx *= friction; d.vy *= friction;
      if (Math.hypot(d.vx, d.vy) < stopV) { d.vx = 0; d.vy = 0; }
      else moving = true;
    }
    const stillTouching = new Set();
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const key = `${a.id}:${b.id}`;
        const aPre = a.spin && !a.spinApplied ? { vx: a.vx, vy: a.vy } : null;
        const bPre = b.spin && !b.spinApplied ? { vx: b.vx, vy: b.vy } : null;
        const closing = Math.hypot(b.vx - a.vx, b.vy - a.vy);
        if (!resolve(a, b, restitution)) continue;
        stillTouching.add(key);
        if (!touching.has(key)) {
          events.push({ f: frameAt(step), type: 'ball', id: a.id, id2: b.id, speed: closing });
        }
        if (firstContact === null) {
          if (a.id === 0 && b.id !== 0) firstContact = b.id;
          else if (b.id === 0 && a.id !== 0) firstContact = a.id;
        }
        if (aPre) applySpin(a, aPre); // spinner's first object contact
        if (bPre) applySpin(b, bPre);
      }
    }
    touching.clear();
    for (const key of stillTouching) touching.add(key);
    for (let k = live.length - 1; k >= 0; k--) {
      if (inPocket(live[k], pockets)) {
        const d = live[k];
        events.push({ f: frameAt(step), type: 'pocket', id: d.id, speed: Math.hypot(d.vx, d.vy) });
        pocketed.push({ id: d.id });
        live.splice(k, 1);
      }
    }
    for (const d of live) {
      const impact = bounceWalls(d, bounds, wallRest);
      if (impact > 0) events.push({ f: frameAt(step), type: 'rail', id: d.id, speed: impact });
    }
    if (step % frameEvery === 0) frames.push(snap());
    if (!moving) break;
  }
  for (const d of live) { d.vx = 0; d.vy = 0; }
  frames.push(snap());
  const lastF = frames.length - 1;
  for (const e of events) if (e.f > lastF) e.f = lastF;
  return { frames, finalDiscs: live, pocketed, firstContact, events };
}
