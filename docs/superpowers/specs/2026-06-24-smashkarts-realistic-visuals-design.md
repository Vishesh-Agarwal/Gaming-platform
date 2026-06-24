# Smash Karts — Realistic Visuals (Sub-project 1) Design

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Sub-project:** 1 of 3 in the Smash Karts visual + combat + team-play initiative
(order: 1. realistic karts + maps → 2. proximity auto-MG → 3. 2v2/4v4 + expanded map).

## Goal

Replace the in-game Smash Karts neon-arcade look with a **semi-realistic, PBR,
material-driven** aesthetic — a real daylit kart circuit with painted karts,
asphalt-and-grass ground, real shadows, and environment lighting — using
**only procedurally generated assets** (no binary texture/HDRI files, no ripped
assets).

## Non-goals

- No gameplay, physics, or networking change. `kartPhysics.js` and
  `server/src/games/karts.js` are untouched.
- **No map-data change.** `kartMaps.js` (both byte-identical copies) is
  untouched — geometry, spawns, ramps, hazards, boosts stay exactly as they are.
  The new look is derived purely from data the renderer already reads.
- No Playverse lobby redesign — the lobby keeps its neon identity. This change
  is scoped to the in-game Karts 3D scene only.
- No HUD redesign.

## Constraints (binding)

- **Original assets only.** Do NOT rip assets/maps from the real Smash Karts
  APK. All textures and the environment are generated in code on a canvas /
  via PMREM.
- **Zero new binary files** committed to the repo.
- **Preserve render contracts** so `Karts.jsx` needs no logic change:
  - `createScene(mount, map)` → `{ scene, camera, renderer, resize, render, dispose }`
  - `makeKart(color)` → `THREE.Group` with the `userData` shape `updateKart` consumes
  - `updateKart(group, { speed, turn, hp, shield, now })` → same visual behaviors
    (wheel spin, body bank, low-HP damage flash, shield bubble)
- Target **60 fps** at the current arena scale; net GPU cost ≈ today's.
- Server test suite (51/51) must remain green (it is untouched).

## Art direction

Semi-realistic PBR: grounded, material-driven realism. HDRI-style environment
light + a warm sun, textured asphalt/grass, painted-metal karts with real
contact shadows, vivid-but-not-neon color palette. **Bloom is fully off** — a
clean realistic frame. Reference vibe: a real daytime kart circuit, not a neon
night arena.

## Architecture / file structure

### New: `client/src/games/karts/materials.js`

A procedural material + texture factory. Responsibilities:

- **Canvas texture generation** for surface families, each producing an
  albedo (+ normal + roughness where it helps) `THREE.CanvasTexture`:
  - `asphalt` — dark, fine speckled grain, mid-high roughness, ~0 metalness.
  - `grass` — green organic noise, high roughness, ~0 metalness.
  - `concrete` / `barrier` — param-driven base color for walls/obstacles/mesas.
- **Environment builder** — `buildEnvironment(renderer)`: render a procedural
  vertical-gradient sky to a texture and run it through `PMREMGenerator` to
  produce the `scene.environment` cubemap (drives ambient + reflections on all
  `MeshStandardMaterial`s) and the matching `scene.background` sky texture.
- **Material getters** that wrap the textures into tuned `MeshStandardMaterial`
  instances, accepting per-map params (tints, roughness, grass/asphalt ratio).
- **Caching:** textures/PMREM generate once per scene and are returned cached;
  expose a `dispose()` that frees every generated texture + the PMREM target.
- **Pure helpers** (no GL): color/param derivation (e.g. resolving a map's
  ground params from its id/dimensions, deriving kart paint params from a base
  color). These are unit-testable without a WebGL context.

### Modify: `client/src/games/karts/scene.js`

- `createScene`: keep ACES tone mapping + shadow map. Build the procedural sky
  + PMREM env from `materials.js`; set `scene.background` to the sky and
  `scene.environment` to the PMREM cubemap. Replace dark fog with a light
  atmospheric haze matching the sky horizon.
