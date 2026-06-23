# Smash Karts — 4-Player Perf (Design)

Date: 2026-06-23
Status: Approved
Sub-project 3 of the Smash Karts "polish" track (1: visual ✅; 2: sound ✅; remaining: client prediction).

## Goal

Make Smash Karts cheaper to load and run, with **measurable, low-risk** wins:
- **A. Lazy-load Three.js** so it leaves the main bundle (the headline, objectively measurable win).
- **B. Runtime hygiene** — frame-rate-independent particles, fewer per-frame allocations, listener-cleanup symmetry (these are the carried review findings from the visual + sound sub-projects).
- **C. Cheap render-cost trims** — half-resolution bloom.

Client-only. No netcode/server changes, no gameplay changes.

## Non-goals (YAGNI / deferred)

- **No mesh instancing** for particles/projectiles. Cannot profile in-match FPS in this
  environment; instancing is a larger rewrite for an unmeasured benefit.
- **No adaptive/dynamic quality scaler** (resolution scaling by FPS) — same reason.
- Both become their own *measured* follow-up if a real playtest shows 4-player FPS is bad
  on target hardware.
- No audio changes (the SFX `.disconnect()` minor stays deferred — it's not a measurable
  cost at these rates).

## Current state (baseline)

- `client/src/games/registry.js` statically imports `Karts` AND its `Thumbnail` from
  `Karts.jsx` (line 8). Because `Karts.jsx` imports `three` at the top, **all of Three.js
  is pulled into the single main bundle** (`dist/assets/index-*.js` ≈ **797 KB**). Every
  player downloads it on first load even if they never open Smash Karts.
- `Game.jsx` renders `def.Component` directly (no Suspense).
- Render loop (`Karts.jsx`): `fx.update(1/60)` uses a fixed dt; crate tinting does
  `new THREE.Color(WEAPON_COLOR[c.type])` per active crate per frame; a `panFor` closure
  is allocated per frame (sound sub-project); the `pointerdown` listener on the canvas is
  added but not removed in cleanup.
- `scene.js`: `UnrealBloomPass` runs at full render resolution.

## A. Lazy-load Three.js

**Problem:** a static `import { Thumbnail } from './Karts.jsx'` in the registry forces the
whole module (incl. Three.js) into the main bundle, so `React.lazy` on the component alone
is not enough — the eager `Thumbnail` import would still drag Three.js in.

**Plan:**
1. **Extract the Karts thumbnail** into a new three-free module
   `client/src/games/KartsThumb.jsx` containing only the existing `Thumbnail` SVG export
   (move it verbatim out of `Karts.jsx`; `Karts.jsx` keeps only the default component +
   its `three` imports).
2. **Registry:** import the thumbnail from `./KartsThumb.jsx` (eager, tiny), and set the
   Karts entry's `Component` to `React.lazy(() => import('./Karts.jsx'))`.
   - Other games stay eagerly imported — they're light (canvas/SVG, no Three.js).
3. **Game.jsx:** wrap the rendered `<Component .../>` in `<Suspense fallback={…}>` with a
   small "Loading arena…" placeholder (styled to match the game page). The Suspense
   boundary must wrap only the game component, not the whole page/HUD.

**Verification (measurable):** after `npm run build`, the main `index-*.js` chunk is
substantially smaller and a separate large chunk (Three.js + Karts) exists. Record the
before (≈797 KB) and after main-chunk sizes in the implementation report.

**Edge cases:** `getGame(id).Component` is now a lazy component — anything that references
`def.Component` must render it inside a Suspense boundary. Only `Game.jsx` renders it; the
lobby uses `thumbnail`, which stays eager. The `react` import in `registry.js` must use
`{ lazy }`.

## B. Runtime hygiene

