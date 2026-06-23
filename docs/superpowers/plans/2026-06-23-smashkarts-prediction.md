# Smash Karts Client Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Predict the local player's kart from input instantly (no ~100 ms interpolation lag) with server reconciliation, on a deterministic shared movement integrator; and fix the dropped `fire` input.

**Architecture:** Extract kart movement into a pure `integrateKart` shared (by identical copy) between server and client. Server movement becomes input-driven fixed-step (`SIM_DT = 1/30`) with an input queue carrying a sequence number + `fire`; snapshots gain per-kart `v` (velocity) and `seq` (ack). The client predicts its kart each input tick and reconciles each snapshot by replaying unacked inputs. Verified by `node --test` determinism tests.

**Tech Stack:** Node ESM (server), React + Three.js (client), `node:test`.

## Global Constraints

- This sub-project **intentionally changes the server** (input plumbing, movement integration, snapshot fields). Only the files named in tasks should change.
- **Determinism is the contract:** `integrateKart` must be a pure function of `(kart, input, dt)`; the server and client copies must be byte-identical (a test enforces this).
- **Only local-kart movement is predicted.** Weapons/HP/kills stay server-authoritative; remote karts keep snapshot interpolation.
- **`SIM_DT = 1/30`** is the fixed movement step on both sides.
- **Behavior of weapons/projectiles/crates/respawn/match-timing is unchanged** (still wall-clock `now` + tick `dt`).
- Server is ESM (`"type": "module"`). Tests run via `node --test test/` from `server/`.
- Client build: `cd client && npm run build` clean (chunk-size warning accepted).
- `karts.js` has only a default export; tests import it as `import karts from '../src/games/karts.js'` then destructure `karts.createSim` / `karts.step`.

---

### Task 1: Extract the shared movement integrator (behavior-preserving)

**Files:**
- Create: `server/src/games/kartPhysics.js`
- Modify: `server/src/games/karts.js` (use `integrateKart` for movement; remove the now-dead movement constants)
- Modify: `server/package.json` (add a `test` script)
- Create: `server/test/kartPhysics.test.js`

**Interfaces:**
- Produces: `integrateKart(k, input, dt)` (mutates+returns `{x,z,heading,vel}`), `PHYS` (constants), `SIM_DT = 1/30`.

- [ ] **Step 1: Create `server/src/games/kartPhysics.js`**

```js
// Shared, deterministic kart movement integrator. Used by the server sim and the
// client predictor — keep this file byte-identical to its client copy
// (client/src/games/karts/kartPhysics.js); a test asserts they match.
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.7, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
};
export const SIM_DT = 1 / 30;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Advance one movement step. Pure: depends only on (k, input, dt).
export function integrateKart(k, input, dt) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D } = PHYS;
  const d = clamp(dt, 0, 0.1);
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  if (throttle > 0) k.vel += ACCEL * throttle * d;
  else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
  k.vel -= k.vel * Math.min(1, DRAG * d);
  k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading += steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;
  const half = ARENA_W / 2 - KART_R, halfD = ARENA_D / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  return k;
}
```

- [ ] **Step 2: Use `integrateKart` in `karts.js` (behavior-preserving)**

In `server/src/games/karts.js`, add the import near the top (after the existing constant declarations / before `createInitialState`):

```js
import { integrateKart } from './kartPhysics.js';
```

Delete the now-duplicated movement constant lines:

```js
const ACCEL = 26, REVERSE_ACCEL = 16, MAX_SPEED = 28, REVERSE_MAX = 11;
const DRAG = 1.7, TURN_RATE = 2.8, KART_R = 2.2;
```

