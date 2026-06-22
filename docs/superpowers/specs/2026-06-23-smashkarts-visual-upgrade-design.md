# Smash Karts — Visual Upgrade (Design)

Date: 2026-06-23
Status: Approved
Sub-project 1 of the Smash Karts "polish" track (others: sound, 4-player perf, client prediction).

## Goal

Lift the Smash Karts 3D client from flat procedural primitives to a premium
neon-arcade look that matches the rest of Playverse, **without** introducing
external assets (textures/models) or audio. Client-only change.

Chosen approach: **B — Neon-arcade with bloom + pooled particle FX.** Procedural
(asset-free), self-contained, and the perf cost it adds is exactly what the next
sub-project (4-player perf) will tune.

## Non-goals (YAGNI / deferred)

- No external textures or glTF models (that was approach C, rejected).
- No audio — that is the next sub-project.
- No netcode changes (client prediction is a later sub-project).
- Particle counts stay modest; aggressive perf tuning (instancing, pooling
  audits, lazy-load) is the following sub-project. We keep pools small and
  bounded here so we don't paint perf into a corner.

## Current state (baseline)

`client/src/games/Karts.jsx` (~360 lines) builds everything inline:
- Renderer: `WebGLRenderer({antialias})`, shadow map on, no tone mapping, no
  postprocessing.
- Lights: one `HemisphereLight` + one `DirectionalLight` (shadow caster).
- Arena: flat `PlaneGeometry` ground + `GridHelper` + 4 box walls (mild emissive).
- Karts: `makeKart()` group of box body + box cabin + 4 cylinder wheels + cone
  nose + a flat translucent sphere "shield". Wheels never rotate; no banking; no
  damage feedback.
- Crates: box meshes recolored per snapshot, bob + spin.
- Projectiles: pool keyed by id (mg sphere / rocket capsule / mine cylinder);
  vanish instantly on removal (no impact FX).
- Death FX: a single expanding wireframe sphere (`spawnBlast`).
- Render loop: snapshot interpolation (~100ms) for kart transforms; latest snap
  for crates/projectiles/HUD; chase camera; DOM HUD overlay.

## Architecture / file structure

Split the growing visual code out of `Karts.jsx` into focused modules under a new
`client/src/games/karts/` directory. Each module has one clear job and a small
surface so it stays readable and is easy to revisit for the perf/prediction passes.

- `games/karts/scene.js`
  - `createScene(mount, arena)` → `{ scene, camera, renderer, composer, lights, resize() }`.
  - Owns: renderer (ACESFilmic tone mapping, tuned exposure, sRGB output),
    `EffectComposer` + `RenderPass` + `UnrealBloomPass`, hemisphere + directional
    lights + a couple of cheap point lights, arena (ground, glowing floor seams,
    neon wall trim + corner hazard accents, gradient/vignette backdrop), fog.
  - `resize(w,h)` updates renderer, composer, and camera aspect together.
  - Render via `composer.render()` instead of `renderer.render()`.

- `games/karts/kartModel.js`
  - `makeKart(color)` → THREE.Group with refined low-poly body (beveled body,
    cockpit, small spoiler/roll-bar, colored underglow disc), 4 wheels exposed on
    `userData.wheels`, a fresnel-style hex shield bubble on `userData.shield`,
    and emissive body material on `userData.bodyMat` for damage tint.
  - `updateKart(group, { speed, steer, hp, shield, dt })` → spins wheels by speed,
    banks the body slightly into turns, lerps emissive tint toward red below
    ~30 HP, toggles + pulses the shield bubble.

