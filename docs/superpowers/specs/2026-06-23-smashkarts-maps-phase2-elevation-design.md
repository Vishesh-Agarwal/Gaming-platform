# Smash Karts — Maps Phase 2: Elevation (Design)

**Date:** 2026-06-23
**Status:** Approved (pending spec review)
**Builds on:** Maps Phase 1 (shared map-data model, collision-in-integrator, parity tests)

## Goal

Give karts a real vertical dimension. Players drive up ramps onto mesas,
launch off lips into steer-only ballistic flight, land, and fight across
height — all server-authoritative, fully predicted/reconciled, with 3D
projectiles. One cohesive feature on top of the Phase 1 foundation.

## Approved decisions (from brainstorming)

1. **Physics model:** Full airtime — jumps, gravity, landing. Integrator
   gains `y`, `vy`, `grounded`, all reconciled.
2. **Surface model:** Analytic primitives. New `wedge` ramp primitive +
   existing `box` obstacles upgraded to height-aware **mesas**. Cylinders
   stay solid pillars (not climbable).
3. **Launch + air:** Ramp launch (`vy` from the rate the surface was rising
   under the kart). In air: heading still turns (steer-only), x/z carry
   momentum (no accel/drag). No jump button.
4. **Map scope:** Retrofit the existing three maps (Open Arena, Pillars,
   Gauntlet) **and** add one new elevated showcase map.
5. **Weapons:** Full 3D projectiles — `y` + gravity, 3D hit test. Projectiles
   are server-only (not predicted).

## Architecture

The shared, byte-identical, parity-tested `integrateKart` remains the single
source of kart movement truth, used by both server sim and client predictor.
Elevation extends it; it does **not** introduce a second code path. Projectiles
continue to live only in the server `step()` (rendered from snapshots), so the
3D-projectile work stays out of the parity-critical core.

### Coordinate model

- `x`, `z`: horizontal position (unchanged).
- `y`: height of the kart's base above the arena floor (new). Ground floor is
  `y = 0`.
- `heading`: yaw (unchanged); turns in both grounded and airborne states.
- `vel`: horizontal speed along heading (unchanged).
- `vy`: vertical velocity (new).
- `grounded`: whether the kart is resting on a surface (new).
- `pitch`, `roll`: **render-only** tilt derived from the surface gradient;
  never part of sim state, snapshot, or reconciliation.

## Components

### 1. Surface model — `kartMaps.js` (both copies, byte-identical)

New/extended map data:

```js
// box gains an optional `top` (height of its flat drivable surface).
// Defaults to 3 (the height Phase 1 already renders boxes at), so existing
// maps are unchanged.
obstacles: [{ kind: 'box', x, z, w, d, top: 6 }]

// new ramp primitive: a linear slope from loY to hiY across its footprint
// along `axis` ('x' or 'z').
ramps: [{ kind: 'wedge', x, z, w, d, axis: 'z', loY: 0, hiY: 6 }]
```

New shared pure function (lives in `kartPhysics.js` so the integrator can call
it; both copies byte-identical):

```js
// Max height of any surface column covering (x, z). Default ground = 0.
surfaceHeight(map, x, z)
```

Rules:
- Base ground contributes `0`.
- A **box** whose footprint covers (x, z) contributes `box.top` (default 3).
- A **wedge** whose footprint covers (x, z) contributes the linearly
  interpolated height between `loY` and `hiY` along `axis`, clamped to the
  footprint.
- Result is the **maximum** over all contributors (overlapping primitives →
  the highest surface wins).
- Cylinders do **not** contribute (you cannot stand on a round cap).

### 2. Integrator — `kartPhysics.js` (both copies, byte-identical)

New constants in `PHYS`: `GRAVITY`, `LAUNCH_MIN` (minimum implied upward speed
to leave the ground), and a fixed barrel/look-ahead distance as needed. Exact
values chosen during implementation and locked by tests.

Per-step flow (replaces the current horizontal-only flow):

1. **Horizontal motion**
   - If `grounded`: accel/reverse/drag and boost pads apply as today.
   - If airborne: **no** accel, **no** drag, **no** boost — x/z carry the
     horizontal momentum from takeoff.
   - Heading turns in **both** states (steer-only air control). Keep the
     existing speed-scaled `turnFactor`.
   - Advance `x`, `z`.

2. **Perimeter walls** — always clamp to the arena bounds regardless of `y`
   (full-height walls; you cannot launch out of bounds). Same `vel *= 0.4`.

3. **Obstacle collision (height-gated)**
   - **box:** apply the existing AABB push-out **only while `k.y < box.top`**.
     At/above `box.top` the box is a floor (handled by `surfaceHeight`), not a
     wall.
   - **cyl:** always push out (solid full-height pillar; unchanged from
     Phase 1).

4. **Vertical motion**
   - `floor = surfaceHeight(map, k.x, k.z)`.
   - **Launch test (grounded only):** compute `vyImplied = (floor − floorPrev)
     / d` where `floorPrev` is `surfaceHeight` at the pre-move (x, z). Using a
     one-step look-ahead of `surfaceHeight` along the velocity, if the kart was
     climbing fast enough (`vyImplied > LAUNCH_MIN`) and the ground ahead no
     longer keeps up with that upward momentum, transition to airborne:
     `grounded = false`, `vy = vyImplied`, `y = floor`.
   - **Grounded, not launching:** glue to the surface — `y = floor`, `vy = 0`.
   - **Airborne:** `vy -= GRAVITY · d`; `y += vy · d`. If `y <= floor`, land:
     `y = floor`, `vy = 0`, `grounded = true`.