(Keep `ARENA_W`, `ARENA_D`, `COLORS`, and all weapon/match constants — they're still used elsewhere.)

In `step()`, delete the local half-extent line:

```js
  const half = ARENA_W / 2 - KART_R, halfD = ARENA_D / 2 - KART_R;
```

Then replace the per-kart input-read + movement + wall-clamp block:

```js
    const inp = inputs[i] || {};
    const throttle = clamp(Number(inp.throttle) || 0, -1, 1);
    const steer = clamp(Number(inp.steer) || 0, -1, 1);
    const fire = !!inp.fire;

    if (throttle > 0) k.vel += ACCEL * throttle * d;
    else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
    k.vel -= k.vel * Math.min(1, DRAG * d);
    k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
    const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
    k.heading += steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
    k.x += Math.sin(k.heading) * k.vel * d;
    k.z += Math.cos(k.heading) * k.vel * d;
    if (k.x > half) { k.x = half; k.vel *= 0.4; }
    if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
    if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
    if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
```

with:

```js
    const inp = inputs[i] || {};
    const fire = !!inp.fire;
    integrateKart(k, inp, d);
```

(`integrateKart` does the same clamping, integration, and wall-clamp. `d` is the tick dt — unchanged behavior for this task. `fire` and the weapon logic below are untouched.)

- [ ] **Step 3: Add a test script to `server/package.json`**

In `server/package.json`, add to the `"scripts"` object:

```json
    "test": "node --test test/"
```

- [ ] **Step 4: Create `server/test/kartPhysics.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, PHYS, SIM_DT } from '../src/games/kartPhysics.js';

test('SIM_DT and PHYS are present', () => {
  assert.equal(SIM_DT, 1 / 30);
  assert.equal(PHYS.MAX_SPEED, 28);
  assert.equal(PHYS.ARENA_W, 80);
});

test('integrateKart is deterministic', () => {
  const a = { x: 0, z: 0, heading: 0.2, vel: 5 };
  const b = { x: 0, z: 0, heading: 0.2, vel: 5 };
  integrateKart(a, { throttle: 1, steer: 1 }, SIM_DT);
  integrateKart(b, { throttle: 1, steer: 1 }, SIM_DT);
  assert.deepEqual(a, b);
});

test('throttle accelerates forward (heading 0 -> +z)', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT);
  assert.ok(k.vel > 0);
  assert.ok(k.z > 0.5);
  assert.ok(Math.abs(k.x) < 1e-9);
});

test('wall clamp bounds position', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 28 };
  for (let i = 0; i < 200; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT);
  assert.ok(k.z <= PHYS.ARENA_D / 2 - PHYS.KART_R + 1e-9);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd server && npm test`
Expected: all tests pass (4 passing).

- [ ] **Step 6: Build the client (sanity — server change shouldn't affect it)**

Run: `cd client && npm run build`
Expected: succeeds (chunk-size warning accepted).

- [ ] **Step 7: Commit**

```bash
git add server/src/games/kartPhysics.js server/src/games/karts.js server/package.json server/test/kartPhysics.test.js
git commit -m "Smash Karts: extract shared deterministic kart movement integrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Server input queue + seq + fire fix + fixed-step movement + snapshot fields

**Files:**
- Modify: `server/src/rooms.js` (`setInput` → queue with seq + fire)
- Modify: `server/src/games/karts.js` (`step` drains queue at `SIM_DT`; `createSim` adds `lastSeq`; `snapshot` adds `v` + `seq`)
- Create: `server/test/prediction.test.js`

**Interfaces:**
- Consumes: `integrateKart`, `SIM_DT` from Task 1.
- Produces: per-player input slot shape `{ queue: [{seq,throttle,steer,fire}], last }`; snapshot kart entries with `v` and `seq`.

- [ ] **Step 1: `setInput` — queue inputs with seq + fire (fixes the dropped-fire bug)**

In `server/src/rooms.js`, replace the `setInput` body:

```js
export function setInput(roomId, userId, input) {
  const room = rooms.get(roomId);
  if (!room || !room.inputs) return;
  const player = room.players.find((p) => p.user.id === userId);
  if (!player) return;
  room.inputs[player.index] = {
    throttle: Math.max(-1, Math.min(1, Number(input?.throttle) || 0)),
    steer: Math.max(-1, Math.min(1, Number(input?.steer) || 0)),
  };
}
```

with:

```js
export function setInput(roomId, userId, input) {
  const room = rooms.get(roomId);
  if (!room || !room.inputs) return;
  const player = room.players.find((p) => p.user.id === userId);
  if (!player) return;
  const idx = player.index;
  if (!room.inputs[idx]) room.inputs[idx] = { queue: [], last: null };
  room.inputs[idx].queue.push({
    seq: Number(input?.seq) || 0,
    throttle: Math.max(-1, Math.min(1, Number(input?.throttle) || 0)),
    steer: Math.max(-1, Math.min(1, Number(input?.steer) || 0)),
    fire: !!input?.fire,
  });
  if (room.inputs[idx].queue.length > 240) room.inputs[idx].queue.shift();
}
```

(`room.inputs = {}` initialization in `createRoom`/`acceptInvite` stays — slots are created lazily here.)

- [ ] **Step 2: `createSim` — give each kart a `lastSeq`**

In `server/src/games/karts.js`, in `createSim`, add `lastSeq: 0` to the kart object literal (next to `gone: false`):

```js
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
```

- [ ] **Step 3: `step` — drain the input queue at fixed `SIM_DT`**

In `server/src/games/karts.js`, update the import from Task 1 to also bring in `SIM_DT`:

```js
import { integrateKart, SIM_DT } from './kartPhysics.js';
```

Replace the Task-1 per-kart block:

```js
    const inp = inputs[i] || {};
    const fire = !!inp.fire;
    integrateKart(k, inp, d);
```

with:

```js
    const slot = inputs[i] || {};
    const q = slot.queue || [];
    let drained = null;
    while (q.length) {
      const cmd = q.shift();
      integrateKart(k, cmd, SIM_DT);
      k.lastSeq = cmd.seq || 0;
      drained = cmd;
    }
    if (drained) slot.last = drained;
    const fire = !!(drained || slot.last || {}).fire;
```

(Movement now advances one fixed `SIM_DT` step per queued input; `fire` comes from the latest input. Everything below — pickup, firing, projectiles, collisions — is unchanged. `d` is still used for projectile integration.)

- [ ] **Step 4: `snapshot` — add `v` (velocity) and `seq` (ack)**

In `server/src/games/karts.js`, in the `snapshot` kart map, add `v` and `seq`:

```js
    karts: sim.karts.map((k, i) => ({
      i, x: r1(k.x), z: r1(k.z), h: r1(k.heading), v: r1(k.vel), seq: k.lastSeq || 0,
      hp: Math.round(k.hp), alive: k.alive, kills: k.kills,
      weapon: k.weapon, ammo: k.ammo, shield: now < k.shieldUntil, gone: k.gone,
    })),
```

- [ ] **Step 5: Create `server/test/prediction.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT } from '../src/games/kartPhysics.js';
import karts from '../src/games/karts.js';

const { createSim, step } = karts;

test('reconciliation replay matches a sequential sim', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inputs = [];
  for (let i = 0; i < 50; i++) inputs.push({ seq: i + 1, throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 });

  const full = { x: 1, z: -2, heading: 0.3, vel: 4 };
  for (const inp of inputs) integrateKart(full, inp, SIM_DT);

  const K = 30;
  const anchor = { x: 1, z: -2, heading: 0.3, vel: 4 };
  for (let i = 0; i < K; i++) integrateKart(anchor, inputs[i], SIM_DT);
  const ack = inputs[K - 1].seq;

  const client = { x: anchor.x, z: anchor.z, heading: anchor.heading, vel: anchor.vel };
  for (const inp of inputs) if (inp.seq > ack) integrateKart(client, inp, SIM_DT);

  for (const key of ['x', 'z', 'heading', 'vel']) {
    assert.ok(Math.abs(client[key] - full[key]) < 1e-9, `${key} mismatch`);
  }
});

