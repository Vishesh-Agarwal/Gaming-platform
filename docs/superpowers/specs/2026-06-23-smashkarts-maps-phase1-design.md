# Smash Karts — Maps Phase 1: Flat Map Foundation (Design)

Date: 2026-06-23
Status: Approved
First of two map sub-projects. Phase 2 (later) adds ramps/elevation on this foundation.
Builds on the completed prediction netcode (shared deterministic `integrateKart`).

## Goal

Add **selectable flat arenas with obstacles, hazards, and boost pads**. Establish a
**shared, deterministic map data model** and move **obstacle collision + boost** into the
shared `integrateKart` so they stay predicted + reconciled, exactly like kart movement.
This is the foundation Phase 2 (elevation) builds on.

Phase 1 features (all approved): solid obstacles, hazard zones, boost pads, multiple
selectable layouts (host picks in the lobby).

## Non-goals (deferred)

- **No elevation/ramps/jump-pads** — that's Phase 2 (vertical physics in the integrator).
- **Projectiles do NOT collide with obstacles in Phase 1** (they pass over walls). Walls
  block *karts* only. Projectile-vs-wall blocking is a small follow-up. (User-approved.)
- **No map editor** — maps are hand-authored data in code.
- **No sliding-along-walls** — collision dampens velocity on contact (`vel *= 0.4`), matching
  the existing arena-wall behavior; smooth slide is possible polish later.

## Architecture

### 1. Shared map data model (`kartMaps`)

New module, kept **byte-identical** in both build roots (like `kartPhysics`, with a parity
test): `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js`.

```js
export const MAPS = {
  arena:    { id:'arena',    name:'Open Arena', arena:{w:80,d:80}, obstacles:[], hazards:[], boosts:[], spawns:[...], pads:[[0,0],[-24,-24],[24,-24],[-24,24],[24,24]] },
  pillars:  { id:'pillars',  name:'Pillars',    arena:{w:80,d:80}, obstacles:[{kind:'cyl',x,z,r}, ...], ... },
  gauntlet: { id:'gauntlet', name:'Gauntlet',   arena:{w:90,d:70}, obstacles:[{kind:'box',x,z,w,d}, ...], hazards:[{x,z,r,dmg:999}], boosts:[{x,z,r,strength:40}], ... },
};
export const DEFAULT_MAP = 'arena';
export function getMap(id) { return MAPS[id] || MAPS[DEFAULT_MAP]; }
export function listMaps() { return Object.values(MAPS).map((m) => ({ id: m.id, name: m.name })); }
```

