# Smash Karts — Client Prediction + Reconciliation (Design)

Date: 2026-06-23
Status: Approved
Sub-project 4 (final) of the Smash Karts "polish" track (1: visual ✅; 2: sound ✅; 3: perf ✅).

## Goal

Make the local player's kart respond to input **instantly** instead of ~100 ms behind
(the snapshot-interpolation delay), using **client-side prediction + server
reconciliation** — the gold-standard netcode model. Also fix a latent bug: the `fire`
input is currently dropped before reaching the sim, so weapons never fire in the live game.

Approach chosen: **full reconciliation** (input sequence numbers + server ack + client
replay), built on a deterministic, fixed-timestep movement integrator shared (by identical
copy) between server and client.

This sub-project **does change the server** (input plumbing, movement integration, snapshot
fields) — expected and necessary for reconciliation. Combat/weapons/projectiles/respawn
logic is otherwise unchanged.

## Why the current model can't replay

`server/src/games/karts.js` `step()` integrates kart movement with a **variable** wall-clock
`dt` per 30 Hz tick, and `setInput` stores only the latest `{throttle, steer}` (no sequence,
and it drops `fire`). For a client to replay its unacknowledged inputs and land on the same
pose the server computes, both sides must apply the **same integrator** the **same number of
times** with the **same dt**. So movement must become input-driven and fixed-step.

## Non-goals (YAGNI / deferred)

- No prediction of weapons/HP/kills — those stay fully server-authoritative (you see your
  shots when the server confirms them). Only **local kart movement** is predicted.
- No prediction/extrapolation of **remote** karts — they keep the existing ~100 ms snapshot
  interpolation.
- No lag-compensation / server rewind for hit detection.
- No entity interpolation changes for crates/projectiles.
- "Feel" under real latency is **not** verifiable in this environment; correctness is
  verified by determinism unit tests. The user will browser-test feel and give feedback.

## Architecture

### 1. Shared deterministic integrator (`kartPhysics`)

Extract the movement math from `karts.js` `step()` into a pure function:

```
integrateKart(k, input, dt) -> k   // mutates+returns { x, z, heading, vel }
```

Applying: accel/reverse, drag, speed clamp, speed-scaled turn, position integration, and
wall clamping (`vel *= 0.4` on hit) — identical to the current code. Plus a `PHYS` object
holding the constants (`ACCEL, REVERSE_ACCEL, MAX_SPEED, REVERSE_MAX, DRAG, TURN_RATE,
KART_R, ARENA_W, ARENA_D`) and `SIM_DT = 1/30`.

Because `server/` and `client/` are separate build roots with no shared package, keep an
**identical copy** in each:
- `server/src/games/kartPhysics.js` — imported by `karts.js`.
- `client/src/games/karts/kartPhysics.js` — imported by the client predictor.

A Node test imports **both** copies and asserts identical output on a battery of random
vectors, so they cannot silently drift. (Both are plain ESM, no JSX/three, so Node can
import the client copy directly.)

### 2. Server: input-driven fixed-step movement + seq + fire fix

- **`rooms.js setInput(roomId, userId, input)`**: change the per-player slot from a single
  `{throttle, steer}` object to a **queue**. Each call pushes
  `{ seq: Number(input.seq)||0, throttle, steer, fire: !!input.fire }` (clamped) onto
  `room.inputs[index].queue`, capped (e.g. 240 entries) to bound memory. This restores
  `fire`.
- **`room.inputs` init**: wherever the realtime room/sim is created, initialize
  `room.inputs = players.map(() => ({ queue: [], last: null }))` (instead of the old
  `[{}]`-style array). (Find the existing init in `rooms.js`.)
- **`karts.js step(sim, inputs, dt, now)`**: for each alive kart, **drain its queue**: for
  each queued input, call `integrateKart(k, input, SIM_DT)` and set `k.lastSeq = input.seq`;
  keep the last drained input as `inputs[i].last`. Use the latest drained input's `fire`
  (falling back to `inputs[i].last?.fire`) for the existing weapon/fire logic, which stays
  per-tick on wall-clock `now`. If the queue is empty this tick, the kart does not integrate
  (it will catch up when inputs arrive; the client sends steadily). Projectiles, crates,
  collisions, respawn, match timing: **unchanged** (still tick `dt` / `now`).