test('step draining a queue matches integrateKart per input + sets lastSeq', () => {
  const sim = createSim([{}, {}], 0);
  const now = sim.startAt + 1000;
  const cmds = [
    { seq: 1, throttle: 1, steer: 0.5, fire: false },
    { seq: 2, throttle: 1, steer: -0.5, fire: false },
    { seq: 3, throttle: 0.5, steer: 0, fire: false },
  ];
  const k0 = sim.karts[0];
  const exp = { x: k0.x, z: k0.z, heading: k0.heading, vel: k0.vel };
  for (const c of cmds) integrateKart(exp, c, SIM_DT);

  const inputs = { 0: { queue: cmds.map((c) => ({ ...c })), last: null } };
  step(sim, inputs, 0.033, now);

  for (const key of ['x', 'z', 'heading']) {
    assert.ok(Math.abs(sim.karts[0][key === 'heading' ? 'heading' : key] - exp[key]) < 1e-9, `${key} mismatch`);
  }
  assert.equal(sim.karts[0].lastSeq, 3);
});

test('fire travels through the queue into the sim (regression: fire was dropped)', () => {
  const sim = createSim([{}, {}], 0);
  const now = sim.startAt + 1000;
  sim.karts[0].weapon = 'mg';
  sim.karts[0].ammo = 5;
  sim.karts[0].nextShotAt = 0;
  const inputs = { 0: { queue: [{ seq: 1, throttle: 0, steer: 0, fire: true }], last: null } };
  const before = sim.projectiles.length;
  step(sim, inputs, 0.033, now);
  assert.ok(sim.projectiles.length > before, 'a projectile should have been fired');
});
```

- [ ] **Step 6: Run the tests**

Run: `cd server && npm test`
Expected: all tests pass (Task 1 + Task 2 suites).

- [ ] **Step 7: Commit**

```bash
git add server/src/rooms.js server/src/games/karts.js server/test/prediction.test.js
git commit -m "Smash Karts: input queue with seq + fire fix; fixed-step movement; snapshot v/seq

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Client prediction + reconciliation

