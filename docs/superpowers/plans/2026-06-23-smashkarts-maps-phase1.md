# Smash Karts Maps Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectable flat arenas with solid obstacles, hazard zones, and boost pads — built on a shared deterministic map data model so obstacle collision + boosts are predicted/reconciled like movement.

**Architecture:** A shared `kartMaps` module (byte-identical server/client, parity-tested) holds map data. `integrateKart(k, input, dt, map)` gains obstacle collision + boost (deterministic). Server resolves the map by `options.map` (lobby selection), applies hazard damage server-side, and uses per-map arena/spawns/pads. Client renders obstacles/hazards/boosts from the map and passes the map to its prediction calls.

**Tech Stack:** Node ESM (server), React + Three.js (client), `node:test`.

## Global Constraints

- **Determinism contract:** `integrateKart` stays pure; the two `kartPhysics` copies AND the two `kartMaps` copies must each be byte-identical (parity tests enforce). Collision/boost depend only on `(k, input, dt, map)`.
- **Only obstacle collision + boost go in the integrator** (predicted). **Hazard damage is server-only** (never predicted). Remote karts unchanged.
- **`map` arg is optional/guarded:** `integrateKart(k, input, dt)` with no map behaves exactly as today (keeps existing prediction tests valid).
- **Projectiles do NOT collide with obstacles** in Phase 1 (deferred).
- **No elevation** (Phase 2).
- Server ESM; tests via `node --test test/` from `server/`. Client build: `cd client && npm run build` (chunk-size warning accepted).
- Behavior with the default map (`arena`, an empty 80×80 box) must match today's game.

---

### Task 1: Obstacle collision + boost in the shared integrator

**Files:**
- Modify: `server/src/games/kartPhysics.js`
- Modify: `client/src/games/karts/kartPhysics.js` (identical change)
- Create: `server/test/collision.test.js`

**Interfaces:**
- Produces: `integrateKart(k, input, dt, map = null)` — after movement, applies boost (speed bump over a pad) and obstacle push-out (box + cyl). `map` shape: `{ arena:{w,d}, obstacles:[{kind:'box',x,z,w,d}|{kind:'cyl',x,z,r}], boosts:[{x,z,r,strength}] }` (only these fields are read here).

- [ ] **Step 1: Update `integrateKart` in `server/src/games/kartPhysics.js`**

Replace the whole `integrateKart` function with:

```js
export function integrateKart(k, input, dt, map = null) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D } = PHYS;
  const d = clamp(dt, 0, 0.1);
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  if (throttle > 0) k.vel += ACCEL * throttle * d;
  else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
  k.vel -= k.vel * Math.min(1, DRAG * d);
  k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
  // boost pads can briefly push speed above MAX_SPEED
  if (map && map.boosts) {
    for (const b of map.boosts) {
      const bx = k.x - b.x, bz = k.z - b.z;
      if (bx * bx + bz * bz < b.r * b.r && k.vel < b.strength) k.vel = b.strength;
    }
  }
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading -= steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;
  // arena wall clamp (map arena overrides the default)
  const aw = (map && map.arena) ? map.arena.w : ARENA_W;
  const ad = (map && map.arena) ? map.arena.d : ARENA_D;
  const half = aw / 2 - KART_R, halfD = ad / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  // obstacle push-out (circle of radius KART_R vs box/cyl)
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
  return k;
}
```

- [ ] **Step 2: Apply the identical change to `client/src/games/karts/kartPhysics.js`**

