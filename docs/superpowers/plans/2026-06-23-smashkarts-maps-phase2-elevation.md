# Smash Karts — Maps Phase 2: Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give karts a vertical dimension — drive up ramps onto mesas, launch off lips into steer-only ballistic flight, land, and fight across height, fully server-authoritative + predicted, with 3D projectiles.

**Architecture:** Extend the single shared, byte-identical, parity-tested `integrateKart` with `y`/`vy`/`grounded` and a `surfaceHeight(map,x,z)` sampler. Projectiles stay server-only (rendered from snapshots), so 3D projectiles never touch the parity core. Client predicts/reconciles the new vertical state through the same integrator.

**Tech Stack:** Node ESM + `node --test` (server), React + Vite + Three.js (client). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-23-smashkarts-maps-phase2-elevation-design.md`

## Global Constraints

- `server/src/games/kartPhysics.js` and `client/src/games/karts/kartPhysics.js` MUST stay **byte-identical**; `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` MUST stay **byte-identical**. Parity tests (`physicsParity.test.js`, `mapsParity.test.js`) enforce this — both must stay green after every shared-file change.
- All sim/reconciled kart state (`x,z,heading,vel,y,vy,grounded`) lives ONLY in the shared integrator. No second movement code path.
- Fixed timestep `SIM_DT = 1/30`. Determinism: every new field is a pure function of `(k, input, dt, map)`.
- No new npm dependencies. Server is ESM (`"type":"module"`); tests run with `cd server && npm test` (`node --test test/`).
- Phase-1 flat maps (`arena`/`pillars`/`gauntlet` before retrofit) must keep identical feel: with no ramps and boxes at default `top`, karts never leave `y=0`.
- New tuning constants (`GRAVITY=30`, `SNAP=2.0`, `LAUNCH_MIN=3`, projectile `BARREL=1.0`, `KART_CENTER=1.0`, `GRAVITY_PROJ=9`, `ROCKET_VY=4`) are defined exactly as given here and locked by tests.

---

## File Structure

- `server/src/games/kartPhysics.js` + `client/src/games/karts/kartPhysics.js` — add `surfaceHeight`, extend `integrateKart` with vertical state + launch. (byte-identical)
- `server/src/games/kartMaps.js` + `client/src/games/karts/kartMaps.js` — `box.top` field, `ramps:[{kind:'wedge',...}]`, retrofit maps + new map. (byte-identical)
- `server/src/games/karts.js` — seed/respawn `y/vy/grounded`, 3D projectiles, snapshot fields.
- `client/src/games/Karts.jsx` — reconcile `y/vy/grounded`, render karts at `y` + tilt, height-aware camera, projectiles at `y`.
- `client/src/games/karts/scene.js` — render wedges + box mesas.
- `server/test/` — new: `surfaceHeight.test.js`, `elevation.test.js`, `launch.test.js`, `projectiles3d.test.js`; extend `maps.test.js`, `prediction.test.js`.

---

## Task 1: surfaceHeight + map data shape

**Files:**
- Modify: `server/src/games/kartPhysics.js`, `client/src/games/karts/kartPhysics.js` (add `surfaceHeight`, keep byte-identical)
- Test: `server/test/surfaceHeight.test.js`

**Interfaces:**
- Produces: `surfaceHeight(map, x, z) -> number` — max walkable surface height at (x,z); ground default `0`. Boxes contribute `box.top ?? 3` inside footprint; wedges contribute linear slope `loY→hiY` along `axis`; cylinders contribute nothing.

- [ ] **Step 1: Write the failing test** — `server/test/surfaceHeight.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceHeight } from '../src/games/kartPhysics.js';

const map = {
  arena: { w: 80, d: 80 },
  obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10, top: 6 }],
  ramps: [{ kind: 'wedge', x: 20, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
};

test('default ground is 0 off all primitives', () => {
  assert.equal(surfaceHeight(map, 40, 40), 0);
});

test('box footprint returns its top', () => {
  assert.equal(surfaceHeight(map, 0, 0), 6);
  assert.equal(surfaceHeight(map, 4.9, 0), 6);
  assert.equal(surfaceHeight(map, 5.1, 0), 0); // just outside footprint
});

test('box without explicit top defaults to 3', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 0, w: 4, d: 4 }] };
  assert.equal(surfaceHeight(m, 0, 0), 3);
});

test('wedge interpolates linearly along its axis', () => {
  // wedge spans z in [-6, 6], loY at low edge (z=-6), hiY at high edge (z=6)
  assert.equal(surfaceHeight(map, 20, -6), 0);
  assert.equal(surfaceHeight(map, 20, 0), 3);
  assert.equal(surfaceHeight(map, 20, 6), 6);
});

test('overlapping primitives -> max height wins', () => {
  const m = {
    obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10, top: 2 }],
    ramps: [{ kind: 'wedge', x: 0, z: 0, w: 10, d: 10, axis: 'z', loY: 0, hiY: 8 }],
  };
  assert.equal(surfaceHeight(m, 0, 5), 8); // wedge high edge beats box top 2
});

