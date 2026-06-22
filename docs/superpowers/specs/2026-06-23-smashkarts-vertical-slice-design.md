# Smash Karts — vertical slice (realtime engine + 3D driving)

**Date:** 2026-06-23
**Goal:** Prove the two new, risky pieces end-to-end — a server-authoritative
realtime engine and a Three.js client — with 2 players **driving** low-poly karts
in a 3D arena. No combat. Built 4-player-ready. Reuses the existing 2-player
invite (the 4-player lobby is the next sub-project).

## Server

### `karts` game module (`server/src/games/karts.js`)
Server-authoritative realtime; `maxPlayers: 4`. Pure-ish:
- `createInitialState()` → static config broadcast in `room.state`:
  `{ arena: { w, d }, colors: [...], realtime: true }`.
- `createSim(players)` → dynamic sim: `karts[]` with `{ x, z, heading, vel }`,
  spawned at spread positions.
- `step(sim, inputs, dt)` → arcade physics per kart: throttle (input −1..1)
  accelerates along `heading`; steer (−1..1) yaws, scaled by speed; drag; clamp
  to max speed; bounce off arena walls. Mutates `sim`. Deterministic given inputs.
- `snapshot(sim)` → wire data `{ karts: [{ i, x, z, h, v }] }`.

### Realtime engine (`server/src/realtime.js`)
- `startMatch(io, roomId)`: ~30 Hz `setInterval` → `rooms.stepRoom(roomId, dt)`
  → broadcast `game:rt:snap` to each member. Tracks loops by roomId.
- `stopMatch(roomId)`: clear the loop.

### `rooms.js`
- `acceptInvite`: if `game.createSim`, init `room.sim = game.createSim(players)`,
  `room.inputs = {}`.
- `setInput(roomId, userId, input)`: store sanitized `{ throttle, steer }` by index.
- `stepRoom(roomId, dt)`: step sim, return `{ players:[ids], data:{ t, ...snapshot } }`
  or null if the room is gone / not playing.
- `isRealtimeRoom(roomId)`: `typeof game.step === 'function'`.

### `socketHandlers.js`
- On `game:invite:accept`, after `game:start`, if realtime → `realtime.startMatch(io, roomId)`.
- `game:rt:input` → `rooms.setInput(roomId, me.id, input)`.
- On `game:leave` / disconnect / forfeit → `realtime.stopMatch(roomId)`.
- Karts never use the `game:move` (turn-based) path.

## Client (`client/src/games/Karts.jsx`, Three.js)
- Add `three` dependency.
- Scene: ground arena + walls, per-player **low-poly karts** (body + 4 wheels,
  colored by index), lights; **chase camera** following the local kart.
- Input: WASD/arrows → `{ throttle, steer }`, sent ~30 Hz.
- Snapshots: buffered by client receive-time; render ~100 ms in the past,
  interpolating position + heading (no clock-sync needed). All karts (incl. own)
  rendered from server snapshots (no client prediction yet — a known slice
  limitation; prediction can come later).
- Minimal HUD (player tags / count). Register in client registry (new card).
- Dispose renderer/scene on unmount.

## Out of scope (next sub-projects)
4-player lobby; weapons/kills/respawn/90 s timer/scoreboard; models/effects/perf;
client-side prediction.

## Testing
- Unit-test `step()` determinism + wall clamp + that throttle moves a kart along
  its heading.
- Client build (Three.js bundles).
- Manual: two browsers drive around together (user verifies feel — 3D not visible
  to the agent).
