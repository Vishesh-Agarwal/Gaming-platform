# Smash Karts: Kart Collision + Desert Carnival Map + Smart Respawn — Design Spec

**Date:** 2026-06-25
**Status:** Approved
**Scope:** Smash Karts only (`karts`).

## Goal

Three changes:

- **A. Kart-kart collision** — karts no longer pass through each other; they bump (bumper-car recoil + separation).
- **B. Desert Carnival map** — a new ~200×200 map (≈4× current play area) with a sand theme, carnival decorations, and different dynamics (open midway + speed strips + central stage + tent mazes + round landmarks).
- **C. Smart respawn** — after a kill, the victim respawns at the spawn point farthest from the nearest living other kart.

## Constraints (verbatim)

- **No ripped assets.** All geometry is original procedural geometry.
- **`kartMaps.js` parity:** `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` stay byte-identical (`mapsParity.test.js`).
- **Do NOT modify `kartPhysics.js`** (either copy). Collision is resolved in the server sim, outside the shared integrator, so client prediction/parity are unaffected.
- The server test runner has no `three`; no server-imported file may import `three`.
- No hazards (removed in the prior sub-project; do not reintroduce).
- Local dev: run only `npm run dev`.
- Test commands: server `npm test --prefix server`; client `npm run build --prefix client`.

## Part A — Kart-kart collision

**Placement:** a new pairwise pass at the end of the kart loop in `karts.js` `step`, after every kart has been integrated this tick. The shared `integrateKart` stays pure.

**Algorithm (per tick):**
- For each pair `(i, j)`, `i < j`, both `alive` and not `gone`, and at similar height (`Math.abs(yi - yj) < KART_COLLIDE_DY`, default 2) so a kart on the stage doesn't bump one below:
  - `dx = xj - xi`, `dz = zj - zi`, `dist = hypot(dx, dz)`, `min = 2 * KART_R` (KART_R from `PHYS`, = 2.2).
  - If `dist < min` (overlap):
    - **Separate:** push each kart half the penetration along the normal. With `nx = dx/dist`, `nz = dz/dist` (use a deterministic fallback normal `(1,0)` when `dist < 1e-6`), `pen = (min - dist) / 2`: move `i` by `-pen·n` and `j` by `+pen·n`.
    - **Bounce (recoil):** a kart only has scalar `vel` along its `heading`, so a true 2D ricochet isn't representable. Instead, for each of the two karts, if it is driving *into* the other (its heading-velocity vector has a positive component along the contact normal toward the other kart), set `vel = -KART_BOUNCE * vel` (default `KART_BOUNCE = 0.45`), i.e. a damped reversal. A kart not driving into the other keeps its speed. This reads as a bumper-car knock-back.

**New tunables (in `karts.js`):** `KART_BOUNCE = 0.45`, `KART_COLLIDE_DY = 2`.

**Determinism:** the pass iterates pairs in fixed index order; resolution is deterministic. Resolved server-side only; the client reflects it via the existing snapshot + reconciliation path (no client integrator change).

**Edge handling:** a kart knocked over the arena edge or into a wall is corrected by the normal wall/obstacle clamp on its next `integrateKart` step; the collision pass only nudges position by sub-`KART_R` amounts, so no wall tunnelling.

## Part B — Desert Carnival map

### Ground theme (sand)

`materialParams.js` gains a `desert` entry. To make sand read correctly (the current grain palettes are hard-coded green for grass and grey for asphalt), `materials.js` is extended so a ground-params entry may optionally supply grain palettes:

- `GROUND_PARAMS.desert = { grassRatio, asphalt: <packed-sand hex>, grass: <dune-sand hex>, asphaltGrains: [<hex>, <hex>], grassGrains: [<hex>, <hex>, <hex>] }`.
- In `materials.js`, the asphalt/grass `grainTexture(...)` calls use `gp.asphaltGrains` / `gp.grassGrains` when present, else the existing hard-coded defaults. All other maps are unchanged.

### Carnival decorations

A new client-only module `client/src/games/karts/carnival.js` exports a factory that builds original procedural carnival meshes. Two kinds of carnival visuals:

1. **Structures = collidable obstacles.** When `map.theme === 'carnival'`, `scene.js` delegates obstacle rendering to `carnival.js` (themed meshes sized to each obstacle's footprint) instead of the generic concrete block/cylinder:
   - `box` obstacles → **striped tents** (a box body + a striped conical/pyramidal roof) or **ticket booths** (smaller striped boxes), chosen by footprint size.
   - `cyl` obstacles → **round landmarks**: a **Ferris wheel** (upright ring + spokes + cabins), a **carousel** (cylinder + striped conical roof + poles), and a **fountain** (tiered cylinder). The specific landmark per cylinder is selected by an optional `prop` tag on the obstacle (e.g. `{ kind: 'cyl', x, z, r, prop: 'ferris' }`); untagged cylinders fall back to a generic carousel.
2. **Pure decoration = non-colliding.** The map gets an optional `decor` array (server ignores it; only the client reads it). `scene.js` renders these via `carnival.js`: **entrance/banner arches**, **bunting/flag strings**, **balloon clusters**, **light poles**. Placed in safe spots (edges, plaza corners) so they don't block driving.

Ramps, the central stage plateau, and boost pads keep the existing themed-but-generic rendering (sand-colored). Non-carnival maps are completely unaffected — the `theme` branch only triggers for `map.theme === 'carnival'`.

### Layout & dynamics (≈200×200)

Origin centered; `x ∈ [-100, 100]`, `z ∈ [-100, 100]`; north = `z < 0`. A big, fast, open midway — deliberately different from the tight current maps:

- **Central stage**: a flat drive-up plateau (`wedge` with `loY === hiY`, ~height 5) with north and south connector ramps → high ground + jumps.
- **Round landmarks**: Ferris wheel, carousel, and fountain as cylinder obstacles offset from center, to weave around.
- **Tent mazes**: clusters of box obstacles (tents/booths) in the four quadrants, forming winding lanes and cover.
- **Speed strips**: long boost pads along the two midway avenues so the large space stays fast to cross.
- **Spawns**: 8, side-split (4 north `z < 0`, 4 south `z > 0`) so FFA and team modes both work (matches coliseum).
- **Crate pads**: spread across the midway, each validated clear of ramps/obstacles.

Exact coordinates are pinned in the implementation plan.

## Part C — Smart respawn

A new helper in `karts.js`:

```
safeSpawnIndex(sim, selfIdx, map) -> integer
```

Returns the index into `map.spawns` whose location maximizes the distance to the **nearest living other kart** (`alive && !gone && idx !== selfIdx`), considering horizontal `(x, z)` only. Ties break toward the lower spawn index (deterministic). If there are no other living karts, it returns the kart's own `spawnIdx` (current behavior).

The respawn block in `step` (currently `const s = map.spawns[k.spawnIdx];`) uses `map.spawns[safeSpawnIndex(sim, i, map)]` instead. Initial placement in `createSim` is unchanged (still the team side-split `spawnIdx`).

Interpretation: "away from the other player" = away from all other living karts (applies to FFA and teams identically).

## Testing

Server `node --test` (`npm test --prefix server`):

- **Collision:** two overlapping karts are separated to `dist ≥ 2·KART_R` after one `step`; two karts driving head-on into each other both lose forward speed; karts at very different heights (`|Δy| ≥ 2`) do NOT collide.
- **Carnival map:** exists at 200×200 with 8 side-split spawns; central plateau height via `surfaceHeight`; drive-up reachability of the plateau via a connector ramp (simulation test, like `coliseum.test.js`); `mapsParity` passes (both copies identical). The generic pad-placement checks in `maps.test.js` cover crate pads being clear of ramps/obstacles.
- **Smart respawn:** with the victim dead and other karts clustered near one spawn, `safeSpawnIndex` returns a spawn far from them; with no other living karts it returns the kart's own `spawnIdx`; after a real kill + respawn delay, the victim reappears away from the cluster.

Client visuals (`materials.js`, `scene.js`, `carnival.js`) are build-verified (`npm run build --prefix client`); no render-test harness.

## Out of scope

- Full 2D vector kart physics / true elastic ricochet (kart model is scalar-velocity).
- Collision SFX/VFX polish (may add later).
- Animated carnival rides (Ferris wheel/carousel are static meshes).
- Projectile-vs-obstacle horizontal blocking, fall damage, moving platforms.