test('cylinders are not walkable (contribute nothing)', () => {
  const m = { obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 5 }] };
  assert.equal(surfaceHeight(m, 0, 0), 0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/surfaceHeight.test.js`
Expected: FAIL — `surfaceHeight is not a function`.

- [ ] **Step 3: Add `surfaceHeight` to `server/src/games/kartPhysics.js`**

Insert after the `clamp` helper (before `integrateKart`):

```js
// Height of the highest walkable surface column at (x, z). Default ground = 0.
// Boxes contribute their flat top (box.top ?? 3) within their footprint;
// wedges contribute a linear slope; cylinders are not walkable.
export function surfaceHeight(map, x, z) {
  let h = 0;
  if (map && map.obstacles) {
    for (const o of map.obstacles) {
      if (o.kind !== 'box') continue;
      const hw = o.w / 2, hd = o.d / 2;
      if (x >= o.x - hw && x <= o.x + hw && z >= o.z - hd && z <= o.z + hd) {
        const top = o.top == null ? 3 : o.top;
        if (top > h) h = top;
      }
    }
  }
  if (map && map.ramps) {
    for (const r of map.ramps) {
      const hw = r.w / 2, hd = r.d / 2;
      if (x >= r.x - hw && x <= r.x + hw && z >= r.z - hd && z <= r.z + hd) {
        const t = r.axis === 'x' ? (x - (r.x - hw)) / r.w : (z - (r.z - hd)) / r.d;
        const tc = t < 0 ? 0 : t > 1 ? 1 : t;
        const ry = r.loY + (r.hiY - r.loY) * tc;
        if (ry > h) h = ry;
      }
    }
  }
  return h;
}
```

- [ ] **Step 4: Copy byte-identical to the client**

Run: `cp server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js`

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: PASS — `surfaceHeight.test.js` green, `physicsParity.test.js` still green (files identical).

- [ ] **Step 6: Commit**

```bash
git add server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js server/test/surfaceHeight.test.js
git commit -m "feat(karts): add surfaceHeight sampler + ramp/mesa map data shape"
```

---

## Task 2: Integrator vertical core (gravity, landing, air control, height-gated boxes)

**Files:**
- Modify: `server/src/games/kartPhysics.js`, `client/src/games/karts/kartPhysics.js` (byte-identical)
- Test: `server/test/elevation.test.js`

**Interfaces:**
- Consumes: `surfaceHeight` (Task 1).
- Produces: `integrateKart(k, input, dt, map)` now reads/writes `k.y`, `k.vy`, `k.grounded` (defaulting `y=0, vy=0, grounded=true` when absent). Grounded karts get accel/drag/boost; airborne karts carry horizontal momentum (no accel/drag) but still turn; gravity + landing resolve vertical; box push-out is gated to `k.y < box.top`. **Launch is NOT in this task** (ramps just glue) — added in Task 3.

- [ ] **Step 1: Write the failing test** — `server/test/elevation.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT, PHYS } from '../src/games/kartPhysics.js';

const flat = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [], boosts: [] };
const mesa = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 0, z: 0, w: 12, d: 12, top: 6 }], ramps: [] };
const noInput = { throttle: 0, steer: 0 };

test('grounded kart on flat ground stays at y=0', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 10, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 10; i++) integrateKart(k, noInput, SIM_DT, flat);
  assert.equal(k.y, 0);
  assert.equal(k.grounded, true);
});

test('airborne kart falls under gravity and lands at the surface', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 0, y: 10, vy: 0, grounded: false };
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) { integrateKart(k, noInput, SIM_DT, flat); landed = k.grounded; }
  assert.equal(k.grounded, true);
  assert.equal(k.y, 0);
  assert.equal(k.vy, 0);
});

test('air control: heading turns but throttle does not change vel in air', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 12, y: 20, vy: 0, grounded: false };
  const h0 = k.heading;
  integrateKart(k, { throttle: 1, steer: 1 }, SIM_DT, flat);
  assert.equal(k.vel, 12); // no accel/drag in air
  assert.notEqual(k.heading, h0); // heading still turns
});

test('drives onto a mesa from the air (lands on top, no push-out)', () => {
  // start above the box footprint, falling — should land on top at y=6
  const k = { x: 0, z: 0, heading: 0, vel: 0, y: 12, vy: 0, grounded: false };
  for (let i = 0; i < 60 && !k.grounded; i++) integrateKart(k, noInput, SIM_DT, mesa);
  assert.equal(k.grounded, true);
  assert.equal(k.y, 6);
  assert.equal(k.x, 0); // not shoved out — we are above the top
});

test('box below the top still walls a ground-level kart', () => {
  // ground-level kart driving into the box side is pushed back out
  const k = { x: -10, z: 0, heading: Math.PI / 2, vel: 20, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, mesa);
  // never penetrates: stays at least KART_R outside the footprint edge (-6)
  assert.ok(k.x <= -6 - PHYS.KART_R + 0.01, `x=${k.x} should be left of the box`);
});

