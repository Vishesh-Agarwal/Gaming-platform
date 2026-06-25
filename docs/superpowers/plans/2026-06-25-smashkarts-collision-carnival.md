# Smash Karts: Kart Collision + Desert Carnival Map + Smart Respawn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kart-kart bumper collision, a large Desert Carnival map, and a smart (away-from-others) respawn to Smash Karts.

**Architecture:** Kart collision + smart respawn are server-side in `karts.js` (the shared `kartPhysics.js` integrator is NOT touched). The map is data in both byte-identical `kartMaps.js` copies plus a sand ground theme (`materialParams.js` + `materials.js`) and a client-only carnival decoration module (`carnival.js`) invoked from `scene.js`.

**Tech Stack:** Node (ESM, `node --test`), React + Vite, Three.js (client only).

## Global Constraints

- No ripped assets — original procedural geometry only.
- `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` stay byte-identical (`mapsParity.test.js`). Edit one, copy to the other.
- Do NOT modify `kartPhysics.js` (either copy).
- The server test runner has no `three`; no server-imported file may import `three`. (`carnival.js` imports three but is only imported by client code — never by a server test.)
- No hazards.
- Collision is resolved server-side; the client reflects it via existing snapshot reconciliation (no client integrator change).
- Test commands: server `npm test --prefix server`; client `npm run build --prefix client`.

---

### Task 1: Kart-kart collision (bumper-car)

**Files:**
- Modify: `server/src/games/karts.js` (import line 5; weapon-const area ~line 14-20; end of the kart loop ~line 297)
- Test: `server/test/kartCollision.test.js` (create)

**Interfaces:**
- Consumes: `PHYS.KART_R` from `kartPhysics.js`; existing `game.createSim`, `game.step`.
- Produces: after each `step`, no two alive karts at similar height overlap within `2·KART_R`; a kart driving into another recoils.

- [ ] **Step 1: Write the failing test**

Create `server/test/kartCollision.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000;
const KR2 = 2.2 * 2; // PHYS.KART_R * 2

function sim2(aPos, bPos) {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  Object.assign(sim.karts[0], { x: aPos[0], z: aPos[1], y: aPos[2] || 0, grounded: true, vy: 0 });
  Object.assign(sim.karts[1], { x: bPos[0], z: bPos[1], y: bPos[2] || 0, grounded: true, vy: 0 });
  return sim;
}

test('overlapping karts are pushed apart to at least 2*KART_R', () => {
  const sim = sim2([10, 0], [11, 0]); // 1 apart, overlapping
  game.step(sim, [{}, {}], 1 / 30, NOW);
  const d = Math.hypot(sim.karts[1].x - sim.karts[0].x, sim.karts[1].z - sim.karts[0].z);
  assert.ok(d >= KR2 - 1e-6, `expected separation >= ${KR2}, got ${d}`);
});

test('a kart driving into another recoils (velocity reversed/damped)', () => {
  const sim = sim2([10, 0], [13, 0]); // 3 apart, overlapping
  sim.karts[0].heading = Math.PI / 2; sim.karts[0].vel = 10; // moving +x toward b
  sim.karts[1].heading = -Math.PI / 2; sim.karts[1].vel = 10; // moving -x toward a
  game.step(sim, [{}, {}], 1 / 30, NOW);
  assert.ok(sim.karts[0].vel < 0, `kart 0 should recoil, vel=${sim.karts[0].vel}`);
  assert.ok(sim.karts[1].vel < 0, `kart 1 should recoil, vel=${sim.karts[1].vel}`);
});

test('karts at very different heights do not collide', () => {
  const sim = sim2([10, 0, 0], [11, 0, 5]); // overlap in x/z, 5 apart in y
  game.step(sim, [{}, {}], 1 / 30, NOW);
  const d = Math.hypot(sim.karts[1].x - sim.karts[0].x, sim.karts[1].z - sim.karts[0].z);
  assert.ok(d < KR2, `expected NO separation across heights, got ${d}`);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test --prefix server 2>&1 | grep -E "pushed apart|recoils|different heights"`
Expected: FAIL — overlapping karts stay overlapping (no kart-kart collision yet).

- [ ] **Step 3: Import PHYS**

In `server/src/games/karts.js` line 5, change:

```js
import { integrateKart, SIM_DT, surfaceHeight } from './kartPhysics.js';
```

to:

```js
import { integrateKart, SIM_DT, surfaceHeight, PHYS } from './kartPhysics.js';
```

