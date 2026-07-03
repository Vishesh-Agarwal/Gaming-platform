# Pool Realism (Workstream C, sub-project 1) — Design

**Date:** 2026-07-03
**Status:** Proceeding on the approved C ordering (Pool → Carrom → Karts → Ghost Rider → Tank Duel); detailed choices made autonomously per user's "continue".

## Goal

Make Pool look, sound, and feel like its market reference (Miniclip's 8 Ball Pool):
a convincingly lit table, balls that visibly roll, impact sounds, and satisfying
pocket drops — without touching game rules or shot outcomes.

## Current state

- Server: `pool.js` (rules, 4 modes) → `poolPhysics.js` (geometry/config) →
  `discPhysics.js` (shared deterministic disc solver, also used by Carrom).
  `simulateShot` returns `{frames, finalDiscs, pocketed, firstContact}` — **no
  event timeline**, so the client can't know *when* collisions/pockets happened.
- Client: `Pool.jsx` canvas renderer — flat color-block table, static ball faces
  (no roll), balls vanish instantly when potted, cue stick is 3 line strokes, no
  audio at all. Aim prediction / spin pad / power stick / replay already work well.

## Design

### 1. Physics event timeline (server, additive, shared with Carrom later)

`discPhysics.simulateShot` additionally returns `events`:

```
{ f, type: 'ball' | 'rail' | 'pocket', id, id2?, speed }
```

- `f` = index into `frames` (the same `frameEvery` cadence).
- `ball`: disc-disc contact; `id`/`id2` participants, `speed` = closing speed.
- `rail`: wall bounce; `speed` = impact speed along the normal.
- `pocket`: disc fell in; `speed` = entry speed.
- Contacts are throttled per pair (no re-report while still overlapping) so one
  touch = one event.

`pool.js` ships it as `lastShot.events`. Determinism and all existing return
fields unchanged; Carrom's caller keeps working untouched (wired to Carrom in
its own sub-project).

### 2. Table render overhaul (client)

Same canvas, new `drawTable`: deep-green directional-lit felt (radial "overhead
lamp" gradient + corner vignette + existing subtle cloth pattern), wood rails
with grain strokes and a gloss edge, brass-look diamond sights (replacing the
flat inlay rects), pocket jaws — leather-dark rim ring, inner radial shadow so
pockets read as holes, small cushion cut-ins at the jaw mouths. Kitchen line and
foot spot kept. All procedural (no assets), drawn once per frame like today.

### 3. Rolling balls (client)

Track per-ball roll state across replay frames: displacement per frame → roll
angle delta (`dist / r`) around the travel direction. Render the number circle
and stripe band offset by the accumulated roll (a "rotating cap" approximation:
the white number cap slides across the ball face and wraps, like 8 Ball Pool's
2.5D look). Static balls keep the current face. Shading/highlight stays fixed
(light doesn't rotate).

### 4. Pocket sink + cue strike animations (client)

- On a `pocket` event at frame `f`, the ball isn't dropped from render instantly:
  for ~10 frames it eases toward the pocket center while scaling to 0 and
  darkening. (The physics frames already stop including it; the client keeps a
  cosmetic copy.)
- On fire, the cue stick thrusts forward over ~120 ms (from its pulled-back
  offset to ball contact) before the replay begins; hidden during the replay as
  today.

### 5. Procedural audio (client)

New `client/src/games/poolAudio.js` (Web Audio, asset-free, same pattern as the
Karts audio module): `createPoolAudio()` → `{ play(type, speed01), dispose }`.

- `ball`: short filtered noise click, brightness/volume scale with speed.
- `rail`: lower thud.
- `pocket`: low thunk + short descending rattle.
- `cue`: strike tap when the shot fires.
- Autoplay-safe (resume on first pointer/key), respects the platform mute
  (`gameSoundMuted` localStorage, live via the existing Game-header sound toggle).

During replay, events fire when their frame index is reached.

## Out of scope

- Rules, physics *outcomes*, prediction, or networking changes.
- Carrom (next sub-project — reuses the event timeline + audio pattern).
- 3D/perspective view.

## Testing

- Server: `discPhysics` event tests (one event per contact, pocket event frame
  matches disappearance, determinism incl. events; existing suites untouched),
  `pool` lastShot.events presence.
- Client: CSS/source assertion tests for roll-state, sink animation, audio
  module contract (pure helpers tested via `node --test`, e.g. roll-angle math
  in a pure `poolRoll.js`).
- Browser verification: play shots in both modes, hear/see impacts, watch a
  pocket sink, check both player orientations (flip) and mobile landscape.