test('driving off a mesa edge starts a fall (does not snap to ground)', () => {
  // sitting on the mesa top near the +x edge, driving outward
  const k = { x: 5, z: 0, heading: Math.PI / 2, vel: 20, y: 6, vy: 0, grounded: true };
  integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, mesa); // crosses x=6 edge
  assert.equal(k.grounded, false, 'should be airborne after leaving the edge');
  assert.ok(k.y > 1, `y=${k.y} should not have snapped to ground`);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/elevation.test.js`
Expected: FAIL — current `integrateKart` ignores `y/vy/grounded`.

- [ ] **Step 3: Add constants + rewrite `integrateKart` (no launch yet)**

In `PHYS`, add `GRAVITY: 30, SNAP: 2`:

```js
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.1, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
  GRAVITY: 30, SNAP: 2,
};
```

Replace the body of `integrateKart` with:

```js
export function integrateKart(k, input, dt, map = null) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D, GRAVITY, SNAP } = PHYS;
  if (k.y == null) k.y = 0;
  if (k.vy == null) k.vy = 0;
  if (k.grounded == null) k.grounded = true;
  const d = clamp(dt, 0, 0.1);
  const px = k.x, pz = k.z;
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);

  // horizontal accel/drag/boost only when grounded; in air, momentum is carried
  if (k.grounded) {
    if (throttle > 0) k.vel += ACCEL * throttle * d;
    else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
    k.vel -= k.vel * Math.min(1, DRAG * d);
    k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
    if (map && map.boosts) {
      for (const b of map.boosts) {
        const bx = k.x - b.x, bz = k.z - b.z;
        if (bx * bx + bz * bz < b.r * b.r && k.vel < b.strength) k.vel = b.strength;
      }
    }
  }
  // heading turns in both states (steer-only air control)
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading -= steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;

  // arena perimeter clamp — always (full-height walls)
  const aw = (map && map.arena) ? map.arena.w : ARENA_W;
  const ad = (map && map.arena) ? map.arena.d : ARENA_D;
  const half = aw / 2 - KART_R, halfD = ad / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }

  // obstacle push-out: boxes height-gated (wall only while below the top); cyl always solid
  if (map && map.obstacles) {
    for (const o of map.obstacles) {
      if (o.kind === 'cyl') {
        const dx = k.x - o.x, dz = k.z - o.z;
        const dist = Math.hypot(dx, dz), min = KART_R + o.r;
        if (dist < min) {
          if (dist > 1e-6) { k.x = o.x + (dx / dist) * min; k.z = o.z + (dz / dist) * min; }
          else { k.x = o.x + min; }
          k.vel *= 0.4;
        }
      } else {
        const top = o.top == null ? 3 : o.top;
        if (k.y >= top - 0.01) continue; // on/above the mesa top — not a wall
        const hw = o.w / 2, hd = o.d / 2;
        const cx = clamp(k.x, o.x - hw, o.x + hw);
        const cz = clamp(k.z, o.z - hd, o.z + hd);
        const dx = k.x - cx, dz = k.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < KART_R * KART_R) {
          if (d2 > 1e-6) {
            const dist = Math.sqrt(d2);
            k.x = cx + (dx / dist) * KART_R; k.z = cz + (dz / dist) * KART_R;
          } else {
            const penX = hw + KART_R - Math.abs(k.x - o.x);
            const penZ = hd + KART_R - Math.abs(k.z - o.z);
            if (penX < penZ) k.x = o.x + Math.sign(k.x - o.x || 1) * (hw + KART_R);
            else k.z = o.z + Math.sign(k.z - o.z || 1) * (hd + KART_R);
          }
          k.vel *= 0.4;
        }
      }
    }
  }

  // vertical resolution (launch added in Task 3)
  const floor = surfaceHeight(map, k.x, k.z);
  if (k.grounded) {
    if (k.y - floor > SNAP) {
      // ground fell away beneath us (drove off an edge) — start falling
      k.grounded = false;
      k.vy = 0;
    } else {
      k.y = floor;
      k.vy = 0;
    }
  } else {
    k.vy -= GRAVITY * d;
    k.y += k.vy * d;
    if (k.y <= floor) { k.y = floor; k.vy = 0; k.grounded = true; }
  }
  return k;
}
```

- [ ] **Step 4: Copy byte-identical to the client**

Run: `cp server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js`

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: PASS — `elevation.test.js` green; `physicsParity`, `collision`, `kartPhysics`, `prediction` still green (flat-map behavior unchanged because `y` stays 0).

- [ ] **Step 6: Commit**

```bash
git add server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js server/test/elevation.test.js
git commit -m "feat(karts): vertical integrator — gravity, landing, air control, height-gated mesas"
```

---

## Task 3: Ramp launch

**Files:**
- Modify: `server/src/games/kartPhysics.js`, `client/src/games/karts/kartPhysics.js` (byte-identical)
- Test: `server/test/launch.test.js`

**Interfaces:**
- Consumes: `integrateKart` grounded branch (Task 2), `surfaceHeight` (Task 1).
- Produces: grounded karts climbing a wedge fast enough leave the ground at the lip with `vy = vyImplied`; slow climbs and flat ground never launch.

- [ ] **Step 1: Write the failing test** — `server/test/launch.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT } from '../src/games/kartPhysics.js';

// a wedge rising along +z from y=0 to y=6 over z in [-6,6], then flat ground after z>6
const ramp = {
  arena: { w: 80, d: 80 }, obstacles: [],
  ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
};

test('fast climb up a ramp launches into the air with upward vy', () => {
  // start at the bottom of the ramp moving +z at high speed
  const k = { x: 0, z: -6, heading: 0, vel: 26, y: 0, vy: 0, grounded: true };
  let launched = false;
  for (let i = 0; i < 60 && !launched; i++) {
    integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, ramp);
    if (!k.grounded) launched = true;
  }
  assert.equal(launched, true, 'should leave the ground at the lip');
  assert.ok(k.vy > 0, `vy=${k.vy} should be upward at launch`);
});