Replace its `integrateKart` with the EXACT same function body as Step 1 (the file's leading comment stays; only `integrateKart` changes). The two copies must be byte-identical below the comment header.

- [ ] **Step 3: Create `server/test/collision.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT, PHYS } from '../src/games/kartPhysics.js';

const boxMap = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10 }], boosts: [] };
const cylMap = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 5 }], boosts: [] };

test('no map => unchanged movement (back-compat)', () => {
  const a = { x: 0, z: 0, heading: 0, vel: 0 };
  const b = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 20; i++) { integrateKart(a, { throttle: 1, steer: 0 }, SIM_DT); integrateKart(b, { throttle: 1, steer: 0 }, SIM_DT, null); }
  assert.deepEqual(a, b);
});

test('kart cannot end up inside a box obstacle', () => {
  const k = { x: -20, z: 0, heading: Math.PI / 2, vel: 0 }; // heading +x toward the box
  for (let i = 0; i < 300; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, boxMap);
  const inside = Math.abs(k.x) < 5 + PHYS.KART_R - 1e-6 && Math.abs(k.z) < 5 + PHYS.KART_R - 1e-6;
  assert.equal(inside, false, 'kart penetrated the box');
});

test('kart cannot end up inside a cyl obstacle', () => {
  const k = { x: 0, z: -20, heading: 0, vel: 0 }; // heading +z toward the cyl
  for (let i = 0; i < 300; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, cylMap);
  assert.ok(Math.hypot(k.x, k.z) >= 5 + PHYS.KART_R - 1e-6, 'kart penetrated the cyl');
});

test('boost pad pushes speed above MAX_SPEED', () => {
  const map = { arena: { w: 80, d: 80 }, obstacles: [], boosts: [{ x: 0, z: 5, r: 8, strength: 40 }] };
  const k = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 10; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, map);
  assert.ok(k.vel >= 40, `expected boosted speed, got ${k.vel}`);
  assert.ok(k.vel > PHYS.MAX_SPEED);
});

test('collision replay is deterministic (reconciliation holds)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inputs = []; for (let i = 0; i < 40; i++) inputs.push({ seq: i + 1, throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 });
  const full = { x: -8, z: -8, heading: 0.5, vel: 6 };
  for (const inp of inputs) integrateKart(full, inp, SIM_DT, boxMap);
  const K = 25; const anchor = { x: -8, z: -8, heading: 0.5, vel: 6 };
  for (let i = 0; i < K; i++) integrateKart(anchor, inputs[i], SIM_DT, boxMap);
  const ack = inputs[K - 1].seq;
  const client = { ...anchor };
  for (const inp of inputs) if (inp.seq > ack) integrateKart(client, inp, SIM_DT, boxMap);
  for (const key of ['x', 'z', 'heading', 'vel']) assert.ok(Math.abs(client[key] - full[key]) < 1e-9, `${key} mismatch`);
});
```

- [ ] **Step 4: Run tests + build**

Run: `cd server && npm test` → all pass (existing suites + collision).
Run: `cd client && npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/src/games/kartPhysics.js client/src/games/karts/kartPhysics.js server/test/collision.test.js
git commit -m "Smash Karts: obstacle collision + boost pads in the shared integrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared map data model (`kartMaps`)

**Files:**
- Create: `server/src/games/kartMaps.js`
- Create: `client/src/games/karts/kartMaps.js` (identical)
- Create: `server/test/mapsParity.test.js`

**Interfaces:**
- Produces: `MAPS`, `DEFAULT_MAP`, `getMap(id)`, `listMaps()`.

- [ ] **Step 1: Create `server/src/games/kartMaps.js`**

```js
// Shared, deterministic Smash Karts map data. Keep this file byte-identical to its
// client copy (client/src/games/karts/kartMaps.js); a test asserts they match.
// Obstacles: {kind:'box',x,z,w,d} (axis-aligned) | {kind:'cyl',x,z,r}.
// hazards: {x,z,r,dmg} (server-side damage; 999 = instakill). boosts: {x,z,r,strength}.
// spawns: {x,z,heading}. pads: [x,z] weapon-crate locations.
export const MAPS = {
  arena: {
    id: 'arena', name: 'Open Arena', arena: { w: 80, d: 80 },
    obstacles: [], hazards: [], boosts: [],
    spawns: [
      { x: 22, z: 0, heading: -1.5708 },
      { x: 0, z: 22, heading: 3.1416 },
      { x: -22, z: 0, heading: 1.5708 },
      { x: 0, z: -22, heading: 0 },
    ],
    pads: [[0, 0], [-24, -24], [24, -24], [-24, 24], [24, 24]],
  },
  pillars: {
    id: 'pillars', name: 'Pillars', arena: { w: 80, d: 80 },
    obstacles: [
      { kind: 'cyl', x: 0, z: 0, r: 4 },
      { kind: 'cyl', x: -18, z: -18, r: 3 },
      { kind: 'cyl', x: 18, z: -18, r: 3 },
      { kind: 'cyl', x: -18, z: 18, r: 3 },
      { kind: 'cyl', x: 18, z: 18, r: 3 },
    ],
    hazards: [],
    boosts: [
      { x: -30, z: 0, r: 5, strength: 42 },
      { x: 30, z: 0, r: 5, strength: 42 },
    ],
    spawns: [
      { x: 22, z: 0, heading: -1.5708 },
      { x: 0, z: 22, heading: 3.1416 },
      { x: -22, z: 0, heading: 1.5708 },
      { x: 0, z: -22, heading: 0 },
    ],
    pads: [[-26, -26], [26, -26], [-26, 26], [26, 26], [0, 30]],
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', arena: { w: 90, d: 70 },
    obstacles: [
      { kind: 'box', x: -12, z: -10, w: 36, d: 5 },
      { kind: 'box', x: 12, z: 10, w: 36, d: 5 },
    ],
    hazards: [{ x: 0, z: -25, r: 7, dmg: 40 }],
    boosts: [{ x: 0, z: 25, r: 6, strength: 45 }],
    spawns: [
      { x: -38, z: -30, heading: 0.9028 },
      { x: 38, z: -30, heading: -0.9028 },
      { x: -38, z: 30, heading: 2.2389 },
      { x: 38, z: 30, heading: -2.2389 },
    ],
    pads: [[0, 0], [-35, 0], [35, 0], [-15, 28], [15, -28]],
  },
};

export const DEFAULT_MAP = 'arena';
export function getMap(id) { return MAPS[id] || MAPS[DEFAULT_MAP]; }
export function listMaps() { return Object.values(MAPS).map((m) => ({ id: m.id, name: m.name })); }
```

- [ ] **Step 2: Create `client/src/games/karts/kartMaps.js`**

Identical contents to Step 1, except change the leading comment's cross-reference to point at the server copy:

```js
// Shared, deterministic Smash Karts map data. Keep this file byte-identical to its
// server copy (server/src/games/kartMaps.js); a test asserts they match.
```

(The `MAPS`/`DEFAULT_MAP`/`getMap`/`listMaps` bodies are identical to the server copy.)

- [ ] **Step 3: Create `server/test/mapsParity.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/games/kartMaps.js';
import * as client from '../../client/src/games/karts/kartMaps.js';

test('client and server kartMaps are identical', () => {
  assert.deepEqual(client.MAPS, server.MAPS);
  assert.equal(client.DEFAULT_MAP, server.DEFAULT_MAP);
  assert.deepEqual(client.listMaps(), server.listMaps());
});

test('every map is well-formed', () => {
  for (const m of Object.values(server.MAPS)) {
    assert.ok(m.id && m.name && m.arena?.w && m.arena?.d, `map ${m.id} missing core fields`);
    assert.ok(Array.isArray(m.spawns) && m.spawns.length >= 1, `map ${m.id} needs spawns`);
    assert.ok(Array.isArray(m.pads) && m.pads.length >= 1, `map ${m.id} needs pads`);
  }
});

test('getMap falls back to default for unknown ids', () => {
  assert.equal(server.getMap('nope').id, server.DEFAULT_MAP);
  assert.equal(server.getMap(undefined).id, server.DEFAULT_MAP);
});
```

- [ ] **Step 4: Run tests**

Run: `cd server && npm test` → all pass (incl. mapsParity).

- [ ] **Step 5: Commit**

```bash
git add server/src/games/kartMaps.js client/src/games/karts/kartMaps.js server/test/mapsParity.test.js
git commit -m "Smash Karts: shared kartMaps data model (3 maps) + parity test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server wiring — map-driven sim + hazards

**Files:**
- Modify: `server/src/games/karts.js`
- Modify: `server/src/rooms.js`
- Create: `server/test/maps.test.js`

**Interfaces:**
- Consumes: `getMap` (kartMaps), `integrateKart` (now map-aware).
- Produces: `createInitialState(options)`/`createSim(players, now, options)` resolve the map; `step` uses it for movement, hazards, projectile bounds, spawns. `rooms.js` passes options to `createSim`.

- [ ] **Step 1: Import `getMap` in `karts.js`**

Add near the existing kartPhysics import:

```js
import { getMap } from './kartMaps.js';
```

- [ ] **Step 2: `createInitialState` resolves the map**

Replace:

```js
function createInitialState() {
  return { arena: { w: ARENA_W, d: ARENA_D }, colors: COLORS, realtime: true, maxPlayers: 4 };
}
```

with:

```js
function createInitialState(options) {
  const map = getMap(options?.map);
  return { arena: map.arena, colors: COLORS, realtime: true, maxPlayers: 4, mapId: map.id };
}
```

- [ ] **Step 3: `createSim` seeds from the map**

Replace the `createSim` signature and the karts/crates construction:

```js
function createSim(players, now = Date.now()) {
  const n = players.length;
  const karts = players.map((p, i) => {
    const s = spawnPoint(i, n);
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
    };
  });
  return {
    karts,
    crates: PADS.map(([x, z]) => ({ x, z, type: null, readyAt: now + COUNTDOWN_MS })),
    projectiles: [],
    nextPid: 1,
    startAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + MATCH_MS,
    over: false,
  };
}
```

with:

```js
function createSim(players, now = Date.now(), options) {
  const map = getMap(options?.map);
  const karts = players.map((p, i) => {
    const s = map.spawns[i % map.spawns.length];
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
    };
  });
  return {
    mapId: map.id,
    karts,
    crates: map.pads.map(([x, z]) => ({ x, z, type: null, readyAt: now + COUNTDOWN_MS })),
    projectiles: [],
    nextPid: 1,
    startAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + MATCH_MS,
    over: false,
  };
}
```

(The `spawnPoint` helper and `PADS` constant are now unused — delete both: the `function spawnPoint(i, n) { ... }` block and the `const PADS = [ ... ];` line.)

- [ ] **Step 4: `step` uses the map for movement, respawn, hazards, projectile bounds**

At the top of `step`, after `const d = clamp(dt, 0, 0.1);`, add:

```js
  const map = getMap(sim.mapId);
```

In the dead-kart respawn branch, replace:

```js
        const s = spawnPoint(i, sim.karts.length);
        k.x = s.x; k.z = s.z; k.heading = s.heading; k.vel = 0;
```

with:

```js
        const s = map.spawns[i % map.spawns.length];
        k.x = s.x; k.z = s.z; k.heading = s.heading; k.vel = 0;
```

In the alive-kart movement, change the integrate call to pass the map:

```js
      integrateKart(k, cmd, SIM_DT, map);
```

(Find the existing `integrateKart(k, cmd, SIM_DT);` inside the queue-drain `while` loop and add `, map`.)

Add hazard damage right after the per-kart movement block — immediately after `const fire = !!(drained || slot.last || {}).fire;` (before the pickup/firing logic), insert:

```js
    // hazard zones: server-authoritative self-damage (no kill credit; shield/spawn-protect applies via damage())
    for (const hz of map.hazards) {
      const hx = k.x - hz.x, hz2 = k.z - hz.z;
      if (hx * hx + hz2 * hz2 < hz.r * hz.r) { damage(sim, i, hz.dmg, i, now); break; }
    }
    if (!k.alive) continue; // died to a hazard this tick
```

In the projectile loop, replace the bounds check:

```js
      else if (Math.abs(pr.x) > ARENA_W / 2 || Math.abs(pr.z) > ARENA_D / 2) dead = true;
```

with:

```js
      else if (Math.abs(pr.x) > map.arena.w / 2 || Math.abs(pr.z) > map.arena.d / 2) dead = true;
```

- [ ] **Step 5: `rooms.js` — pass options to `createSim`**

In `server/src/rooms.js`, in `acceptInvite`, replace:

```js
    room.sim = game.createSim(room.players);
```

with:

```js
    room.sim = game.createSim(room.players, Date.now(), invite.options || undefined);
```

In `createRoom`, replace the same line `room.sim = game.createSim(room.players);` with:

```js
    room.sim = game.createSim(room.players, Date.now(), options || undefined);
```

- [ ] **Step 6: Create `server/test/maps.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';
import { getMap } from '../src/games/kartMaps.js';

const { createSim, createInitialState, step } = karts;

test('createInitialState carries the chosen map + arena', () => {
  const st = createInitialState({ map: 'gauntlet' });
  assert.equal(st.mapId, 'gauntlet');
  assert.deepEqual(st.arena, getMap('gauntlet').arena);
});

test('createSim seeds spawns + crate pads from the map', () => {
  const sim = createSim([{}, {}], 0, { map: 'pillars' });
  const m = getMap('pillars');
  assert.equal(sim.mapId, 'pillars');
  assert.equal(sim.crates.length, m.pads.length);
  assert.deepEqual({ x: sim.karts[0].x, z: sim.karts[0].z }, { x: m.spawns[0].x, z: m.spawns[0].z });
});

test('default map (no options) preserves the open arena', () => {
  const sim = createSim([{}, {}], 0);
  assert.equal(sim.mapId, 'arena');
  assert.equal(sim.crates.length, 5);
});

test('hazard zone damages a kart standing in it (server-side)', () => {
  const sim = createSim([{}, {}], 0, { map: 'gauntlet' });
  const now = sim.startAt + 2000; // past spawn protection
  const hz = getMap('gauntlet').hazards[0];
  const k = sim.karts[0];
  k.x = hz.x; k.z = hz.z; k.shieldUntil = 0;
  const before = k.hp;
  step(sim, { 0: { queue: [{ seq: 1, throttle: 0, steer: 0, fire: false }], last: null } }, 0.033, now);
  assert.ok(sim.karts[0].hp < before || !sim.karts[0].alive, 'hazard should reduce hp');
});
```

- [ ] **Step 7: Run tests + build**

Run: `cd server && npm test` → all pass.
Run: `cd client && npm run build` → succeeds.

- [ ] **Step 8: Commit**

```bash
git add server/src/games/karts.js server/src/rooms.js server/test/maps.test.js
git commit -m "Smash Karts: map-driven sim (spawns/pads/arena) + server hazard damage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Lobby map selection

**Files:**
- Modify: `server/src/lobbies.js`
- Modify: `server/src/socketHandlers.js`
- Modify: `client/src/pages/Home.jsx`
- Modify: `client/src/pages/Lobby.jsx`
- Modify: `client/src/components/LobbyModal.jsx`
- Create: `server/test/lobbyOptions.test.js`

**Interfaces:**
- Produces: `setLobbyOptions(hostId, options)` (lobbies); `lobby:options` socket event; `onSetLobbyMap` client handler; a map `<select>` in `LobbyModal`.

- [ ] **Step 1: `lobbies.js` — `setLobbyOptions`**

Add after `setReady`:

```js
// Host-only: merge into the lobby's options (e.g. { map }). Returns { lobby } or { error }.
export function setLobbyOptions(hostId, options) {
  const lobby = getLobbyForUser(hostId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  if (lobby.hostId !== hostId) return { error: 'Only the host can change settings.' };
  lobby.options = { ...(lobby.options || {}), ...(options || {}) };
  return { lobby };
}
```

Ensure `publicLobby` exposes `options`. Find `publicLobby` (near the top, returning `{ id, code, gameId, gameName, ... }`) and add `options: lobby.options || null,` to the returned object if not already present.

- [ ] **Step 2: `socketHandlers.js` — `lobby:options` event**

Import `setLobbyOptions` alongside the other lobby imports:

```js
  setLobbyOptions,
```

Add the handler next to `lobby:ready`:

```js
    socket.on('lobby:options', (payload, ack) => {
      const { lobby, error } = setLobbyOptions(me.id, payload?.options);
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true });
    });