**Files:**
- Create: `client/src/games/karts/kartPhysics.js` (identical copy of the server module)
- Create: `server/test/physicsParity.test.js` (asserts the two copies match)
- Modify: `client/src/games/Karts.jsx`

**Interfaces:**
- Consumes: `integrateKart`, `SIM_DT` from the client `kartPhysics.js`; snapshot kart fields `v` + `seq` from Task 2.

- [ ] **Step 1: Create `client/src/games/karts/kartPhysics.js` (identical to the server copy)**

Create the file with the EXACT same contents as `server/src/games/kartPhysics.js` (from Task 1, Step 1) — same `PHYS`, `SIM_DT`, and `integrateKart`. Update only the leading comment's cross-reference:

```js
// Shared, deterministic kart movement integrator. Used by the client predictor and
// the server sim — keep this file byte-identical to its server copy
// (server/src/games/kartPhysics.js); a test asserts they match.
export const PHYS = {
  ACCEL: 26, REVERSE_ACCEL: 16, MAX_SPEED: 28, REVERSE_MAX: 11,
  DRAG: 1.7, TURN_RATE: 2.8, KART_R: 2.2, ARENA_W: 80, ARENA_D: 80,
};
export const SIM_DT = 1 / 30;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function integrateKart(k, input, dt) {
  const { ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE, KART_R, ARENA_W, ARENA_D } = PHYS;
  const d = clamp(dt, 0, 0.1);
  const throttle = clamp(Number(input?.throttle) || 0, -1, 1);
  const steer = clamp(Number(input?.steer) || 0, -1, 1);
  if (throttle > 0) k.vel += ACCEL * throttle * d;
  else if (throttle < 0) k.vel += REVERSE_ACCEL * throttle * d;
  k.vel -= k.vel * Math.min(1, DRAG * d);
  k.vel = clamp(k.vel, -REVERSE_MAX, MAX_SPEED);
  const turnFactor = clamp(Math.abs(k.vel) / 8, 0, 1);
  k.heading += steer * TURN_RATE * d * turnFactor * Math.sign(k.vel || 1);
  k.x += Math.sin(k.heading) * k.vel * d;
  k.z += Math.cos(k.heading) * k.vel * d;
  const half = ARENA_W / 2 - KART_R, halfD = ARENA_D / 2 - KART_R;
  if (k.x > half) { k.x = half; k.vel *= 0.4; }
  if (k.x < -half) { k.x = -half; k.vel *= 0.4; }
  if (k.z > halfD) { k.z = halfD; k.vel *= 0.4; }
  if (k.z < -halfD) { k.z = -halfD; k.vel *= 0.4; }
  return k;
}
```

- [ ] **Step 2: Create `server/test/physicsParity.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/games/kartPhysics.js';
import * as client from '../../client/src/games/karts/kartPhysics.js';

test('client and server kartPhysics constants match', () => {
  assert.deepEqual(client.PHYS, server.PHYS);
  assert.equal(client.SIM_DT, server.SIM_DT);
});

test('client and server integrateKart produce identical output', () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 500; i++) {
    const base = { x: rnd() * 40 - 20, z: rnd() * 40 - 20, heading: rnd() * 7 - 3.5, vel: rnd() * 40 - 12 };
    const input = { throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 };
    const dt = rnd() * 0.05;
    const a = server.integrateKart({ ...base }, input, dt);
    const b = client.integrateKart({ ...base }, input, dt);
    assert.deepEqual(b, a);
  }
});
```

- [ ] **Step 3: Import the integrator + add prediction state in `Karts.jsx`**

