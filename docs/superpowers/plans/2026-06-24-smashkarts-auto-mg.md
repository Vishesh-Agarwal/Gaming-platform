# Smash Karts Proximity Auto-MG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Smash Karts machine gun into a proximity auto-aim weapon: while held it auto-targets the nearest visible enemy within range and deals instant distance-scaled damage; with no valid target it still fires harmlessly and drains ammo.

**Architecture:** All changes are server-side in `server/src/games/karts.js`. Add a pure `lineOfSightClear` geometry helper, a pure `nearestTarget` selector and `mgDamage` falloff, then rewrite the `mg` branch of `step` to apply hitscan damage to the locked target and spawn a cosmetic bullet (rocket/mine unchanged; MG bullets become visual-only in the projectile loop). All logic is deterministic and unit-tested with `node --test`.

**Tech Stack:** Node ESM, `node --test` (run from the `server` package: `npm test --prefix server`).

## Global Constraints

- All combat logic stays in `server/src/games/karts.js`; firing/targeting/damage are server-authoritative (no client prediction of combat).
- Damage must route through the existing `damage(sim, victimIdx, dmg, ownerIdx, now)` so shield + spawn-protection absorb it and kill credit works.
- The snapshot `proj` shape stays `{ id, type, x, y, z, h }` — no client structural change.
- Only the MG changes. Rocket, mine, shield behavior is identical to today.
- Tuning values (verbatim): `MG_RANGE = 15`, `MG_DMG_NEAR = 8`, `MG_DMG_FAR = 2.5`; keep `MG.cadence = 90`, `MG.ammo = 24`, `MG.speed`, `MG.life`.
- Firing **always** spends one ammo + advances `nextShotAt` + spawns a cosmetic bullet, whether or not a target was hit; at ammo 0 set `weapon = null`.
- LOS blockers: box obstacles, cylinders, and flat wedge plateaus (`loY === hiY`). Sloped wedges (`loY !== hiY`) do NOT block. An obstacle whose footprint contains either endpoint is ignored.
- Targeting/range/damage use horizontal (x/z) distance.
- Server suite must stay green and gain coverage.

---

### Task 1: Line-of-sight helper

**Files:**
- Modify: `server/src/games/karts.js` (add geometry helpers + `export function lineOfSightClear`, after the `rand` helper near the top)
- Test: `server/test/lineOfSight.test.js`