Obstacle kinds: `box` (axis-aligned: `x,z,w,d`) and `cyl` (`x,z,r`). Each map owns its
`arena` size, `spawns` (`{x,z,heading}` list), and `pads` (weapon-crate locations) so
layouts are fully self-contained. Three authored maps: **Open Arena** (today's empty box),
**Pillars** (cylinder cover), **Gauntlet** (box walls + a hazard strip + a boost lane).

### 2. Collision + boost in the shared integrator

`integrateKart(k, input, dt, map = null)` gains a `map` arg (defaulted so existing
no-map tests still pass and old behavior is preserved when `map` is null/empty). Integration
order (identical in both copies — parity-critical):

1. accel / reverse, drag, speed clamp (as today)
2. **boost:** if the kart center is within a boost pad's `r`, `k.vel = Math.max(k.vel, strength)` (may exceed `MAX_SPEED` briefly; drag bleeds it off after leaving the pad)
3. turn (heading)
4. position integrate (x,z)
5. arena wall clamp (as today)
6. **obstacle push-out:** for each obstacle, if the kart (circle of radius `PHYS.KART_R`) overlaps it, push the kart to the nearest non-overlapping position and dampen `k.vel *= 0.4`:
   - **box:** closest-point-on-AABB to kart center; if distance `< KART_R`, push out along the normal (degenerate center-inside case pushes along least-penetration axis)
   - **cyl:** if `dist(center, pad) < KART_R + r`, push out radially to `KART_R + r`

Pure given `(k, input, dt, map)`. Hazards are **not** here (server-authoritative damage —
see below), so prediction never predicts damage.

### 3. Server wiring (`karts.js`, `rooms.js`)

- `createInitialState(options)` → returns `{ ...arena from map, colors, realtime, maxPlayers, mapId }` where `mapId = options?.map` validated via `getMap`. (`room.state.mapId` reaches the client.)
- `createSim(players, now, options)` → resolves `const map = getMap(options?.map)`, stores `sim.mapId = map.id`, seeds each kart from `map.spawns`, builds crates from `map.pads`, uses `map.arena` bounds.
- `rooms.js`: pass options into `createSim` in BOTH `createRoom` and `acceptInvite` (currently it's omitted) — `game.createSim(room.players, Date.now(), options)`.
- `step()`: look up `const map = getMap(sim.mapId)`, pass it to `integrateKart(k, inp, SIM_DT, map)`; after movement, apply **hazard damage** server-side for each alive kart within a hazard radius (`damage(sim, i, h.dmg, i, now)` — self-credit; `dmg>=hp` ⇒ instakill); use `map.arena` for projectile bounds and `map.spawns` for respawn.
- Snapshot unchanged except it already carries everything; `mapId` travels via `room.state` (no per-tick cost).
- `spawnPoint()` is replaced by indexing `map.spawns` (wrap by index); the hardcoded `PADS` constant is replaced by `map.pads`.

### 4. Lobby map selection

- `lobbies.js`: add `setLobbyOptions(hostId, options)` — host-only; merges into `lobby.options` (e.g. `{ map }`); returns `{ lobby }` or `{ error }`.
- `socketHandlers.js`: add `lobby:options` event → `setLobbyOptions` → `broadcastLobby`.
- `LobbyModal.jsx`: a **map `<select>`** (options from the client `listMaps()`); host can change it (emits `lobby:options`), non-host sees it disabled showing the current pick. Reads the current map from `lobby.options?.map ?? DEFAULT_MAP`.
- `Home.jsx`/`Lobby.jsx`: thread an `onSetLobbyOptions` handler that emits `lobby:options`.
- The chosen map already flows: `startLobby` returns `lobby.options` → `createRoom(gameId, options, userIds)` → `createSim`/`createInitialState(options)`.

### 5. Client rendering

- The client resolves `const map = getMap(room.state?.mapId)` and renders from it:
  - `scene.js` `buildArena` takes the map: arena floor/walls sized to `map.arena`; build obstacle meshes (Box/Cylinder) at each obstacle; hazard zones as glowing translucent floor regions (red); boost pads as glowing arrow/chevron floor decals.
  - Materials reuse the existing neon palette; obstacles cast/receive shadows; everything disposed in the existing teardown.
- `Karts.jsx` passes `map` to every `integrateKart` call (prediction on send + replay on snapshot) so client prediction matches the server's collision/boost. Map looked up once from `room.state.mapId`.

## Determinism / prediction safety

- `kartMaps` server & client copies are byte-identical (parity test), so `integrateKart`
  produces identical results on both sides given the same `mapId`.
- Collision/boost are inside the deterministic integrator → predicted + reconciled, no desync
  around obstacles.
- Hazards are server-only (damage), consistent with "HP/kills never predicted."

## Error handling

- Unknown/missing `options.map` → `getMap` falls back to `DEFAULT_MAP`.
- `integrateKart(k, input, dt)` with no `map` (or empty obstacle/boost arrays) → exactly
  today's behavior (keeps existing prediction tests valid).
- Empty `spawns`/`pads` guarded (fall back to a center spawn / no crates) — though authored
  maps always provide them.

## Testing / verification

`node --test` (server), plus the existing suites must stay green:
1. **Map parity:** server & client `kartMaps` deep-equal (`MAPS`, `DEFAULT_MAP`).
2. **Collision determinism + replay:** with a map containing an obstacle, sequential sim ==
   anchor+replay (reconciliation still exact with collision in the loop).
3. **Can't-enter-obstacle:** drive a kart straight at a box/cylinder for many steps; assert it
   never ends up inside (distance ≥ clearance).
4. **Boost:** a kart over a boost pad reaches a speed `> MAX_SPEED` (or ≥ strength); away from
   pads, drag returns it below `MAX_SPEED`.
5. **Hazard:** `step()` with a kart inside a hazard reduces hp / kills (server-side).
6. **Lobby options:** `setLobbyOptions` host-only; non-host rejected.
7. Client build clean.

Manual (user): pick each map in the lobby; obstacles render and block karts; boost pads speed
you up; hazards hurt; prediction stays smooth bumping into walls; the other games unaffected.

## Rollout

Feature branch `smashkarts-maps-phase1`, subagent-driven, merged to `main`. Phase 2
(elevation) follows as its own brainstorm → spec → plan.