- [ ] **Step 4: Add collision tunables**

In `server/src/games/karts.js`, just after the `MG_RANGE`/`CRATE_R` const block (near line 20), add:

```js
const KART_BOUNCE = 0.45, KART_COLLIDE_DY = 2; // kart-kart recoil + max height delta to collide
```

- [ ] **Step 5: Add the collision pass at the end of the kart loop**

In `server/src/games/karts.js`, after the kart `for` loop closes (the line `  }` right before `// projectiles`, ~line 297), insert:

```js

  // kart-kart collision: bumper-car separation + recoil. Server-authoritative;
  // the shared integrator stays per-kart, so this resolution lives here.
  const KR2 = PHYS.KART_R * 2;
  for (let i = 0; i < sim.karts.length; i++) {
    const a = sim.karts[i];
    if (!a.alive || a.gone) continue;
    for (let j = i + 1; j < sim.karts.length; j++) {
      const b = sim.karts[j];
      if (!b.alive || b.gone) continue;
      if (Math.abs((a.y || 0) - (b.y || 0)) >= KART_COLLIDE_DY) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      if (dist >= KR2) continue;
      let nx, nz;
      if (dist > 1e-6) { nx = dx / dist; nz = dz / dist; } else { nx = 1; nz = 0; dist = 0; }
      const pen = (KR2 - dist) / 2;
      a.x -= nx * pen; a.z -= nz * pen;
      b.x += nx * pen; b.z += nz * pen;
      // recoil whoever is driving into the other (velocity points along the contact normal)
      if (Math.sin(a.heading) * a.vel * nx + Math.cos(a.heading) * a.vel * nz > 0) a.vel = -KART_BOUNCE * a.vel;
      if (Math.sin(b.heading) * b.vel * -nx + Math.cos(b.heading) * b.vel * -nz > 0) b.vel = -KART_BOUNCE * b.vel;
    }
  }
```

- [ ] **Step 6: Run tests**

Run: `npm test --prefix server`
Expected: PASS (3 new collision tests + the rest).

- [ ] **Step 7: Commit**

```bash
git add server/src/games/karts.js server/test/kartCollision.test.js
git commit -m "feat(karts): kart-kart bumper collision (server-side)"
```

---

### Task 2: Smart respawn (away from others)

**Files:**
- Modify: `server/src/games/karts.js` (add `safeSpawnIndex`; respawn line ~237)
- Test: `server/test/respawn.test.js` (create)

**Interfaces:**
- Produces: named export `safeSpawnIndex(sim, selfIdx, map) -> number` — index into `map.spawns` farthest from the nearest living other kart; returns the kart's own `spawnIdx` when there are no living others.

- [ ] **Step 1: Write the failing test**

Create `server/test/respawn.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game, { safeSpawnIndex } from '../src/games/karts.js';
import { getMap } from '../src/games/kartMaps.js';

// arena spawns: 0:(22,0) 1:(0,22) 2:(-22,0) 3:(0,-22)
test('picks the spawn farthest from the nearest living other kart', () => {
  const sim = game.createSim([{}, {}, {}], 0, { map: 'arena' });
  Object.assign(sim.karts[1], { x: 22, z: 0, alive: true });   // cluster near spawn 0
  Object.assign(sim.karts[2], { x: 20, z: 2, alive: true });
  assert.equal(safeSpawnIndex(sim, 0, getMap('arena')), 2);    // (-22,0) is farthest
});

test('falls back to own spawnIdx when no living others', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  sim.karts[1].gone = true; sim.karts[1].alive = false;
  assert.equal(safeSpawnIndex(sim, 0, getMap('arena')), sim.karts[0].spawnIdx);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test --prefix server 2>&1 | grep -E "farthest from|falls back"`
Expected: FAIL — `safeSpawnIndex` is not exported / not defined.

- [ ] **Step 3: Add `safeSpawnIndex`**

In `server/src/games/karts.js`, add near the other helpers (e.g. just above `function killKart`):