test('slow crawl up a ramp stays glued (no launch)', () => {
  const k = { x: 0, z: -6, heading: 0, vel: 1.5, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 200; i++) {
    integrateKart(k, { throttle: 0.15, steer: 0 }, SIM_DT, ramp);
    if (k.z >= 6) break;
  }
  assert.equal(k.grounded, true, 'slow climb should never launch');
});

test('flat ground at speed never launches', () => {
  const flat = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };
  const k = { x: 0, z: 0, heading: 0, vel: 28, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, flat);
  assert.equal(k.grounded, true);
  assert.equal(k.y, 0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/launch.test.js`
Expected: FAIL — first test fails (kart stays glued; never launches).

- [ ] **Step 3: Add `LAUNCH_MIN` and the launch check**

Add `LAUNCH_MIN: 3` to `PHYS`:

```js
  GRAVITY: 30, SNAP: 2, LAUNCH_MIN: 3,
```

Destructure it at the top of `integrateKart`:

```js
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D, GRAVITY, SNAP, LAUNCH_MIN } = PHYS;
```

Replace the grounded `else` (glue) branch in the vertical section with:

```js
    } else {
      // on/near the surface — launch off a rising lip if upward momentum outpaces the ground ahead
      const floorPrev = surfaceHeight(map, px, pz);
      const vyImplied = (floor - floorPrev) / d;
      const ax = k.x + Math.sin(k.heading) * k.vel * d;
      const az = k.z + Math.cos(k.heading) * k.vel * d;
      const slopeAheadVy = (surfaceHeight(map, ax, az) - floor) / d;
      if (vyImplied > LAUNCH_MIN && slopeAheadVy < vyImplied - LAUNCH_MIN) {
        k.grounded = false;
        k.vy = vyImplied;
        k.y = floor;
      } else {
        k.y = floor;
        k.vy = 0;
      }
    }
```

- [ ] **Step 4: Copy byte-identical to the client**

Run: `cp server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js`

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: PASS — `launch.test.js` + `elevation.test.js` green; parity + Phase-1 suites still green.

- [ ] **Step 6: Commit**

```bash
git add server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js server/test/launch.test.js
git commit -m "feat(karts): ramp launch — leave the ground at a rising lip"
```

---

## Task 4: Netcode — snapshot fields, sim seeding, client reconciliation

**Files:**
- Modify: `server/src/games/karts.js` (seed/respawn `y/vy/grounded`; snapshot `y/vy/g`)
- Modify: `client/src/games/Karts.jsx` (reconcile `y/vy/grounded`; interpolate remote `y`)
- Test: extend `server/test/prediction.test.js`

**Interfaces:**
- Consumes: `surfaceHeight`, `integrateKart` (Tasks 1–3).
- Produces: kart snapshot entries include `y` (rounded), `vy` (rounded), `g` (grounded bool). `createSim` and respawn seed `y = surfaceHeight(map, spawn)`, `vy = 0`, `grounded = true`. Client `pred` carries `y/vy/grounded`; reconcile replays identically.

- [ ] **Step 1: Write the failing test** — append to `server/test/prediction.test.js`

```js
import { surfaceHeight } from '../src/games/kartPhysics.js';

test('reconcile + replay reproduces elevation state exactly', () => {
  const map = {
    arena: { w: 80, d: 80 }, obstacles: [],
    ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
  };
  const inputs = [];
  for (let i = 0; i < 40; i++) inputs.push({ seq: i + 1, throttle: 1, steer: 0 });
  // authoritative
  const server = { x: 0, z: -6, heading: 0, vel: 20, y: 0, vy: 0, grounded: true };
  for (const inp of inputs) integrateKart(server, inp, SIM_DT, map);
  // client replays the same inputs from the same start
  const client = { x: 0, z: -6, heading: 0, vel: 20, y: 0, vy: 0, grounded: true };
  for (const inp of inputs) integrateKart(client, inp, SIM_DT, map);
  assert.equal(client.y, server.y);
  assert.equal(client.vy, server.vy);
  assert.equal(client.grounded, server.grounded);
});

test('createSim seeds karts grounded at the spawn surface height', () => {
  const players = [{ id: 'a' }, { id: 'b' }];
  const sim = karts.createSim(players, 1000, { map: 'arena' });
  for (const k of sim.karts) {
    assert.equal(k.vy, 0);
    assert.equal(k.grounded, true);
    assert.equal(typeof k.y, 'number');
  }
});
```

(If `prediction.test.js` does not already import the `karts` default export, add `import karts from '../src/games/karts.js';` at the top.)

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/prediction.test.js`
Expected: FAIL — `createSim` karts have no `y/vy/grounded`.

- [ ] **Step 3: Seed vertical state in `server/src/games/karts.js`**

Add the import:

```js
import { integrateKart, SIM_DT, surfaceHeight } from './kartPhysics.js';
```

In `createSim`, the kart factory — add `y/vy/grounded`:

```js
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      y: surfaceHeight(map, s.x, s.z), vy: 0, grounded: true,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
    };
```

In `step`, the respawn branch — seed vertical state too:

```js
      if (now >= k.respawnAt) {
        const s = map.spawns[i % map.spawns.length];
        k.x = s.x; k.z = s.z; k.heading = s.heading; k.vel = 0;
        k.y = surfaceHeight(map, s.x, s.z); k.vy = 0; k.grounded = true;
        k.hp = HP_MAX; k.alive = true; k.shieldUntil = now + 1200;
      }
```