In `client/src/games/Karts.jsx`, add the import:

```js
import { integrateKart, SIM_DT } from './karts/kartPhysics.js';
```

Inside the effect, near the snapshot buffer declarations (where `buffer`/`latest` are defined), add prediction state:

```js
    // client-side prediction of the local kart
    const pred = { x: 0, z: 0, heading: 0, vel: 0, has: false };
    const pending = [];
    const renderLocal = { x: 0, z: 0, h: 0 };
    let renderInit = false;
    let inputSeq = 0;
    const PRED_SMOOTH = 0.35;
```

- [ ] **Step 4: Reconcile inside `onSnap`**

In `client/src/games/Karts.jsx`, replace the existing `onSnap`:

```js
    const onSnap = (snap) => {
      if (!snap?.karts) return;
      buffer.push({ ct: performance.now(), karts: snap.karts });
      if (buffer.length > 10) buffer.shift();
      latest.snap = snap;
    };
```

with:

```js
    const onSnap = (snap) => {
      if (!snap?.karts) return;
      buffer.push({ ct: performance.now(), karts: snap.karts });
      if (buffer.length > 10) buffer.shift();
      latest.snap = snap;
      // reconcile local prediction against the authoritative state
      const mine = snap.karts.find((k) => k.i === youAreIndex);
      if (mine && mine.alive && !mine.gone) {
        pred.x = mine.x; pred.z = mine.z; pred.heading = mine.h; pred.vel = mine.v || 0;
        const ack = mine.seq || 0;
        while (pending.length && pending[0].seq <= ack) pending.shift();
        for (const p of pending) integrateKart(pred, p, SIM_DT);
        pred.has = true;
      } else if (mine) {
        pred.has = false; pending.length = 0; renderInit = false;
      }
    };
```

- [ ] **Step 5: Predict on each input send**

In `client/src/games/Karts.jsx`, replace the send timer:

```js
    const sendTimer = setInterval(() => {
      socket?.emit('game:rt:input', { roomId, input: { throttle: input.throttle, steer: input.steer, fire: input.fire } });
    }, 33);
```

with:

```js
    const sendTimer = setInterval(() => {
      inputSeq += 1;
      const cmd = { seq: inputSeq, throttle: input.throttle, steer: input.steer, fire: input.fire };
      if (pred.has) {
        integrateKart(pred, cmd, SIM_DT);
        pending.push({ seq: inputSeq, throttle: cmd.throttle, steer: cmd.steer });
        if (pending.length > 240) pending.shift();
      }
      socket?.emit('game:rt:input', { roomId, input: cmd });
    }, 33);
```

- [ ] **Step 6: Render the local kart from the prediction (with smoothing)**

In the render loop, just after `const me = sample.find((k) => k.i === youAreIndex) || sample[0];` and `meX = me ? me.x : null;`, add prediction smoothing and a camera-pose source:

```js
        // ease the rendered local pose toward the predicted pose
        if (pred.has) {
          if (!renderInit) { renderLocal.x = pred.x; renderLocal.z = pred.z; renderLocal.h = pred.heading; renderInit = true; }
          else {
            renderLocal.x += (pred.x - renderLocal.x) * PRED_SMOOTH;
            renderLocal.z += (pred.z - renderLocal.z) * PRED_SMOOTH;
            renderLocal.h = lerpAngle(renderLocal.h, pred.heading, PRED_SMOOTH);
          }
        }
        const camPose = pred.has ? renderLocal : me;
```

Inside the `for (const ks of sample)` loop, replace the pose assignment:

```js
          g.position.set(ks.x, 0, ks.z);
          g.rotation.y = ks.h;
```

with (use the predicted pose for the local kart):

```js
          const useLocal = ks.i === youAreIndex && pred.has;
          const rx = useLocal ? renderLocal.x : ks.x;
          const rz = useLocal ? renderLocal.z : ks.z;
          const rh = useLocal ? renderLocal.h : ks.h;
          g.position.set(rx, 0, rz);
          g.rotation.y = rh;
```

Then update the speed/turn derivation just below it to use the rendered pose (`rx/rz/rh`) instead of `ks.x/ks.z/ks.h`:

```js
          const pt = prevT[ks.i];
          let speed = 0, turn = 0;
          if (pt.init) {
            speed = Math.hypot(rx - pt.x, rz - pt.z);
            turn = ((rh - pt.h + Math.PI) % (Math.PI * 2)) - Math.PI;
          }
          pt.x = rx; pt.z = rz; pt.h = rh; pt.init = true;
```

- [ ] **Step 7: Point the camera at the predicted pose**

In the camera block, replace:

```js
        if (me) {
          const fxDir = Math.sin(me.h), fz = Math.cos(me.h);
          camTarget.set(me.x - fxDir * 16, 11, me.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(me.x, 1.5, me.z);
```

with (use `camPose`, which is the predicted local pose when available):

```js
        if (camPose) {
          const fxDir = Math.sin(camPose.h), fz = Math.cos(camPose.h);
          camTarget.set(camPose.x - fxDir * 16, 11, camPose.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(camPose.x, 1.5, camPose.z);
```

(Leave the closing `}` of that block as-is.)

- [ ] **Step 8: Run the physics-parity test + build**

Run: `cd server && npm test`
Expected: all tests pass, including `physicsParity.test.js` (client copy matches server copy).

Run: `cd client && npm run build`
Expected: succeeds (chunk-size warning accepted).

- [ ] **Step 9: Commit**

```bash
git add client/src/games/karts/kartPhysics.js server/test/physicsParity.test.js client/src/games/Karts.jsx
git commit -m "Smash Karts: client-side prediction + reconciliation for the local kart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final integration verification

**Files:**
- Modify: none expected (verification + memory).

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm test`
Expected: all tests pass (kartPhysics, prediction, physicsParity).

- [ ] **Step 2: Clean client build**

Run: `cd client && rm -rf dist && npm run build`
Expected: succeeds (chunk-size warning accepted).

- [ ] **Step 3: Confirm the change set is the intended files only**

Run: `git diff --name-only main`
Expected: only the prediction sub-project's files (server `kartPhysics.js`, `karts.js`, `rooms.js`, `package.json`, `server/test/*`, client `kartPhysics.js`, `Karts.jsx`, the spec/plan docs). No unrelated files.

- [ ] **Step 4: Update project memory**

Update `~/.claude/projects/-home-vishesh-Documents-AI-challenge-2026-projects-Game-platform/memory/playverse-project-overview.md`: note the client-prediction sub-project is done (shared deterministic `kartPhysics.integrateKart`; input queue with seq; fixed-step movement; snapshot `v`/`seq`; client predict + replay reconciliation; **fire-input bug fixed**; determinism tests via `node --test`), that Smash Karts is now feature-complete, and that the only open item is the user's browser feel-test feedback.

- [ ] **Step 5: Commit (only if Step 4 or any fix changed tracked files)**

```bash
git add -A
git commit -m "Smash Karts: finalize client-prediction sub-project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Shared deterministic integrator (`kartPhysics.js` + `PHYS` + `SIM_DT`) → Task 1; client copy + parity test → Task 3. ✔
- Input queue with seq + `fire` fix → Task 2 Step 1. ✔
- Fixed-step movement draining the queue → Task 2 Step 3. ✔
- `createSim` `lastSeq` + snapshot `v`/`seq` → Task 2 Steps 2/4. ✔
- Client predict on send + reconcile on snapshot + render-from-prediction with smoothing + camera → Task 3 Steps 3–7. ✔
- Remote karts unchanged (only `ks.i === youAreIndex` uses the predicted pose) → Task 3 Step 6. ✔
- Determinism/parity/fire tests → Tasks 1–3; full run → Task 4. ✔

**Placeholder scan:** No TBD/TODO; every code step is complete. ✔

**Type consistency:** `integrateKart(k, input, dt)` mutates `{x,z,heading,vel}` and is used identically on server (`step`) and client (`onSnap` replay, `sendTimer` predict). `pred` uses `heading`; snapshot/`sample` use `h` — conversions are explicit (`pred.heading = mine.h`; `renderLocal.h = pred.heading`). `pending` entries are `{seq,throttle,steer}` — exactly what `integrateKart` reads. Snapshot adds `v`/`seq`, consumed as `mine.v`/`mine.seq` on the client. `SIM_DT` is imported from `kartPhysics` on both sides (same 1/30). The per-kart slot shape `{queue,last}` is produced by `setInput` and consumed by `step`. `karts.js` is default-imported in tests (`karts.createSim`/`karts.step`). ✔