```js
// Spawn index farthest from the nearest living other kart (so a respawn lands
// away from a fight). Falls back to the kart's own spawnIdx if nobody's around.
export function safeSpawnIndex(sim, selfIdx, map) {
  let best = sim.karts[selfIdx].spawnIdx, bestScore = -Infinity, found = false;
  for (let s = 0; s < map.spawns.length; s++) {
    const sp = map.spawns[s];
    let nearest = Infinity;
    for (let j = 0; j < sim.karts.length; j++) {
      if (j === selfIdx) continue;
      const k = sim.karts[j];
      if (!k.alive || k.gone) continue;
      const d2 = (k.x - sp.x) ** 2 + (k.z - sp.z) ** 2;
      if (d2 < nearest) nearest = d2;
    }
    if (nearest === Infinity) continue; // no living others to consider
    found = true;
    if (nearest > bestScore) { bestScore = nearest; best = s; }
  }
  return found ? best : sim.karts[selfIdx].spawnIdx;
}
```

- [ ] **Step 4: Use it on respawn**

In `server/src/games/karts.js`, in the respawn block (line ~237), change:

```js
        const s = map.spawns[k.spawnIdx];
```

to:

```js
        const s = map.spawns[safeSpawnIndex(sim, i, map)];
```

- [ ] **Step 5: Run tests**

Run: `npm test --prefix server`
Expected: PASS (2 new respawn tests + the rest).

- [ ] **Step 6: Commit**

```bash
git add server/src/games/karts.js server/test/respawn.test.js
git commit -m "feat(karts): smart respawn — spawn farthest from other karts"
```

---

### Task 3: Desert Carnival map data + sand ground params

**Files:**
- Modify: `server/src/games/kartMaps.js` (add `carnival` to `MAPS`)
- Modify: `client/src/games/karts/kartMaps.js` (copy — keep byte-identical)
- Modify: `client/src/games/karts/materialParams.js` (add `carnival` to `GROUND_PARAMS`)
- Test: `server/test/carnival.test.js` (create)

**Interfaces:**
- Produces: `MAPS.carnival` with `theme: 'carnival'`, 200×200 arena, 8 side-split spawns, a central drive-up plateau (ramps[0]), round-landmark cylinders with `prop` tags, tent/booth boxes, boost strips, pads, and a `decor` array. `groundParamsFor('carnival')` returns sandy params.

- [ ] **Step 1: Write the failing test**

Create `server/test/carnival.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap, MAPS, listMaps } from '../src/games/kartMaps.js';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';

test('carnival exists, is listed, 200x200, theme carnival, 8 spawns', () => {
  const m = getMap('carnival');
  assert.equal(m.id, 'carnival');
  assert.equal(m.theme, 'carnival');
  assert.equal(m.arena.w, 200);
  assert.equal(m.arena.d, 200);
  assert.equal(m.spawns.length, 8);
  assert.ok(listMaps().some((x) => x.id === 'carnival'));
});

test('carnival spawns are side-split: first 4 north (z<0), last 4 south (z>0)', () => {
  const m = MAPS.carnival;
  for (let i = 0; i < 4; i++) assert.ok(m.spawns[i].z < 0, `spawn ${i} north`);
  for (let i = 4; i < 8; i++) assert.ok(m.spawns[i].z > 0, `spawn ${i} south`);
});

test('carnival central stage is a flat plateau (height 5) reachable up the north ramp', () => {
  const m = getMap('carnival');
  assert.equal(surfaceHeight(m, 0, 0), 5);   // plateau top
  assert.equal(surfaceHeight(m, 0, -85), 0); // spawn area is ground
  // drive from just below the north ramp straight up (+z) onto the plateau
  const k = { x: 0, z: -34, heading: 0, vel: 0, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 220 && k.z < 0; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, m);
  assert.ok(k.y >= 4.5, `expected to climb the stage, got y=${k.y}`);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test --prefix server 2>&1 | grep -E "carnival exists|side-split|central stage"`
Expected: FAIL — `getMap('carnival')` returns the default/undefined.

- [ ] **Step 3: Add the carnival map to the server `kartMaps.js`**

In `server/src/games/kartMaps.js`, inside the `MAPS` object (after the `coliseum` entry, before the closing `};`), add:

```js
  carnival: {
    id: 'carnival', name: 'Desert Carnival', theme: 'carnival', arena: { w: 200, d: 200 },
    obstacles: [
      // round landmarks (tagged for the carnival renderer)
      { kind: 'cyl', x: 0, z: -62, r: 7, prop: 'ferris' },
      { kind: 'cyl', x: -62, z: 0, r: 6, prop: 'carousel' },
      { kind: 'cyl', x: 62, z: 0, r: 5, prop: 'fountain' },
      { kind: 'cyl', x: 0, z: 62, r: 6, prop: 'carousel' },
      // tent clusters (quadrants)
      { kind: 'box', x: -45, z: -45, w: 8, d: 8 },
      { kind: 'box', x: -30, z: -58, w: 7, d: 7 },
      { kind: 'box', x: 45, z: -45, w: 8, d: 8 },
      { kind: 'box', x: 30, z: -58, w: 7, d: 7 },
      { kind: 'box', x: -45, z: 45, w: 8, d: 8 },
      { kind: 'box', x: -30, z: 58, w: 7, d: 7 },
      { kind: 'box', x: 45, z: 45, w: 8, d: 8 },
      { kind: 'box', x: 30, z: 58, w: 7, d: 7 },
      // ticket booths near the side edges
      { kind: 'box', x: -82, z: -22, w: 6, d: 6 },
      { kind: 'box', x: 82, z: -22, w: 6, d: 6 },
      { kind: 'box', x: -82, z: 22, w: 6, d: 6 },
      { kind: 'box', x: 82, z: 22, w: 6, d: 6 },
    ],
    ramps: [
      // central drive-up stage plateau (x:-15..15, z:-15..15), height 5
      { kind: 'wedge', x: 0, z: 0, w: 30, d: 30, axis: 'z', loY: 5, hiY: 5 },
      // north connector ramp: high edge (5) abuts plateau z=-15
      { kind: 'wedge', x: 0, z: -23, w: 14, d: 16, axis: 'z', loY: 0, hiY: 5 },
      // south connector ramp: high edge (5) abuts plateau z=15
      { kind: 'wedge', x: 0, z: 23, w: 14, d: 16, axis: 'z', loY: 5, hiY: 0 },
    ],
    boosts: [
      { x: -22, z: -40, r: 6, strength: 46 },
      { x: 22, z: -40, r: 6, strength: 46 },
      { x: -22, z: 40, r: 6, strength: 46 },
      { x: 22, z: 40, r: 6, strength: 46 },
    ],
    spawns: [
      { x: -70, z: -85, heading: 0 },
      { x: -24, z: -85, heading: 0 },
      { x: 24, z: -85, heading: 0 },
      { x: 70, z: -85, heading: 0 },
      { x: -70, z: 85, heading: 3.1416 },
      { x: -24, z: 85, heading: 3.1416 },
      { x: 24, z: 85, heading: 3.1416 },
      { x: 70, z: 85, heading: 3.1416 },
    ],
    pads: [[0, -40], [0, 40], [-52, -18], [52, -18], [-52, 18], [52, 18], [-52, -72], [52, 72]],
    decor: [
      { kind: 'arch', x: 0, z: -92 },
      { kind: 'arch', x: 0, z: 92 },
      { kind: 'balloons', x: -88, z: -88 },
      { kind: 'balloons', x: 88, z: -88 },
      { kind: 'balloons', x: -88, z: 88 },
      { kind: 'balloons', x: 88, z: 88 },
      { kind: 'bunting', x: -40, z: -78, x2: 40, z2: -78 },
      { kind: 'bunting', x: -40, z: 78, x2: 40, z2: 78 },
    ],
  },
```

- [ ] **Step 4: Copy to the client map and confirm parity**

Run:

```bash
cp server/src/games/kartMaps.js client/src/games/karts/kartMaps.js
diff server/src/games/kartMaps.js client/src/games/karts/kartMaps.js && echo PARITY_OK
```

- [ ] **Step 5: Add the sand ground params**

In `client/src/games/karts/materialParams.js`, add to `GROUND_PARAMS` (after `coliseum`):

```js
  carnival:  { grassRatio: 0.22, asphalt: '#c2a86a', grass: '#d9bf86',
               asphaltGrains: ['#b39655', '#d8c08a'],
               grassGrains: ['#cdb277', '#e3cd99', '#bfa468'] },
```

- [ ] **Step 6: Run tests (server) — including pad/spawn placement + parity**

Run: `npm test --prefix server`
Expected: PASS. If `maps.test.js` flags a carnival spawn/pad as "inside a box/cyl/ramp", move that one coordinate to open ground (the assertion names the exact `(x,z)`) in BOTH map copies (re-copy server→client), and re-run. Confirm `mapsParity` passes.

- [ ] **Step 7: Commit**

```bash
git add server/src/games/kartMaps.js client/src/games/karts/kartMaps.js client/src/games/karts/materialParams.js server/test/carnival.test.js
git commit -m "feat(karts): add Desert Carnival map (200x200) + sand ground params"
```

---

### Task 4: Sand ground rendering (theme grain palettes)