**Interfaces:**
- Consumes: nothing (pure geometry over a `map` object's `obstacles`/`ramps`).
- Produces: `lineOfSightClear(map, x0, z0, x1, z1) -> boolean` (named export). `true` = clear line; `false` = a solid obstacle blocks it.

- [ ] **Step 1: Write the failing test**

Create `server/test/lineOfSight.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineOfSightClear } from '../src/games/karts.js';

const empty = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };

test('clear when nothing is in the way', () => {
  assert.equal(lineOfSightClear(empty, -10, 0, 10, 0), true);
});

test('a box blocks a segment crossing its footprint', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 0, w: 4, d: 4 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
});

test('a box off to the side does not block', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 20, w: 4, d: 4 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), true);
});

test('a cylinder blocks a segment crossing it', () => {
  const m = { obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 3 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
  const m2 = { obstacles: [{ kind: 'cyl', x: 0, z: 20, r: 3 }], ramps: [] };
  assert.equal(lineOfSightClear(m2, -10, 0, 10, 0), true);
});

test('a flat wedge plateau (loY===hiY) blocks like a box', () => {
  const m = { obstacles: [], ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 8, axis: 'z', loY: 4, hiY: 4 }] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
});

test('a sloped wedge (loY!==hiY) does NOT block', () => {
  const m = { obstacles: [], ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 8, axis: 'z', loY: 0, hiY: 4 }] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), true);
});

test('an obstacle containing an endpoint is ignored (target on a mesa is reachable)', () => {
  const m = { obstacles: [{ kind: 'box', x: 8, z: 0, w: 6, d: 6 }], ramps: [] };
  // endpoint (8,0) is inside the box footprint -> that box must not block
  assert.equal(lineOfSightClear(m, -10, 0, 8, 0), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `lineOfSightClear` is not exported (`... is not a function`).

- [ ] **Step 3: Write the implementation**

In `server/src/games/karts.js`, add the following directly after the `const rand = ...` line near the top of the file:

```js
// --- line-of-sight geometry (2D, x/z plane) -------------------------------
function pointInRect(px, pz, minX, minZ, maxX, maxZ) {
  return px >= minX && px <= maxX && pz >= minZ && pz <= maxZ;
}
function pointInCircle(px, pz, cx, cz, r) {
  const dx = px - cx, dz = pz - cz;
  return dx * dx + dz * dz <= r * r;
}
// True if segment A->B passes within r of circle center C.
function segHitsCircle(ax, az, bx, bz, cx, cz, r) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((cx - ax) * abx + (cz - az) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + abx * t, pz = az + abz * t;
  const dx = cx - px, dz = cz - pz;
  return dx * dx + dz * dz < r * r;
}
// Segment A->B vs axis-aligned rectangle (Liang–Barsky clip).
function segHitsRect(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const edges = [[-dx, ax - minX], [dx, maxX - ax], [-dz, az - minZ], [dz, maxZ - az]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; } // parallel & outside
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

// True if the straight line from (x0,z0) to (x1,z1) is not blocked by any solid
// obstacle: box footprints, cylinders, and flat wedge plateaus (loY === hiY).
// Sloped wedges do not block. An obstacle whose footprint contains either
// endpoint is ignored (a kart on a mesa is reachable; a shooter isn't self-blocked).
export function lineOfSightClear(map, x0, z0, x1, z1) {
  for (const o of (map.obstacles || [])) {
    if (o.kind === 'cyl') {
      if (pointInCircle(x0, z0, o.x, o.z, o.r) || pointInCircle(x1, z1, o.x, o.z, o.r)) continue;
      if (segHitsCircle(x0, z0, x1, z1, o.x, o.z, o.r)) return false;
    } else {
      const hw = o.w / 2, hd = o.d / 2;
      const minX = o.x - hw, minZ = o.z - hd, maxX = o.x + hw, maxZ = o.z + hd;
      if (pointInRect(x0, z0, minX, minZ, maxX, maxZ) || pointInRect(x1, z1, minX, minZ, maxX, maxZ)) continue;
      if (segHitsRect(x0, z0, x1, z1, minX, minZ, maxX, maxZ)) return false;
    }
  }
  for (const r of (map.ramps || [])) {
    if (r.loY !== r.hiY) continue; // sloped ramps don't block
    const hw = r.w / 2, hd = r.d / 2;
    const minX = r.x - hw, minZ = r.z - hd, maxX = r.x + hw, maxZ = r.z + hd;
    if (pointInRect(x0, z0, minX, minZ, maxX, maxZ) || pointInRect(x1, z1, minX, minZ, maxX, maxZ)) continue;
    if (segHitsRect(x0, z0, x1, z1, minX, minZ, maxX, maxZ)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — all `lineOfSight` tests green, existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add server/src/games/karts.js server/test/lineOfSight.test.js
git commit -m "feat(karts): line-of-sight helper for auto-MG targeting"
```

---

### Task 2: Target selection + damage falloff

**Files:**
- Modify: `server/src/games/karts.js` (add `MG_RANGE`/`MG_DMG_NEAR`/`MG_DMG_FAR` constants near the other weapon constants; add `export function mgDamage` and `export function nearestTarget`)
- Test: `server/test/autoMgSelect.test.js`

**Interfaces:**
- Consumes: `lineOfSightClear` (Task 1); the module `clamp` helper.
- Produces:
  - `mgDamage(dist: number) -> number` (named export) — linear falloff.
  - `nearestTarget(sim, self: number, map) -> number | null` (named export) — index of the nearest valid MG target for shooter index `self`, or `null`.

- [ ] **Step 1: Write the failing test**

Create `server/test/autoMgSelect.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mgDamage, nearestTarget } from '../src/games/karts.js';

const openMap = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };

// helper: minimal sim of karts at given positions, all alive
function simAt(positions) {
  return {
    karts: positions.map(([x, z], i) => ({ x, z, y: 0, alive: true, gone: false, i })),
  };
}

test('mgDamage falls off linearly from near to far', () => {
  assert.equal(mgDamage(0), 8);
  assert.equal(mgDamage(15), 2.5);
  assert.equal(mgDamage(7.5), 5.25);
  assert.equal(mgDamage(30), 2.5); // clamped beyond range
});

test('nearestTarget picks the closest enemy in range', () => {
  const sim = simAt([[0, 0], [5, 0], [10, 0]]);
  assert.equal(nearestTarget(sim, 0, openMap), 1); // 5 is closer than 10
});

test('nearestTarget returns null when the only enemy is beyond range', () => {
  const sim = simAt([[0, 0], [20, 0]]); // 20 > MG_RANGE(15)
  assert.equal(nearestTarget(sim, 0, openMap), null);
});

test('nearestTarget skips a closer enemy behind a wall and picks a farther visible one', () => {
  const sim = simAt([[0, 0], [4, 0], [10, 0]]);
  const blocked = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 2, z: 0, w: 2, d: 2 }], ramps: [] };
  // the box at x=2 blocks the line to kart 1 (x=4) but not to kart 2 (x=10)
  assert.equal(nearestTarget(sim, 0, blocked), 2);
});