The launch step is the single trickiest deterministic piece and gets dedicated
tests (fast ascent → airborne with `vy > 0`; slow ascent → stays glued; flat
ground → never launches).

### 3. Projectiles (3D) — `karts.js` server `step()`

- `proj` gains `y` and `vy`.
- Fired from the shooter's `y + BARREL` height.
- Per step: `x += vx·d; z += vz·d; y += vy·d; vy -= GRAVITY_PROJ·d`
  (rockets arc; MG drops slightly — tune `GRAVITY_PROJ`/initial `vy` per
  weapon).
- **Hit test:** 3D distance (including `|Δy|`) `< HIT_R`.
- Dies when `y <= surfaceHeight(map, x, z)` (hits the ground/mesa) in addition
  to the existing life/out-of-bounds rules.
- **Mines** rest on the surface: `y = surfaceHeight` at their (x, z); trigger
  test includes `y`.

### 4. Netcode / snapshot — `karts.js`

- Kart snapshot entry adds `y` (rounded), `vy` (rounded), `g` (grounded bool).
- Projectile snapshot entry adds `y` (rounded).
- Reconciliation (`Karts.jsx` `onSnap`): set local predicted `y`, `vy`,
  `grounded` from the authoritative kart, then replay unacked inputs through
  the same `integrateKart` — identical result on both sides.
- Projectiles are not predicted; rendered directly from snapshot at their `y`.

### 5. Rendering — `scene.js` + `Karts.jsx`

- `buildArena`: render `wedge` ramps as extruded sloped geometry and box
  mesas at their `top` height (sides + drivable cap). Hazards/boosts/cylinders
  unchanged.
- Karts render at `y`; apply cosmetic `pitch`/`roll` derived from the local
  surface gradient (sample `surfaceHeight` around the kart) — purely visual.
- Camera follows the kart's `y` (height-aware follow).
- Projectiles render at their snapshot `y`.

### 6. Maps — `kartMaps.js`

- **Open Arena:** add a central mesa with access ramps.
- **Pillars:** add a ring/approach ramp.
- **Gauntlet:** convert its raised boxes into climbable mesas (with ramps).
- **New map (e.g. "Launchpad"):** a central launch ramp plus a gap to clear by
  jumping — the elevation showcase.
- Re-validate spawns/pads: no spawn or crate pad inside an obstacle footprint;
  spawns start at the correct `surfaceHeight` (likely ground, `y = 0`).
- Update Phase-1 map tests affected by the retrofit.

## Data flow

```
client input (seq, throttle, steer, fire)
  → server input queue (rooms.js, unchanged)
  → step(): drain queue, integrateKart(k, cmd, SIM_DT, map)  [now updates y/vy/grounded]
  → hazards / weapons / 3D projectiles on wall-clock `now`
  → snapshot {karts:[{x,z,h,v,y,vy,g,seq,...}], proj:[{x,z,y,h,...}], ...}
  → client onSnap: reconcile local y/vy/grounded + replay unacked via integrateKart
  → render karts at y (+ tilt), projectiles at y, camera follows height
```

## Error handling / edge cases

- **Out of bounds:** perimeter clamp is height-independent — a kart can never
  leave the arena via the air.
- **Landing on a mesa edge:** `surfaceHeight` is the max over footprints, so
  landing partly over a mesa snaps to the mesa top; driving off the edge drops
  `grounded` and gravity takes over next step.
- **Overlapping primitives:** highest surface wins (defined by the `max` rule).
- **Determinism:** every new sim field (`y`, `vy`, `grounded`) and the new
  `surfaceHeight`/launch logic live only in the shared, byte-identical
  `kartPhysics.js`; the parity test guards both copies.
- **Backward compatibility:** flat maps keep `y = 0` throughout (no ramps to
  launch from, boxes default `top = 3` and the kart never reaches it), so
  Phase-1 feel and tests are preserved.

## Testing

Server `node --test` suite, extending the existing files:

- **Parity** (extend): `kartPhysics.js` and `kartMaps.js` client/server copies
  remain byte-identical.
- **surfaceHeight:** mesa top, wedge linear interpolation, overlap = max,
  default 0 off all primitives, cylinder contributes nothing.
- **Launch:** fast ascent up a wedge → airborne with `vy > 0`; slow ascent →
  stays glued; flat ground → never launches.
- **Gravity + landing:** an airborne kart falls and lands exactly at
  `surfaceHeight`, `vy` resets, `grounded` true.
- **Air control:** heading changes in air; throttle/drag do not affect `vel`
  in air.
- **Height-gated box collision:** below `top` → push-out (wall); at/above
  `top` → drive on the mesa, no push-out.
- **Reconciliation/replay:** predict + reconcile with elevation produces
  `y`/`vy`/`grounded` identical to authoritative.
- **3D projectiles:** arc (y changes over flight), ground hit (dies at
  surface), vertical gate (miss when target far above/below, hit when aligned).
- **Maps:** retrofit + new map valid — spawns/pads not inside obstacles;
  `listMaps()` includes the new map.

## Out of scope (deferred)

- Projectile-vs-obstacle horizontal collision (projectiles still pass through
  walls horizontally; carried over from Phase 1's deferred list).
- Fall damage.
- Moving/animated platforms.
- Curved or non-axis-aligned ramps (wedges are axis-aligned linear slopes).

## Build order (for the plan)

1. Shared core: `surfaceHeight` + `box.top`/`wedge` data + integrator
   `y`/`vy`/`grounded` + launch (with parity + unit tests).
2. Netcode: snapshot fields + reconciliation/replay.
3. 3D projectiles (server).
4. Rendering: ramps/mesas, kart `y`/tilt, camera, projectile `y`.
5. Map authoring: retrofit three + new showcase map.