**Files:**
- Modify: `client/src/games/karts/materials.js` (asphalt grains line ~87; grass grains line ~92)
- Verified by: `npm run build --prefix client`

**Interfaces:**
- Consumes: optional `gp.asphaltGrains` / `gp.grassGrains` from `materialParams.js` (added in Task 3).

- [ ] **Step 1: Use theme grains with the current defaults as fallback**

In `client/src/games/karts/materials.js`, change line ~87:

```js
  const asphaltTex = track(grainTexture(gp.asphalt, ['#2c2e33', '#54565c'], 256, 0.22));
```

to:

```js
  const asphaltTex = track(grainTexture(gp.asphalt, gp.asphaltGrains || ['#2c2e33', '#54565c'], 256, 0.22));
```

and change line ~92:

```js
  const grassTex = track(grainTexture(gp.grass, ['#3c5a28', '#5a7e3a', '#33491f'], 256, 0.4));
```

to:

```js
  const grassTex = track(grainTexture(gp.grass, gp.grassGrains || ['#3c5a28', '#5a7e3a', '#33491f'], 256, 0.4));
```

- [ ] **Step 2: Build**

Run: `npm run build --prefix client`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/games/karts/materials.js
git commit -m "feat(karts): per-theme ground grain palettes (sand for carnival)"
```

---

### Task 5: Carnival decorations (structures + props)

**Files:**
- Create: `client/src/games/karts/carnival.js`
- Modify: `client/src/games/karts/scene.js` (import; obstacle loop ~line 57; decor call at end of `buildArena`)
- Verified by: `npm run build --prefix client`

**Interfaces:**
- Produces: `addCarnivalStructure(scene, o)` (themed mesh for an obstacle) and `addCarnivalDecor(scene, decor)` (non-colliding props). Consumed by `scene.js` only when `map.theme === 'carnival'`.

- [ ] **Step 1: Create the carnival module**

Create `client/src/games/karts/carnival.js`:

```js
// Smash Karts — Desert Carnival decorations. Original procedural geometry.
// Client-only (imports three); never imported by a server test.
import * as THREE from 'three';

const RED = '#d23b3b', CREAM = '#f4e4c1', YELLOW = '#f2c14e', BLUE = '#3f8fd0', SAND = '#cdb277';

// A striped cone (carnival roof) from alternating colored angular segments.
function stripedCone(radius, height, segments = 12) {
  const g = new THREE.Group();
  const colors = [RED, CREAM];
  for (let s = 0; s < segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0, radius, height, 1, 1, true, theta, (Math.PI * 2) / segments);
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[s % 2], roughness: 0.7, side: THREE.DoubleSide })));
  }
  return g;
}

export function addCarnivalStructure(scene, o) {
  if (o.kind === 'cyl') {
    if (o.prop === 'ferris') addFerris(scene, o);
    else if (o.prop === 'fountain') addFountain(scene, o);
    else addCarousel(scene, o);
  } else {
    addTent(scene, o);
  }
}

function addTent(scene, o) {
  const h = o.top == null ? 3 : o.top;
  const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.d),
    new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85 }));
  body.position.set(o.x, h / 2, o.z); body.castShadow = body.receiveShadow = true; scene.add(body);
  const roof = stripedCone(Math.max(o.w, o.d) * 0.8, 3, 12);
  roof.position.set(o.x, h + 1.5, o.z); roof.castShadow = true; scene.add(roof);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), new THREE.MeshStandardMaterial({ color: RED }));
  flag.position.set(o.x, h + 3.4, o.z); scene.add(flag);
}

function addCarousel(scene, o) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 2.5, 20),
    new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.6 }));
  base.position.set(o.x, 1.25, o.z); base.castShadow = base.receiveShadow = true; scene.add(base);
  const roof = stripedCone(o.r * 1.15, 3.5, 16);
  roof.position.set(o.x, 4.6, o.z); roof.castShadow = true; scene.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 8),
    new THREE.MeshStandardMaterial({ color: '#caa84a', metalness: 0.6, roughness: 0.3 }));
  pole.position.set(o.x, 3, o.z); scene.add(pole);
}

function addFountain(scene, o) {
  for (const [r, y, h] of [[o.r, 0.5, 1], [o.r * 0.6, 1.4, 0.8], [o.r * 0.3, 2.2, 0.6]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 18),
      new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.9 }));
    tier.position.set(o.x, y, o.z); tier.castShadow = tier.receiveShadow = true; scene.add(tier);
  }
}