In `client/src/games/Karts.jsx`:
1. **Real delta-time for FX.** Track `let lastT = performance.now();` outside the loop;
   each frame compute `const nowT = performance.now(); const dt = Math.min(0.05, (nowT - lastT) / 1000); lastT = nowT;`
   (clamped so a tab-switch stall doesn't fast-forward particles), and call
   `fx.update(dt)` instead of `fx.update(1/60)`. `dt` is in seconds, matching `fx.js`'s
   existing per-second velocity/life math.
2. **Reuse a scratch Color for crates.** Declare one `const crateCol = new THREE.Color();`
   in the effect; in the crate update loop do `crateCol.set(WEAPON_COLOR[c.type] || '#fff')`
   then `mesh.material.color.copy(crateCol); mesh.material.emissive.copy(crateCol);` and
   `mesh.userData.ring.material.color.copy(crateCol)` — no `new THREE.Color` per frame.
3. **Hoist `panFor`.** Define the pan helper once (it only needs `meX`, which changes per
   frame) — keep `meX` per-frame but make `panFor` a plain function that reads a
   frame-updated `meX` variable, declared once outside the loop, rather than re-creating the
   closure each frame. (If cleaner to leave as-is, at minimum avoid allocating new objects;
   the measurable goal is no per-frame heap garbage in the hot path.)
4. **Remove the `pointerdown` listener in cleanup.** Currently `renderer.domElement
   .addEventListener('pointerdown', md)` has no matching removal. Add
   `renderer.domElement.removeEventListener('pointerdown', md)` to the cleanup return.
   (Not a leak today since the canvas is discarded, but correct symmetry.)

## C. Render-cost trim — half-resolution bloom

In `client/src/games/karts/scene.js`:
- Construct `UnrealBloomPass` with a half-resolution vector and update it on resize so the
  bloom pass processes a quarter of the pixels (≈ same glow, far cheaper):
  - In `createScene`, keep a reference to the bloom pass.
  - On `resize(w, h)`, after `composer.setSize(w, h)`, set the bloom pass resolution to
    `(w/2, h/2)` via `bloom.setSize(w / 2, h / 2)` (UnrealBloomPass exposes `setSize`).
  - Construct the pass with an initial half-res vector too.
- Everything else (tone mapping, fallback, pixel-ratio cap) unchanged. The graceful
  fallback (no composer) path is untouched.

## Error handling / robustness

- Lazy import failure (chunk fails to load): the Suspense fallback covers the loading
  state; a failed dynamic import surfaces as a React error — acceptable for v1 (same
  failure class as any asset load). Keep the fallback message neutral.
- All B/C changes are behavior-preserving; no new failure modes.
- The bloom `setSize` is guarded by the existing `if (composer)` / try-catch path — if
  bloom isn't available, the half-res call is simply not made.

## Testing / verification

Mostly measurable + manual (no unit tests for rendering):
1. **Bundle (measurable, primary):** `cd client && npm run build`; confirm the main chunk
   shrank vs the 797 KB baseline and a separate Three.js/Karts chunk now exists. Record
   both numbers.
2. **Lobby still works:** the Smash Karts card shows its thumbnail without loading Three.js
   (the thumbnail module is three-free).
3. **Manual playtest:** entering Smash Karts shows the "Loading arena…" fallback briefly,
   then the game; visuals look the same (bloom still glows); particles behave the same at
   60 Hz and aren't faster/slower on a high-refresh display; no console errors on
   enter/play/leave; leaving removes all listeners (no pointerdown leak).
4. **Client-only:** `git diff main -- server/` stays empty.

## Known limitations (v1, accepted)

- **Snapshots during the lazy chunk-load window are dropped.** The Karts component
  subscribes to `game:rt:snap` and buffers snapshots inside its mount `useEffect`. With
  lazy-loading, mount is deferred until the ~538 KB chunk downloads, so any snapshots that
  arrive before mount are not buffered. **Accepted for v1** because it is self-healing in
  practice: the match opens with a 3-second countdown, the chunk is cached after first
  load, and rendering runs ~100 ms behind, so a player almost always has the chunk before
  the play phase begins. If this ever bites, the fix is to hoist the snapshot
  buffer/subscription above the lazy boundary (an architectural change, deferred).
- **Lazy chunk-load failures are contained by an error boundary** (added after the
  whole-branch review): a failed `import('./Karts.jsx')` now renders a "Couldn't load this
  game / Back to lobby" panel scoped to the game pane instead of unwinding to the app root.

## Rollout

Feature branch `smashkarts-perf`, subagent-driven, merged to `main`. After this, the only
remaining polish sub-project is **client prediction**.