In `snapshot`, the kart map — add `y/vy/g`:

```js
    karts: sim.karts.map((k, i) => ({
      i, x: r1(k.x), z: r1(k.z), h: r1(k.heading), v: r1(k.vel), seq: k.lastSeq || 0,
      y: r1(k.y || 0), vy: r1(k.vy || 0), g: !!k.grounded,
      hp: Math.round(k.hp), alive: k.alive, kills: k.kills,
      weapon: k.weapon, ammo: k.ammo, shield: now < k.shieldUntil, gone: k.gone,
    })),
```

- [ ] **Step 4: Run server tests**

Run: `cd server && npm test`
Expected: PASS — extended `prediction.test.js` green; all others green.

- [ ] **Step 5: Reconcile vertical state in `client/src/games/Karts.jsx`**

Extend the `pred` object and `renderLocal`:

```js
    const pred = { x: 0, z: 0, heading: 0, vel: 0, y: 0, vy: 0, grounded: true, has: false };
    const pending = [];
    const renderLocal = { x: 0, z: 0, h: 0, y: 0 };
```

In `onSnap`, seed vertical state from the authoritative kart before replay:

```js
      if (mine && mine.alive && !mine.gone) {
        pred.x = mine.x; pred.z = mine.z; pred.heading = mine.h; pred.vel = mine.v || 0;
        pred.y = mine.y || 0; pred.vy = mine.vy || 0; pred.grounded = mine.g !== false;
        const ack = mine.seq || 0;
        while (pending.length && pending[0].seq <= ack) pending.shift();
        for (const p of pending) integrateKart(pred, p, SIM_DT, map);
        pred.has = true;
      } else if (mine) {
```

In `sampleAt`, interpolate remote `y`:

```js
      return a.karts.map((ka) => {
        const kb = b.karts.find((x) => x.i === ka.i) || ka;
        return { i: ka.i, x: lerp(ka.x, kb.x, f), y: lerp(ka.y || 0, kb.y || 0, f), z: lerp(ka.z, kb.z, f), h: lerpAngle(ka.h, kb.h, f) };
      });
```

(Rendering the karts/camera/projectiles at `y` is Task 7 — this task only plumbs the data.)

- [ ] **Step 6: Build the client**

Run: `cd client && npm run build`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add server/src/games/karts.js client/src/games/Karts.jsx server/test/prediction.test.js
git commit -m "feat(karts): plumb y/vy/grounded through snapshot + client reconciliation"
```

---

## Task 5: 3D projectiles (server)

**Files:**
- Modify: `server/src/games/karts.js` (projectile `y/vy`, gravity, 3D hit, ground death, mine on surface, snapshot `proj.y`)
- Test: `server/test/projectiles3d.test.js`

**Interfaces:**
- Consumes: `surfaceHeight` (Task 1).
- Produces: projectiles have `y, vy`; fired from `shooter.y + BARREL`; fall under `GRAVITY_PROJ` (rockets get `ROCKET_VY` initial lift); hit test is 3D vs `kart.y + KART_CENTER` within `HIT_R`; die at `y <= surfaceHeight`; mines rest on the surface. Snapshot `proj` carries `y`.

- [ ] **Step 1: Write the failing test** — `server/test/projectiles3d.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';

const flat = { map: 'arena' };

function playSim() {
  const sim = karts.createSim([{ id: 'a' }, { id: 'b' }], 0, flat);
  // fast-forward past countdown
  return sim;
}

test('mg projectile arcs downward over its flight (y decreases)', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  const shooter = sim.karts[0];
  shooter.x = 0; shooter.z = 0; shooter.y = 0; shooter.heading = 0;
  shooter.weapon = 'mg'; shooter.ammo = 10; shooter.nextShotAt = 0;
  karts.step(sim, { 0: { last: { fire: true }, queue: [] } }, 1 / 30, now);
  const p = sim.projectiles[0];
  assert.ok(p, 'a projectile was fired');
  const y0 = p.y;
  for (let i = 0; i < 5; i++) karts.step(sim, {}, 1 / 30, now + i * 33);
  assert.ok(p.y < y0, `y ${p.y} should drop below ${y0}`);
});

test('projectile dies when it reaches the ground', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  sim.projectiles.push({ id: 999, type: 'mg', owner: 0, h: 0, x: 0, z: 0, y: 0.1, vx: 0, vz: 0, vy: -10, life: 5 });
  karts.step(sim, {}, 1 / 30, now); // y += vy*d = 0.1 - 0.333 < 0 -> hits ground, removed
  assert.equal(sim.projectiles.find((p) => p.id === 999), undefined);
});

test('vertical gate: no hit when target is far below the projectile', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  const victim = sim.karts[1];
  victim.x = 0; victim.z = 0; victim.y = 0; victim.alive = true;
  const hp0 = victim.hp;
  // projectile passing directly overhead at high altitude
  sim.projectiles.push({ id: 998, type: 'mg', owner: 0, h: 0, x: 0, z: 0, y: 10, vx: 0, vz: 0, vy: 0, life: 5 });
  karts.step(sim, {}, 1 / 30, now);
  assert.equal(victim.hp, hp0, 'overhead shot should miss a ground target');
});