function addFerris(scene, o) {
  const wheelR = o.r * 2.2, cx = o.x, cy = wheelR + 2, cz = o.z;
  const steel = new THREE.MeshStandardMaterial({ color: '#e8e2d0', metalness: 0.3, roughness: 0.5 });
  for (const sx of [-o.r, o.r]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, cy + 2, 8),
      new THREE.MeshStandardMaterial({ color: '#b8403a', metalness: 0.4, roughness: 0.5 }));
    leg.position.set(cx + sx, (cy + 2) / 2, cz); leg.castShadow = true; scene.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.4, 8, 32), steel);
  ring.position.set(cx, cy, cz); scene.add(ring);
  const cabinColors = [RED, YELLOW, BLUE, CREAM];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wheelR * 2, 6), steel);
    spoke.position.set(cx, cy, cz); spoke.rotation.z = a; scene.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2),
      new THREE.MeshStandardMaterial({ color: cabinColors[s % 4], roughness: 0.6 }));
    cab.position.set(cx + Math.cos(a) * wheelR, cy + Math.sin(a) * wheelR, cz); cab.castShadow = true; scene.add(cab);
  }
}

export function addCarnivalDecor(scene, decor) {
  for (const d of decor || []) {
    if (d.kind === 'arch') addArch(scene, d);
    else if (d.kind === 'balloons') addBalloons(scene, d);
    else if (d.kind === 'bunting') addBunting(scene, d);
  }
}

function addArch(scene, d) {
  const postMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.6 });
  for (const sx of [-7, 7]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 8, 10), postMat);
    post.position.set(d.x + sx, 4, d.z); post.castShadow = true; scene.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 1.2),
    new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.6 }));
  top.position.set(d.x, 8, d.z); scene.add(top);
}

function addBalloons(scene, d) {
  const colors = [RED, YELLOW, BLUE, '#5cd860'];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.4 }));
    b.position.set(d.x + (i - 2) * 0.8, 5 + Math.sin(i) * 0.6, d.z); b.castShadow = true; scene.add(b);
  }
}

function addBunting(scene, d) {
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = d.x + (d.x2 - d.x) * t, z = d.z + (d.z2 - d.z) * t;
    const sag = Math.sin(t * Math.PI) * 1.2;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4),
      new THREE.MeshStandardMaterial({ color: [RED, CREAM, YELLOW, BLUE][i % 4] }));
    flag.position.set(x, 6 - sag, z); flag.rotation.x = Math.PI; scene.add(flag);
  }
}
```

- [ ] **Step 2: Import the module in scene.js**

In `client/src/games/karts/scene.js`, after the existing imports (top of file), add:

```js
import { addCarnivalStructure, addCarnivalDecor } from './carnival.js';
```

- [ ] **Step 3: Theme the obstacle rendering**

In `client/src/games/karts/scene.js`, in the `// Obstacles.` loop, change:

```js
  for (const o of map.obstacles || []) {
    addApron(o);
    if (o.kind === 'cyl') {
```

to:

```js
  for (const o of map.obstacles || []) {
    addApron(o);
    if (map.theme === 'carnival') { addCarnivalStructure(scene, o); continue; }
    if (o.kind === 'cyl') {
```

- [ ] **Step 4: Render the decor**

In `client/src/games/karts/scene.js`, at the very end of `buildArena` (after the boost-pads loop, before the function closes), add:

```js
  if (map.theme === 'carnival') addCarnivalDecor(scene, map.decor || []);
```

- [ ] **Step 5: Build**

Run: `npm run build --prefix client`
Expected: builds clean. (Carnival meshes are added to `scene`, so the existing `scene.traverse` in `dispose()` frees their geometry + materials — no leak.)

- [ ] **Step 6: Commit**

```bash
git add client/src/games/karts/carnival.js client/src/games/karts/scene.js
git commit -m "feat(karts): Desert Carnival decorations (tents, rides, bunting)"
```

---

## Final verification

- [ ] `npm test --prefix server` — full suite green.
- [ ] `npm run build --prefix client` — clean build.
- [ ] Then use **superpowers:finishing-a-development-branch**.

## Notes for the manual playtest (after merge)

- Karts bump and recoil instead of overlapping; bumping someone on the central stage from below does nothing (height-gated).
- Desert Carnival is selectable in the lobby map list; sand ground, tents/rides/bunting visible; ~4× the space with speed strips and a central stage.
- After being killed, you respawn away from where the other karts are.