```

- [ ] **Step 3: `Home.jsx` — handler**

Add next to `onLobbyReady`:

```js
  const onSetLobbyMap = async (map) => {
    await emitAck('lobby:options', { options: { map } });
  };
```

Pass it to the Lobby component (where `onLobbyReady={onLobbyReady}` etc. are passed):

```js
      onSetLobbyMap={onSetLobbyMap}
```

- [ ] **Step 4: `Lobby.jsx` — thread the prop + maps list to `LobbyModal`**

Add the import:

```js
import { listMaps } from '../games/karts/kartMaps.js';
```

Add `onSetLobbyMap` to the component's destructured props (next to `onStartLobby`).

In the `<LobbyModal ... />` render, add:

```jsx
          maps={lobby.gameId === 'karts' ? listMaps() : null}
          onSetMap={onSetLobbyMap}
```

- [ ] **Step 5: `LobbyModal.jsx` — map picker**

Update the signature to accept `maps` + `onSetMap`:

```js
export default function LobbyModal({ lobby, currentUser, friends, onlineIds, onInvite, onReady, onStart, onLeave, maps, onSetMap }) {
```

Add, just below the members block (before the invite block):

```jsx
      {maps && (
        <div className="lb-map">
          <span className="mode-label">Map</span>
          <select
            value={lobby.options?.map || maps[0].id}
            disabled={!isHost}
            onChange={(e) => onSetMap(e.target.value)}
          >
            {maps.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {!isHost && <span className="muted lb-map-hint">host picks the map</span>}
        </div>
      )}
```

- [ ] **Step 6: Create `server/test/lobbyOptions.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, joinLobby, setLobbyOptions } from '../src/lobbies.js';

test('host can set lobby options; non-host cannot', () => {
  const host = { id: 9001, username: 'host' };
  const guest = { id: 9002, username: 'guest' };
  const { lobby } = createLobby(host, 'karts', null);
  joinLobby(lobby.id, guest);

  const ok = setLobbyOptions(host.id, { map: 'pillars' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.lobby.options.map, 'pillars');

  const bad = setLobbyOptions(guest.id, { map: 'gauntlet' });
  assert.ok(bad.error, 'guest should be rejected');
});
```

(If `createLobby` requires a registered game, `'karts'` is registered in the server registry, so this works without DB.)

- [ ] **Step 7: Run tests + build**

Run: `cd server && npm test` → all pass (incl. lobbyOptions).
Run: `cd client && npm run build` → succeeds.

- [ ] **Step 8: Commit**

```bash
git add server/src/lobbies.js server/src/socketHandlers.js client/src/pages/Home.jsx client/src/pages/Lobby.jsx client/src/components/LobbyModal.jsx server/test/lobbyOptions.test.js
git commit -m "Smash Karts: lobby map selection (lobby:options + LobbyModal picker)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Client rendering + prediction wired to the map

**Files:**
- Modify: `client/src/games/karts/scene.js`
- Modify: `client/src/games/Karts.jsx`

**Interfaces:**
- Consumes: `getMap` (client kartMaps), map-aware `integrateKart`.
- Produces: `createScene(mount, map)` renders the map's arena + obstacles/hazards/boosts; `Karts.jsx` looks up the map and passes it to prediction calls.

- [ ] **Step 1: `scene.js` — build from the map**

In `client/src/games/karts/scene.js`, change `buildArena(scene, arena)` to `buildArena(scene, map)` and use `const arena = map.arena;` at its top; keep the existing ground/seams/walls/corner-posts code (now reading `arena` from the map). Then, before the function's end, add obstacle/hazard/boost meshes:

```js
  // obstacles
  const obMat = new THREE.MeshStandardMaterial({ color: '#2a2450', emissive: '#161033', roughness: 0.6 });
  const obTrim = new THREE.MeshStandardMaterial({ color: '#7cc4ff', emissive: '#7cc4ff', emissiveIntensity: 1.4 });
  for (const o of map.obstacles || []) {
    if (o.kind === 'cyl') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 3, 20), obMat);
      m.position.set(o.x, 1.5, o.z); m.castShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.05, o.r * 1.05, 0.2, 20), obTrim);
      cap.position.set(o.x, 3.1, o.z); scene.add(cap);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, 3, o.d), obMat);
      m.position.set(o.x, 1.5, o.z); m.castShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.2, o.d), obTrim);
      cap.position.set(o.x, 3.1, o.z); scene.add(cap);
    }
  }
  // hazard zones (flat red glow)
  for (const hz of map.hazards || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 28),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(hz.x, 0.04, hz.z); scene.add(m);
  }
  // boost pads (cyan glow)
  for (const b of map.boosts || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(b.r, 28),
      new THREE.MeshBasicMaterial({ color: '#22e0ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(b.x, 0.05, b.z); scene.add(m);
  }
```

Change `createScene(mount, arena)` to `createScene(mount, map)`: at the top set `const arena = map.arena;` (so the existing camera/fog/etc. that reference `arena` still work), and change the `buildArena(scene, arena)` call to `buildArena(scene, map)`.

- [ ] **Step 2: `Karts.jsx` — resolve the map and pass it everywhere**

Add the import:

```js
import { getMap } from './karts/kartMaps.js';
```

Replace:

```js
    const arena = cfg.arena || { w: 80, d: 80 };
    const { scene, camera, renderer, resize: resizeView, render, dispose: disposeView } = createScene(mount, arena);
```

with:

```js
    const map = getMap(cfg.mapId);
    const arena = map.arena;
    const { scene, camera, renderer, resize: resizeView, render, dispose: disposeView } = createScene(mount, map);
```

Update both prediction `integrateKart` calls to pass `map`:
- the reconciliation replay: `for (const p of pending) integrateKart(pred, p, SIM_DT, map);`
- the send-tick predict: `integrateKart(pred, cmd, SIM_DT, map);`

- [ ] **Step 3: Build**

Run: `cd client && npm run build` → succeeds.

- [ ] **Step 4: Manual verify**

In a match: pick each map in the lobby; obstacles render (boxes/pillars with cyan caps) and the kart collides/stops against them; hazard zones glow red and damage you; boost pads glow cyan and speed you up; your kart still steers responsively (prediction) and doesn't desync bumping walls; the Gauntlet's larger 90×70 arena renders correctly.

- [ ] **Step 5: Commit**

```bash
git add client/src/games/karts/scene.js client/src/games/Karts.jsx
git commit -m "Smash Karts: render obstacles/hazards/boosts from the map; predict with map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final integration verification

**Files:**
- Modify: none expected (verification + memory).

- [ ] **Step 1: Full server test suite**

Run: `cd server && npm test` → all suites pass (kartPhysics, prediction, physicsParity, collision, mapsParity, maps, lobbyOptions).

- [ ] **Step 2: Clean client build**

Run: `cd client && rm -rf dist && npm run build` → succeeds (chunk-size warning accepted).

- [ ] **Step 3: Confirm the change set**

Run: `git diff --name-only main` → only this sub-project's files (kartPhysics ×2, kartMaps ×2, karts.js, rooms.js, lobbies.js, socketHandlers.js, Home.jsx, Lobby.jsx, LobbyModal.jsx, scene.js, Karts.jsx, server/test/*, docs).

- [ ] **Step 4: Update project memory**

Update `~/.claude/projects/-home-vishesh-Documents-AI-challenge-2026-projects-Game-platform/memory/playverse-project-overview.md`: note Maps Phase 1 done (shared `kartMaps` data model parity-tested; obstacle collision + boost in the deterministic integrator; server-side hazard damage; lobby map selection via `lobby:options` + `LobbyModal` picker; per-map rendering; 3 maps), that projectiles don't yet collide with obstacles (deferred), and that Phase 2 = elevation/ramps.

- [ ] **Step 5: Commit (only if Step 4 changed tracked files)**

```bash
git add -A
git commit -m "Smash Karts: finalize maps phase 1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Shared map data model (kartMaps ×2 + parity) → Task 2. ✔
- Obstacle collision + boost in integrator (predicted) → Task 1. ✔
- Server hazard damage + map-driven spawns/pads/arena → Task 3. ✔
- Lobby map selection (lobby:options + picker) → Task 4. ✔
- Per-map rendering + prediction passes map → Task 5. ✔
- Determinism/parity/can't-enter/boost/hazard/host-only tests → Tasks 1–4; full run → Task 6. ✔
- Projectiles-don't-collide + no-elevation honored (not implemented) → per non-goals. ✔

**Placeholder scan:** No TBD/TODO; complete code in every step. ✔

**Type consistency:** `integrateKart(k, input, dt, map=null)` — server `step` passes `map`; client passes `map`; tests pass inline maps or null. `getMap(id)` used by createInitialState/createSim/step (server) and Karts.jsx/scene (client). Map shape fields (`arena{w,d}`, `obstacles[{kind,x,z,w,d|r}]`, `hazards[{x,z,r,dmg}]`, `boosts[{x,z,r,strength}]`, `spawns[{x,z,heading}]`, `pads[[x,z]]`) are consistent across integrator (obstacles/boosts/arena), karts.js (spawns/pads/hazards/arena), and scene.js (all). `createSim(players, now, options)` matches the new `rooms.js` call sites. `room.state.mapId` is produced by `createInitialState` and read by `Karts.jsx` (`cfg.mapId`). `setLobbyOptions`/`lobby:options`/`onSetLobbyMap`/`onSetMap`/`maps` thread consistently Home→Lobby→LobbyModal. `listMaps()` shape `{id,name}` matches the `<select>` usage. ✔