test('nearestTarget excludes self, dead, and gone karts', () => {
  const sim = simAt([[0, 0], [3, 0], [4, 0]]);
  sim.karts[1].alive = false; // nearest is dead
  assert.equal(nearestTarget(sim, 0, openMap), 2);
  sim.karts[2].gone = true;   // next is gone
  assert.equal(nearestTarget(sim, 0, openMap), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `mgDamage`/`nearestTarget` not exported.

- [ ] **Step 3: Write the implementation**

In `server/src/games/karts.js`, add the three constants next to the other weapon constants (just after the `const MG = ...` line):

```js
const MG_RANGE = 15, MG_DMG_NEAR = 8, MG_DMG_FAR = 2.5;
```

Then add these two exports (place them after `lineOfSightClear`):

```js
// Linear MG damage falloff: MG_DMG_NEAR at point-blank -> MG_DMG_FAR at MG_RANGE.
export function mgDamage(dist) {
  const t = clamp(dist / MG_RANGE, 0, 1);
  return MG_DMG_NEAR + (MG_DMG_FAR - MG_DMG_NEAR) * t;
}

// Index of the nearest valid MG target for shooter `self`, or null.
// Valid = alive, not gone, not self, horizontal distance < MG_RANGE, clear LOS.
export function nearestTarget(sim, self, map) {
  const k = sim.karts[self];
  let best = null, bestD2 = MG_RANGE * MG_RANGE;
  for (let i = 0; i < sim.karts.length; i++) {
    if (i === self) continue;
    const t = sim.karts[i];
    if (!t.alive || t.gone) continue;
    const dx = t.x - k.x, dz = t.z - k.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= bestD2) continue;
    if (!lineOfSightClear(map, k.x, k.z, t.x, t.z)) continue;
    best = i; bestD2 = d2;
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — all `autoMgSelect` tests green, existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add server/src/games/karts.js server/test/autoMgSelect.test.js
git commit -m "feat(karts): MG damage falloff + nearest-target selection"
```

---

### Task 3: Auto-MG firing in step + cosmetic bullets

**Files:**
- Modify: `server/src/games/karts.js` (`fireProjectile` gains an aimed-MG path; the `mg` branch of `step` is rewritten; the projectile loop makes MG bullets cosmetic)
- Test: `server/test/autoMg.test.js`

**Interfaces:**
- Consumes: `nearestTarget`, `mgDamage` (Task 2); existing `damage`, `fireProjectile`, `MG`, `BARREL`, `KART_CENTER`, `GRAVITY_PROJ`, `ROCKET`, `surfaceHeight`.
- Produces: no new exports; behavior change to `step`. MG projectiles now carry `cosmetic: true` and deal no damage while travelling.

- [ ] **Step 1: Write the failing test**

Create `server/test/autoMg.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

// Build a 2+-kart 'arena' sim, started, with karts placed on the +x axis
// (x >= 20, z = 0) — clear of arena's central plateau (x,z in [-8,8]).
function startedSim(positions) {
  const sim = game.createSim(positions.map(() => ({})), 0, { map: 'arena' });
  positions.forEach(([x, z], i) => {
    sim.karts[i].x = x; sim.karts[i].z = z; sim.karts[i].y = 0;
    sim.karts[i].grounded = true; sim.karts[i].vy = 0;
  });
  return sim;
}
const fire = (n, who) => Array.from({ length: n }, (_, i) => (i === who ? { last: { fire: true } } : {}));
const NOW = 5000; // > startAt (countdown 3000), < endsAt

test('MG damages the nearest visible enemy with distance falloff', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]); // dist 7.5 -> mgDamage = 5.25
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100 - 5.25);
  assert.equal(sim.karts[0].ammo, 23);
  assert.equal(sim.projectiles.length, 1);
  assert.equal(sim.projectiles[0].type, 'mg');
});

test('idle fire (no target in range) still spends ammo and spawns a bullet, no damage', () => {
  const sim = startedSim([[20, 0], [39, 0]]); // dist 19 > range 15
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100);   // untouched
  assert.equal(sim.karts[0].ammo, 23);  // still spent
  assert.equal(sim.projectiles.length, 1);
});

test('a shielded nearest target absorbs damage but ammo is still spent', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  sim.karts[1].shieldUntil = NOW + 1000;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100);
  assert.equal(sim.karts[0].ammo, 23);
});

test('firing the last round clears the weapon (must re-collect a crate)', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 1; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[0].ammo, 0);
  assert.equal(sim.karts[0].weapon, null);
});

test('a cosmetic MG bullet deals no damage as it travels', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  // stationary cosmetic bullet sitting on top of kart 1
  sim.projectiles.push({ id: 99, type: 'mg', owner: 0, h: 0, x: 27.5, z: 0, y: 1, vx: 0, vz: 0, vy: 0, life: 1, cosmetic: true });
  game.step(sim, fire(2, 0).map(() => ({})), 1 / 30, NOW); // nobody fires
  assert.equal(sim.karts[1].hp, 100);
});

test('an MG kill credits the shooter', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  sim.karts[1].hp = 3; // < mgDamage(7.5)=5.25
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].alive, false);
  assert.equal(sim.karts[0].kills, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — the current MG fires straight ahead with flat damage, so the falloff value, idle-fire-spends-ammo, and cosmetic-bullet assertions fail.

- [ ] **Step 3: Rewrite `fireProjectile`**

Replace the entire `fireProjectile` function with this version (adds an optional `target` for aimed cosmetic MG bullets; rocket/mine paths unchanged):

```js
function fireProjectile(sim, k, owner, type, now, map, target = null) {
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (type === 'mine') {
    const mx = k.x - fx * 3, mz = k.z - fz * 3;
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mine', owner, x: mx, z: mz, y: surfaceHeight(map, mx, mz),
      vx: 0, vz: 0, vy: 0, armAt: now + MINE.arm, dieAt: now + MINE.life,
    });
    return;
  }
  if (type === 'mg') {
    // cosmetic only — damage is applied as hitscan at fire time. Aim at the
    // target if there is one, otherwise straight ahead (idle fire).
    let dx = fx, dz = fz, dy = 0;
    if (target) {
      const tx = target.x - k.x, tz = target.z - k.z;
      const ty = ((target.y || 0) + KART_CENTER) - ((k.y || 0) + BARREL);
      const len = Math.hypot(tx, tz) || 1;
      dx = tx / len; dz = tz / len; dy = ty / len;
    }
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mg', owner, h: Math.atan2(dx, dz),
      x: k.x + dx * 3, z: k.z + dz * 3, y: (k.y || 0) + BARREL,
      vx: dx * MG.speed, vz: dz * MG.speed, vy: dy * MG.speed, life: MG.life,
      cosmetic: true,
    });
    return;
  }
  // rocket — real, forward
  sim.projectiles.push({
    id: sim.nextPid++, type, owner, h: k.heading,
    x: k.x + fx * 3, z: k.z + fz * 3, y: (k.y || 0) + BARREL,
    vx: fx * ROCKET.speed, vz: fz * ROCKET.speed, vy: ROCKET_VY, life: ROCKET.life,
  });
}
```

- [ ] **Step 4: Rewrite the `mg` branch of `step`**

In `step`, replace the current `if (k.weapon === 'mg') { ... }` block with:

```js
    if (k.weapon === 'mg') {
      if (fire && k.ammo > 0 && now >= k.nextShotAt) {
        const t = nearestTarget(sim, i, map);
        if (t != null) {
          const tg = sim.karts[t];
          const dist = Math.hypot(tg.x - k.x, tg.z - k.z);
          damage(sim, t, mgDamage(dist), i, now);
          fireProjectile(sim, k, i, 'mg', now, map, tg);
        } else {
          fireProjectile(sim, k, i, 'mg', now, map, null); // idle fire
        }
        k.ammo -= 1; k.nextShotAt = now + MG.cadence;
        if (k.ammo <= 0) k.weapon = null;
      }
    } else if (k.weapon === 'rocket' || k.weapon === 'mine') {
```

(The `else if (k.weapon === 'rocket' || k.weapon === 'mine')` line is the existing next branch — keep it and everything after unchanged.)

- [ ] **Step 5: Make MG bullets cosmetic in the projectile loop**

In `step`'s projectile loop, the travelling-projectile `else` branch currently hit-tests every non-owner kart for both mg and rocket. Gate that hit-test so cosmetic bullets never damage. Replace:

```js
      else {
        for (let i = 0; i < sim.karts.length; i++) {
          if (i === pr.owner) continue;
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          const dx = k.x - pr.x, dz = k.z - pr.z, dy = (k.y || 0) + KART_CENTER - pr.y;
          if (dx * dx + dz * dz + dy * dy < HIT_R * HIT_R) {
            damage(sim, i, spec.dmg, pr.owner, now);
            dead = true; break;
          }
        }
      }
```

with:

```js
      else if (!pr.cosmetic) { // cosmetic MG bullets are visual-only
        for (let i = 0; i < sim.karts.length; i++) {
          if (i === pr.owner) continue;
          const k = sim.karts[i];
          if (!k.alive || k.gone) continue;
          const dx = k.x - pr.x, dz = k.z - pr.z, dy = (k.y || 0) + KART_CENTER - pr.y;
          if (dx * dx + dz * dz + dy * dy < HIT_R * HIT_R) {
            damage(sim, i, spec.dmg, pr.owner, now);
            dead = true; break;
          }
        }
      }
```

(The `const spec = pr.type === 'mg' ? MG : ROCKET;` line just above stays; only rockets now reach the hit-test, so `spec` is always `ROCKET` there — harmless.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — all `autoMg` tests green, and the whole suite (incl. `projectiles3d`, `prediction`, etc.) still green.

- [ ] **Step 7: Confirm the client needs no change**

Run: `grep -n "proj" client/src/games/Karts.jsx | head`
Confirm the client reads MG bullets from the unchanged `proj` snapshot list (`{ id, type, x, y, z, h }`). The `cosmetic` flag stays server-side (not serialized in `snapshot`). No client edit required.

- [ ] **Step 8: Commit**

```bash
git add server/src/games/karts.js server/test/autoMg.test.js
git commit -m "feat(karts): proximity auto-MG firing (hitscan + cosmetic bullets)"
```

---

## Self-Review

**Spec coverage:**
- Hold-fire trigger, nearest-visible-target lock, distance damage → Task 3 `mg` branch + Task 2 `nearestTarget`/`mgDamage`. ✓
- Range 15 + LOS (boxes/cyls/flat plateaus block, sloped don't, endpoint-containment ignored) → Task 1 `lineOfSightClear`, used by Task 2. ✓
- Hitscan via `damage()` (shield/spawn-protect/kill-credit preserved) → Task 3. ✓
- Always fire + drain ammo (idle fire forward, no damage) → Task 3 `mg` branch. ✓
- Ammo 0 clears weapon (re-collect crate) → Task 3 (`if (k.ammo <= 0) k.weapon = null`; existing pickup re-arms). ✓
- MG bullets cosmetic (no travel damage); rocket/mine unchanged → Task 3 Steps 3 + 5. ✓
- Snapshot `proj` shape unchanged → Task 3 Step 7. ✓
- Full server test coverage → Tasks 1-3 test files. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every test has real assertions on behavior.

**Type consistency:** `lineOfSightClear(map,x0,z0,x1,z1)` (Task 1) is consumed by `nearestTarget` (Task 2) with matching args; `nearestTarget(sim,self,map)`/`mgDamage(dist)` (Task 2) consumed in Task 3 `step` with matching args; `fireProjectile(sim,k,owner,type,now,map,target?)` (Task 3) — the new optional `target` is the only signature change and existing rocket/mine callers omit it. Cosmetic-flag field name `cosmetic` is consistent between `fireProjectile` (sets it) and the projectile loop (reads it).