- `games/karts/fx.js`
  - A small bounded particle system. One pooled `THREE.Points` (or small-mesh)
    emitter set; allocations are pre-sized and recycled, never grown unbounded.
  - API:
    - `createFx(scene)` → `fx`
    - `fx.muzzle(x, z, h, color)` — flash sprite + brief point-light at the nose.
    - `fx.spark(x, z, color)` — projectile impact sparks.
    - `fx.smoke(x, y, z)` — rocket trail / low-HP kart wisp.
    - `fx.explode(x, z, color)` — debris shards + shockwave ring + flash light
      (replaces the wireframe-sphere blast).
    - `fx.dust(x, z)` — drive/exhaust puff behind a throttling kart.
    - `fx.update(dt, now)` — advances and recycles all live particles; called once
      per frame.
  - Caps: a hard max live-particle budget; emitters drop new particles when full
    rather than allocating.

- `client/src/games/Karts.jsx` (slimmed)
  - Keeps: React component, socket wiring, snapshot buffer + interpolation, input,
    chase camera, render loop, DOM HUD. Imports the three modules above and calls
    `updateKart` / `fx.*` from the loop.

## Behaviour details

### Bloom / tone mapping
- `renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure ≈ 1.1`,
  `outputColorSpace = SRGBColorSpace`.
- `UnrealBloomPass` conservative defaults: strength ≈ 0.7, radius ≈ 0.4,
  threshold ≈ 0.85 (so only bright/emissive things bloom, not the whole scene).
- Emissive intensities on karts/projectiles/crates/trim tuned up so they read as
  light sources under bloom.

### Karts
- Wheel spin: derive forward speed from the interpolated position delta between
  frames (no new server data); rotate wheels on local X by `speed * k`.
- Bank: rotate body slightly on local Z toward the steer direction, eased.
- Damage: when `hp < 30`, lerp `bodyMat.emissive` toward red and emit occasional
  `fx.smoke` from the chassis.
- Shield: hex/fresnel bubble; visible when `meta.shield`, opacity pulses.

### Arena
- Ground keeps a dark base but gains glowing seam lines (emissive) instead of the
  plain `GridHelper`.
- Walls get an emissive neon top trim; corners get hazard-stripe accents.
- Background: vertical gradient + vignette (via scene background texture or a
  large backdrop) so the arena reads as a place.

### Combat / drive FX hookups (in the render loop)
- On a projectile **appearing** (new id, type rocket/mg): `fx.muzzle` at the
  firing kart's nose; for rockets, emit `fx.smoke` along the trail each frame.
- On a projectile **disappearing** (id removed from snap): `fx.spark` (and for
  rockets a small `fx.explode`) at its last position.
- Mine: pulsing emissive + a ground warning ring (part of the proj mesh build).
- Crate: stronger glow + a floating pickup ring.
- Kart alive→dead transition: `fx.explode` (replaces `spawnBlast`).
- While a kart's throttle is engaged (infer from speed): `fx.dust` behind it,
  throttled to every few frames.

## Error handling / robustness
- If `EffectComposer`/bloom fails to construct (old GPU), fall back to plain
  `renderer.render()` — wrap composer setup so a failure degrades gracefully.
- Particle system never throws on overflow; it drops emissions past the budget.
- All new meshes/materials/render targets are disposed in the existing cleanup
  return (extend the current `useEffect` teardown; `scene.js`/`fx.js` expose
  `dispose()`).

## Testing / verification
- 3D visuals can't be unit-tested meaningfully; verify by:
  1. `npm run build` in `client/` is clean (no new errors; chunk-size warning
     expected and accepted — lazy-load is the perf sub-project).
  2. Manual playtest in browser: arena/karts render with glow; wheels spin while
     driving; firing shows muzzle flash; hits show sparks; kills show the new
     explosion; low HP tints red + smokes; shield bubble pulses; 4 karts still
     run.
- Keep functions small enough to eyeball; no behavioural/server changes so the
  existing combat unit tests remain green (run them once to confirm no regress).

## Rollout
Single PR/commit on `main` (matches the per-sub-project workflow). Commit message
notes it's the visual-upgrade sub-project; remaining polish = sound, 4-player
perf, client prediction.