test('snapshot includes projectile y', () => {
  const sim = playSim();
  sim.projectiles.push({ id: 997, type: 'rocket', owner: 0, h: 0, x: 1, z: 2, y: 3, vx: 0, vz: 0, vy: 0, life: 5 });
  const snap = karts.snapshot(sim, sim.startAt + 100);
  const sp = snap.proj.find((p) => p.id === 997);
  assert.equal(sp.y, 3);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/projectiles3d.test.js`
Expected: FAIL — projectiles have no `y`; hit test/snapshot ignore height.

- [ ] **Step 3: Add projectile constants**

Near the other weapon constants in `karts.js`:

```js
const BARREL = 1.0, KART_CENTER = 1.0, GRAVITY_PROJ = 9, ROCKET_VY = 4;
```

- [ ] **Step 4: 3D `fireProjectile`**

```js
function fireProjectile(sim, k, owner, type, now, map) {
  const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
  if (type === 'mine') {
    const mx = k.x - fx * 3, mz = k.z - fz * 3;
    sim.projectiles.push({
      id: sim.nextPid++, type: 'mine', owner, x: mx, z: mz, y: surfaceHeight(map, mx, mz),
      vx: 0, vz: 0, vy: 0, armAt: now + MINE.arm, dieAt: now + MINE.life,
    });
    return;
  }
  const spec = type === 'mg' ? MG : ROCKET;
  sim.projectiles.push({
    id: sim.nextPid++, type, owner, h: k.heading,
    x: k.x + fx * 3, z: k.z + fz * 3, y: (k.y || 0) + BARREL,
    vx: fx * spec.speed, vz: fz * spec.speed, vy: type === 'rocket' ? ROCKET_VY : 0, life: spec.life,
  });
}
```

Update both call sites in `step` to pass `map`: `fireProjectile(sim, k, i, 'mg', now, map);` and `fireProjectile(sim, k, i, k.weapon, now, map);`.

- [ ] **Step 5: 3D projectile stepping + hit tests**

In the projectile loop, replace the mine trigger distance and the moving-projectile branch:

Mine trigger (3D):
```js
          const dx = k.x - pr.x, dz = k.z - pr.z, dy = (k.y || 0) + KART_CENTER - pr.y;
          if (dx * dx + dz * dz + dy * dy < MINE.trigger * MINE.trigger) {
            damage(sim, i, MINE.dmg, pr.owner, now);
            dead = true; break;
          }
```

Moving projectiles (gravity + ground death + 3D hit):
```js
    } else {
      pr.x += pr.vx * d; pr.z += pr.vz * d; pr.y += pr.vy * d; pr.vy -= GRAVITY_PROJ * d; pr.life -= d;
      const spec = pr.type === 'mg' ? MG : ROCKET;
      if (pr.life <= 0) dead = true;
      else if (Math.abs(pr.x) > map.arena.w / 2 || Math.abs(pr.z) > map.arena.d / 2) dead = true;
      else if (pr.y <= surfaceHeight(map, pr.x, pr.z)) dead = true; // hit the ground/mesa
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
    }
```

- [ ] **Step 6: Snapshot `proj.y`**

```js
    proj: sim.projectiles.map((p) => ({ id: p.id, type: p.type, x: r1(p.x), y: r1(p.y || 0), z: r1(p.z), h: r1(p.h || 0) })),
```

- [ ] **Step 7: Run tests**

Run: `cd server && npm test`
Expected: PASS — `projectiles3d.test.js` green; existing combat tests still green.

- [ ] **Step 8: Commit**

```bash
git add server/src/games/karts.js server/test/projectiles3d.test.js
git commit -m "feat(karts): 3D projectiles — height, gravity, 3D hit test, ground death"
```

---

## Task 6: Maps — retrofit three + new showcase map

**Files:**
- Modify: `server/src/games/kartMaps.js`, `client/src/games/karts/kartMaps.js` (byte-identical)
- Test: extend `server/test/maps.test.js`

**Interfaces:**
- Consumes: `surfaceHeight` (Task 1) for spawn-height validation.
- Produces: `arena`/`pillars`/`gauntlet` gain ramps/mesas; new `launchpad` map registered; `listMaps()` includes it. Every spawn and crate pad sits on open ground (not inside an obstacle footprint, not on a ramp).

Notes for authoring (keep determinism + reachability in mind):
- A box mesa is only reachable via an adjacent **wedge** whose `hiY` equals the box `top` and whose high edge abuts the box footprint, or by landing from the air.
- Keep ramp per-step rise gentle enough to stay glued: `(hiY-loY)/footprint-length` ≤ ~0.6.
- Mesa `top` ≥ 3 so its edge triggers a fall (`> SNAP`).

- [ ] **Step 1: Write the failing test** — extend `server/test/maps.test.js`

```js
import { surfaceHeight } from '../src/games/kartPhysics.js';

test('launchpad map exists and is listed', () => {
  assert.ok(MAPS.launchpad, 'launchpad registered');
  assert.ok(listMaps().some((m) => m.id === 'launchpad'));
});

test('every spawn and pad sits on open, drivable ground (not inside a box footprint)', () => {
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    const insideBox = (x, z) => (m.obstacles || []).some((o) => {
      if (o.kind !== 'box') return false;
      const hw = o.w / 2, hd = o.d / 2;
      return x >= o.x - hw && x <= o.x + hw && z >= o.z - hd && z <= o.z + hd;
    });
    const insideCyl = (x, z) => (m.obstacles || []).some((o) =>
      o.kind === 'cyl' && Math.hypot(x - o.x, z - o.z) < o.r + 2.2);
    for (const s of m.spawns) {
      assert.ok(!insideBox(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a box`);
      assert.ok(!insideCyl(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a cyl`);
    }
    for (const [x, z] of m.pads) {
      assert.ok(!insideBox(x, z), `${id} pad (${x},${z}) inside a box`);
      assert.ok(!insideCyl(x, z), `${id} pad (${x},${z}) inside a cyl`);
    }
  }
});

test('elevated maps actually have ramps', () => {
  for (const id of ['gauntlet', 'launchpad']) {
    assert.ok((MAPS[id].ramps || []).length > 0, `${id} should have ramps`);
  }
});
```

(If `maps.test.js` does not already import `MAPS`/`listMaps`, ensure those imports exist.)

- [ ] **Step 2: Run it, verify it fails**

Run: `cd server && node --test test/maps.test.js`
Expected: FAIL — no `launchpad`, no `ramps`.

- [ ] **Step 3: Author the maps in `server/src/games/kartMaps.js`**

Update the header comment to document the new fields, then edit `MAPS`. Add `ramps` arrays + `top` on climbable boxes, and a new `launchpad` map. Example edits (tune positions for feel):

```js
// Obstacles: {kind:'box',x,z,w,d,top?} (box.top = mesa height, default 3) |
//            {kind:'cyl',x,z,r} (solid pillar).
// ramps: {kind:'wedge',x,z,w,d,axis:'x'|'z',loY,hiY} (linear slope).
// hazards: {x,z,r,dmg}. boosts: {x,z,r,strength}. spawns: {x,z,heading}. pads: [x,z].
```

- **arena** — add a central mesa with two access ramps:
```js
    obstacles: [{ kind: 'box', x: 0, z: 0, w: 16, d: 16, top: 4 }],
    ramps: [
      { kind: 'wedge', x: 0, z: -12, w: 10, d: 8, axis: 'z', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 0, z: 12, w: 10, d: 8, axis: 'z', loY: 4, hiY: 0 },
    ],
```
(move the center pad `[0,0]` off the mesa, e.g. to `[0,18]`).

- **pillars** — add an approach ramp toward one boost lane:
```js
    ramps: [{ kind: 'wedge', x: -30, z: -12, w: 12, d: 10, axis: 'z', loY: 0, hiY: 3 }],
```
(plus a small `box` mesa `top:3` at the ramp's high edge if a landing platform is wanted).

- **gauntlet** — convert its two raised walls into climbable mesas + ramps:
```js
    obstacles: [
      { kind: 'box', x: -12, z: -10, w: 36, d: 5, top: 4 },
      { kind: 'box', x: 12, z: 10, w: 36, d: 5, top: 4 },
    ],
    ramps: [
      { kind: 'wedge', x: -32, z: -10, w: 8, d: 5, axis: 'x', loY: 0, hiY: 4 },
      { kind: 'wedge', x: 32, z: 10, w: 8, d: 5, axis: 'x', loY: 4, hiY: 0 },
    ],
```

- **launchpad** (new) — a central up-ramp launching over a hazard gap onto a landing mesa:
```js
  launchpad: {
    id: 'launchpad', name: 'Launchpad', arena: { w: 90, d: 90 },
    obstacles: [{ kind: 'box', x: 0, z: 26, w: 24, d: 18, top: 5 }],
    ramps: [{ kind: 'wedge', x: 0, z: -6, w: 12, d: 16, axis: 'z', loY: 0, hiY: 6 }],
    hazards: [{ x: 0, z: 8, r: 8, dmg: 40 }],
    boosts: [{ x: 0, z: -28, r: 6, strength: 45 }],
    spawns: [
      { x: -34, z: -34, heading: 0.78 },
      { x: 34, z: -34, heading: -0.78 },
      { x: -34, z: 34, heading: 2.36 },
      { x: 34, z: 34, heading: -2.36 },
    ],
    pads: [[-34, 0], [34, 0], [0, -34], [0, 40]],
  },
```

- [ ] **Step 4: Copy byte-identical to the client**

Run: `cp server/src/games/kartMaps.js client/src/games/karts/kartMaps.js`

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: PASS — `maps.test.js` green, `mapsParity.test.js` green. If a retrofit moved a spawn/pad, fix coordinates until the placement test passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/games/kartMaps.js client/src/games/karts/kartMaps.js server/test/maps.test.js
git commit -m "feat(karts): retrofit arena/pillars/gauntlet with elevation + add Launchpad map"
```

---

## Task 7: Rendering — ramps, mesas, kart height + tilt, camera, projectiles

**Files:**
- Modify: `client/src/games/karts/scene.js` (render wedges + box mesas at `top`)
- Modify: `client/src/games/Karts.jsx` (render kart at `y` + surface tilt; height-aware camera; projectiles at `y`)

**Interfaces:**
- Consumes: `surfaceHeight` (Task 1), snapshot `y`/`g` + interpolated remote `y` (Task 4), `proj.y` (Task 5).
- Produces: visible 3D ramps/mesas; karts sit on the surface and tilt to it; camera follows height; projectiles draw at their `y`. (No unit tests — verified by build + manual playtest.)

- [ ] **Step 1: Render box mesas at their top + wedges in `scene.js`**

In `buildArena`, change the box obstacle rendering to honor `top` (height = `top`, centered at `top/2`, cap at `top`):

```js
    } else {
      const top = o.top == null ? 3 : o.top;
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, top, o.d), obMat);
      m.position.set(o.x, top / 2, o.z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.2, o.d), obTrim);
      cap.position.set(o.x, top + 0.1, o.z); scene.add(cap);
    }
```

After the obstacle loop, render wedges as sloped boxes (rotate a thin box about the slope axis):

```js
  // ramps (wedges) — a slab tilted from loY to hiY across its footprint
  const rampMat = new THREE.MeshStandardMaterial({ color: '#27365e', emissive: '#101a33', roughness: 0.7 });
  for (const r of map.ramps || []) {
    const len = r.axis === 'x' ? r.w : r.d;
    const rise = r.hiY - r.loY;
    const slabLen = Math.hypot(len, rise);
    const angle = Math.atan2(rise, len);
    const geo = new THREE.BoxGeometry(r.axis === 'x' ? slabLen : r.w, 0.4, r.axis === 'z' ? slabLen : r.d);
    const m = new THREE.Mesh(geo, rampMat);
    m.position.set(r.x, (r.loY + r.hiY) / 2, r.z);
    if (r.axis === 'z') m.rotation.x = -angle; else m.rotation.z = angle;
    m.receiveShadow = true; scene.add(m);
  }
```

- [ ] **Step 2: Render karts at `y` with surface tilt in `Karts.jsx`**

Import `surfaceHeight`:

```js
import { integrateKart, SIM_DT, surfaceHeight } from './karts/kartPhysics.js';
```

Track local render height (already added `y` to `renderLocal` in Task 4) — ease it in the prediction block:

```js
        if (pred.has) {
          if (!renderInit) { renderLocal.x = pred.x; renderLocal.z = pred.z; renderLocal.h = pred.heading; renderLocal.y = pred.y; renderInit = true; }
          else {
            renderLocal.x += (pred.x - renderLocal.x) * PRED_SMOOTH;
            renderLocal.z += (pred.z - renderLocal.z) * PRED_SMOOTH;
            renderLocal.y += (pred.y - renderLocal.y) * PRED_SMOOTH;
            renderLocal.h = lerpAngle(renderLocal.h, pred.heading, PRED_SMOOTH);
          }
        }
```

In the per-kart render, use `y` and add cosmetic pitch/roll sampled from the surface:

```js
          const ry = useLocal ? renderLocal.y : (ks.y || 0);
          g.position.set(rx, ry, rz);
          g.rotation.set(0, rh, 0);
          // cosmetic tilt to the surface gradient (sample a kart-length fore/aft + left/right)
          const fwd = 1.6;
          const hF = surfaceHeight(map, rx + Math.sin(rh) * fwd, rz + Math.cos(rh) * fwd);
          const hB = surfaceHeight(map, rx - Math.sin(rh) * fwd, rz - Math.cos(rh) * fwd);
          const hL = surfaceHeight(map, rx + Math.cos(rh) * fwd, rz - Math.sin(rh) * fwd);
          const hR = surfaceHeight(map, rx - Math.cos(rh) * fwd, rz + Math.sin(rh) * fwd);
          g.rotation.x = Math.atan2(hB - hF, fwd * 2);
          g.rotation.z = Math.atan2(hR - hL, fwd * 2);
```

(Replace the existing `g.position.set(rx, 0, rz); g.rotation.y = rh;` lines.)

- [ ] **Step 3: Height-aware camera**

Use the kart's render height for the follow target. After computing `camPose`, derive its `y`:

```js
        const camY = pred.has ? renderLocal.y : (me?.y || 0);
        if (camPose) {
          const fxDir = Math.sin(camPose.h), fz = Math.cos(camPose.h);
          camTarget.set(camPose.x - fxDir * 16, 11 + camY, camPose.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(camPose.x, 1.5 + camY, camPose.z);
        }
```

- [ ] **Step 4: Projectiles at their `y`**

In the projectile render block, use the snapshot `y` instead of the fixed heights:

```js
          mesh.position.set(p.x, p.y != null ? p.y : (p.type === 'mine' ? 0.4 : 1.2), p.z);
```

- [ ] **Step 5: Build the client**

Run: `cd client && npm run build`
Expected: clean build.

- [ ] **Step 6: Manual verification (browser)**

Run `npm run dev` (the `--watch` server only — never also `npm start`). In a 2-player lobby pick **Launchpad**, then verify: drive up the center ramp and launch over the hazard onto the landing mesa; land cleanly; drive off a mesa edge and fall; camera follows height; rockets/MG arc and explode on the ground; a kart on a mesa is not hit by ground-level fire directly below.

- [ ] **Step 7: Commit**

```bash
git add client/src/games/karts/scene.js client/src/games/Karts.jsx
git commit -m "feat(karts): render ramps/mesas, kart height + surface tilt, height-aware camera, 3D projectiles"
```

---

## Final verification

- `cd server && npm test` — full suite green (parity + new elevation/launch/surfaceHeight/projectiles/maps/prediction).
- `cd client && npm run build` — clean.
- Manual browser playtest of Launchpad + the retrofit maps (per Task 7 Step 6).
- Update `memory/playverse-project-overview.md` to note Phase 2 (elevation) shipped.