- **`karts.js snapshot`**: add two fields to each kart entry: `v: r1(k.vel)` and
  `seq: k.lastSeq || 0`. (Everything else unchanged.) `v` lets the client resume integration
  from the authoritative state; `seq` is the per-player ack.
- **`socketHandlers.js`**: `game:rt:input` already forwards `payload.input` to `setInput`;
  ensure the payload's `seq` is preserved (it is, since we pass the whole input object).

`createSim` adds `lastSeq: 0` to each kart's initial state (so the field always exists).

### 3. Client: prediction + reconciliation (`Karts.jsx`)

- **Input send** (existing ~30 Hz `setInterval`): keep a module `let seq = 0;`. Each tick:
  increment `seq`, build `input = { seq, throttle, steer, fire }`, **predict locally**
  (`integrateKart(local, input, SIM_DT)`), push `{ seq, throttle, steer }` to a bounded
  `pending` array, and emit `game:rt:input` with the input (incl. `seq`).
- **Local predicted state** `local = { x, z, heading, vel }`: initialized from the first
  snapshot's local kart; reset to authoritative whenever we have no prediction yet.
- **Reconcile on each snapshot**: read the local kart's authoritative `{x, z, h, v, seq:ack}`.
  Set `local` to that authoritative pose; drop `pending` entries with `seq <= ack`; **replay**
  each remaining pending input through `integrateKart(local, input, SIM_DT)`. Now `local` is
  the corrected prediction.
- **Render the local kart from `local`** instead of from the interpolation buffer. Apply
  light smoothing: keep a `renderLocal` pose eased toward `local` each frame (e.g. lerp
  factor ~0.35 for position, `lerpAngle` for heading) so reconciliation corrections don't
  pop. Remote karts continue to use `sampleAt()` interpolation unchanged.
- **Death/respawn**: when the local kart is dead (`!alive`/`gone`), skip prediction/render
  for it (as today, it's hidden); reconciliation re-anchors to the authoritative pose on
  respawn (the per-snapshot "set local to authoritative" handles the teleport, smoothed).
- The existing `updateKart`/wheel-spin/camera all consume the local kart's render pose, so
  they keep working (camera follows the predicted pose → feels instant).

`SIM_DT` on the client is imported from the client `kartPhysics.js` (same value, 1/30).

## Error handling / robustness

- Stale/duplicate/old `seq` from reordered packets: server pushes in arrival order; the
  client drops `pending` by `seq <= ack`, so out-of-order acks just trim less — never
  negative. Guard the queue/pending caps to bound memory.
- If a snapshot lacks `v`/`seq` (e.g. a transitional frame), default `v=0`/`seq=0`; the next
  snapshot corrects it.
- If prediction has no local kart yet (before first snapshot), render nothing for it (today's
  behavior) until the first snapshot seeds `local`.
- Queue empty on a tick (dropped packet) → kart coasts visually via the last predicted pose;
  next inputs reconcile it. Bounded; no crash.

## Testing / verification (the backbone — this IS verifiable)

Add Node tests under `server/test/` run via `node --test` (built-in runner; server is ESM).
Add a `"test": "node --test test/"` script to `server/package.json`.

1. **Physics parity:** `server/src/games/kartPhysics.js` and
   `client/src/games/karts/kartPhysics.js` produce identical `{x,z,heading,vel}` for a
   battery of random `(kart, input, dt)` vectors. (Imports both copies.)
2. **Replay determinism:** for a random input list, simulating all N sequentially equals
   anchoring at the pose after K inputs (with that input's seq as ack) and replaying inputs
   K+1..N — i.e. exactly what reconciliation does. Final pose must match within float
   epsilon.
3. **`fire` plumbing:** a `setInput` call with `fire:true` results in the sim firing (queue
   carries `fire`; after a `step` with ammo, a projectile is created) — proves the bug is
   fixed end-to-end through `setInput` → `step`.
4. **Movement-via-queue == integrator:** a kart advanced by `step()` draining a queue of M
   inputs lands on the same pose as M sequential `integrateKart(k, input, SIM_DT)` calls.
5. Build: `cd client && npm run build` clean (chunk-size warning accepted).

Manual (user): browser-test that your kart steers instantly with no ~100 ms lag, remote
karts still move smoothly, weapons now fire, and there's no rubber-banding on LAN. User will
report feel feedback.

## Rollout

Feature branch `smashkarts-prediction`, subagent-driven, merged to `main`. This is the last
Smash Karts polish sub-project — after it, Smash Karts is fully feature-complete.