- **Lighting:** one shadow-casting `DirectionalLight` (warm white sun) +
  `HemisphereLight` (sky/ground fill). Remove the two colored `PointLight`s.
- **`buildArena`:** redraw all geometry with PBR materials from `materials.js`:
  - **Ground = real circuit, not one flat material:** an asphalt drivable field
    plus a **grass perimeter band** inside the walls, plus **grass aprons**
    around obstacle/mesa bases. Layout is derived from `map.arena` dimensions
    and the `map.obstacles`/`map.ramps` the renderer already iterates. A per-map
    ratio/tint param shifts the grass↔asphalt balance.
  - Walls / obstacles / mesas / ramps: PBR concrete/barrier/metal, cast +
    receive shadows, lit by the env map. Keep the existing geometry rules
    (box mesas at `top`, flat wedge plateaus `loY===hiY` as solid blocks,
    sloped wedges as tilted slabs).
  - Hazards: re-themed molten/red emissive ground ring. Boosts: blue chevron
    ground decal. Both readable in daylight via emissive + additive blending
    (no bloom needed).
- **Remove the bloom pass entirely.** `render()` calls `renderer.render(scene,
  camera)` directly; drop `EffectComposer`/`UnrealBloomPass` imports, the
  composer/bloom fields, and their `resize`/`dispose` handling.
- Extend `dispose` to also dispose the `materials.js` factory (textures + PMREM).

### Modify: `client/src/games/karts/kartModel.js`

- `makeKart(color)`: PBR automotive-paint body (metalness/roughness tuned for a
  clearcoat sheen; lit by env map, not flat emissive), matte rubber tires, dark
  tinted-glass cabin, metal accents, emissive headlights. Keep the group's
  `userData` shape (`{ wheels, shield, bodyMat, baseColor, body }`) so
  `updateKart` is unchanged.
- `updateKart`: behavior unchanged — wheel spin, body bank, low-HP damage flash
  (lerp toward red), shield bubble pulse.

### Kart colors

The four player identities stay the same hex values so the server `COLORS`
array, the client `COLORS`, the HUD, and labels remain in sync:
`#ff5d6c` (red), `#5cc8ff` (blue), `#8bd450` (green), `#ffd24a` (yellow).
They are now rendered as **real paint** rather than neon. Keeping the identities
stable also leaves room for sub-project 3 to remap them to team colors.

## Rendering pipeline summary

1. Procedural sky gradient → `scene.background` + PMREM → `scene.environment`.
2. Sun `DirectionalLight` (shadows) + `HemisphereLight` fill.
3. ACES tone mapping, exposure tuned for daylight.
4. PBR materials everywhere; light haze fog at the horizon.
5. Direct render (no post-processing).

## Performance budget

- Single 1024 shadow map (one directional sun).
- PMREM env generated once at modest resolution, cached.
- Canvas textures generated once on scene create, cached, disposed on teardown.
- Net cost ≈ today: we **add** one env map but **remove** two point lights and
  the entire bloom pass. Target 60 fps at current arena scale.

## Error handling / robustness

- Environment/PMREM build wrapped so a failure falls back to a plain sky color +
  hemisphere light (scene still renders, just without reflections) — mirrors the
  existing graceful-fallback philosophy that bloom had.
- `dispose` must free every generated texture, material, and the PMREM target to
  avoid GPU leaks across game mounts/unmounts.

## Testing

- **Primary gates:** `npm run build` clean; manual browser playtest of each map
  (`arena`, `pillars`, `gauntlet`, `launchpad`) for look + 60 fps. Consistent
  with prior visual tasks (no client render unit harness exists).
- **Unit tests (`node --test`):** the pure, non-GL helpers in `materials.js` —
  color/param derivation and cache behavior (same params → same cached
  instance; `dispose` clears the cache). No WebGL context required.
- Server suite stays green (untouched): 51/51.

## Out-of-scope / future (noted, not built here)

- True per-map authored ground zones (would add an optional visual-only `ground`
  field to `kartMaps.js`) — deferred; current approach derives ground from
  existing data.
- Team color remap and the expanded 4v4 map (sub-project 3).
- Proximity auto-MG combat (sub-project 2).
