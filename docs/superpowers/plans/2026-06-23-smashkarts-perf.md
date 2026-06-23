# Smash Karts Perf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Smash Karts load + runtime cost with low-risk, measurable wins: lazy-load Three.js out of the main bundle, frame-independent particles + fewer per-frame allocations, and half-resolution bloom.

**Architecture:** (A) Move the Karts thumbnail to a three-free module and load the Karts component via `React.lazy` + `<Suspense>` so Three.js becomes a separate chunk. (B) In the Karts render loop, use real delta-time for FX, reuse a scratch `THREE.Color`, hoist the `panFor` closure, and remove the `pointerdown` listener in cleanup. (C) Run the bloom pass at half resolution.

**Tech Stack:** React (`lazy`, `Suspense`), Three.js, Vite (auto code-splits dynamic imports).

## Global Constraints

- **Client-only.** Do NOT modify anything under `server/`. No gameplay/netcode changes.
- **Behavior-preserving** except the intended load/visual-cost changes: the game must look and play the same (bloom still glows; particles same speed at 60 Hz).
- **Lazy boundary:** anything rendering `getGame(id).Component` must be inside a `<Suspense>` boundary (only `Game.jsx` renders it). The lobby uses `thumbnail`, which stays eager and three-free.
- **Test cycle (adapted):** each task ends with `cd client && npm run build` clean. After Task 1 the chunk-size warning behavior CHANGES (see Task 1) — record chunk sizes. Manual playtest for visuals; no rendering unit tests.
- Run build from `client/`.

---

### Task 1: Lazy-load Three.js (extract thumbnail, React.lazy, Suspense)

**Files:**
- Create: `client/src/games/KartsThumb.jsx`
- Modify: `client/src/games/Karts.jsx` (remove the `Thumbnail` export)
- Modify: `client/src/games/registry.js` (lazy Component + thumbnail from new module)
- Modify: `client/src/pages/Game.jsx` (wrap the game component in `<Suspense>`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `KartsThumb.jsx` exports `Thumbnail` (SVG, no `three`); registry's `karts.Component` is a lazy component; `Game.jsx` renders the component inside Suspense.

- [ ] **Step 1: Record the baseline main-chunk size**

Run: `cd client && npm run build && ls -la dist/assets/*.js | awk '{print $5, $9}'`
Expected: a single large JS chunk around **797 KB** (the baseline to beat). Note the number.

- [ ] **Step 2: Create `client/src/games/KartsThumb.jsx`** with the thumbnail moved verbatim out of `Karts.jsx`:

```jsx
// Smash Karts lobby thumbnail — intentionally three-free so the lobby grid never
// pulls Three.js into the main bundle (the Karts component itself is lazy-loaded).
export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="kt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#241a3a" />
          <stop offset="100%" stopColor="#10131f" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#kt-bg)" />
      <polygon points="20,88 100,88 86,58 34,58" fill="#1b2233" stroke="#3a4060" strokeWidth="1.5" />
      <g>
        <rect x="40" y="62" width="20" height="12" rx="3" fill="#ff5d6c" transform="rotate(-8 50 68)" />
        <rect x="68" y="68" width="20" height="12" rx="3" fill="#5cc8ff" transform="rotate(10 78 74)" />
      </g>
      <circle cx="60" cy="30" r="10" fill="#ffd24a" opacity="0.85" />
    </svg>
  );
}
```

- [ ] **Step 3: Remove the `Thumbnail` export from `Karts.jsx`**

In `client/src/games/Karts.jsx`, delete the entire `export function Thumbnail() { ... }` function (the SVG block near the top, lines ~24–42, ending with its closing `}`). Leave everything else (the `three` imports and the default `Karts` component) intact.

- [ ] **Step 4: Update `client/src/games/registry.js`**

Replace the import line:

```js
import Karts, { Thumbnail as KartsThumb } from './Karts.jsx';
```

with:

```js
import { lazy } from 'react';
import { Thumbnail as KartsThumb } from './KartsThumb.jsx';

const Karts = lazy(() => import('./Karts.jsx'));
```

Leave the `karts: { ... Component: Karts, thumbnail: KartsThumb, ... }` entry unchanged — `Component` is now the lazy component.

- [ ] **Step 5: Wrap the game component in `<Suspense>` in `Game.jsx`**

In `client/src/pages/Game.jsx`, update the React import:

```js
import { Suspense, useEffect, useState } from 'react';
```

Replace the single render line:

```jsx
      <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />
```

with:

```jsx
      <Suspense fallback={<div className="game-loading">Loading arena…</div>}>
        <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />
      </Suspense>
```

- [ ] **Step 6: Add a minimal style for the loading fallback**

In `client/src/styles.css`, add near the game-page styles:

```css
.game-loading {
  display: grid;
  place-items: center;
  min-height: 240px;
  color: #9fb4ff;
  font-family: var(--display, sans-serif);
  letter-spacing: 0.04em;
}
```

- [ ] **Step 7: Build and verify the split**

Run: `cd client && npm run build && ls -la dist/assets/*.js | awk '{print $5, $9}'`
Expected: the main `index-*.js` chunk is now much smaller (roughly ~180–250 KB) AND a separate large chunk (~550–650 KB, the Three.js + Karts code) now exists. Record both numbers. The previous single ~797 KB chunk should be gone.

- [ ] **Step 8: Commit**

```bash
git add client/src/games/KartsThumb.jsx client/src/games/Karts.jsx client/src/games/registry.js client/src/pages/Game.jsx client/src/styles.css
git commit -m "Smash Karts: lazy-load Three.js out of the main bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Runtime hygiene — frame-independent FX, cached color, hoisted panFor, listener cleanup

**Files:**
- Modify: `client/src/games/Karts.jsx`

**Interfaces:**
- Consumes: existing `fx` (its `update(dt)` already treats `dt` as seconds), `renderer`, `md`, `arena`.
- Produces: no per-frame heap garbage in the hot path; `fx` advanced by real dt; `pointerdown` listener removed in cleanup.

- [ ] **Step 1: Add effect-scope locals before the render loop**

In `client/src/games/Karts.jsx`, immediately before the `const loop = () => {` line, add:

```js
    // perf: reuse across frames instead of allocating per frame
    const crateCol = new THREE.Color();
    let meX = null;
    const panFor = (x) => (meX == null ? 0 : Math.max(-1, Math.min(1, (x - meX) / (arena.w / 2))));
    let lastT = performance.now();
```

- [ ] **Step 2: Use the hoisted `meX`/`panFor` inside the loop**

Inside the loop, replace these two lines:

```js
        const meX = me ? me.x : null;
        const panFor = (x) => (meX == null ? 0 : Math.max(-1, Math.min(1, (x - meX) / (arena.w / 2))));
```

with (assign the outer `meX`, don't redeclare; `panFor` is already defined above):

```js
        meX = me ? me.x : null;
```

- [ ] **Step 3: Reuse the scratch color for crates**

In the crate update `forEach`, replace these three lines:

```js
            const col = new THREE.Color(WEAPON_COLOR[c.type] || '#fff');
            mesh.material.color.copy(col); mesh.material.emissive.copy(col);
            if (mesh.userData.ring) mesh.userData.ring.material.color.copy(col);
```

with:

```js
            crateCol.set(WEAPON_COLOR[c.type] || '#fff');
            mesh.material.color.copy(crateCol); mesh.material.emissive.copy(crateCol);
            if (mesh.userData.ring) mesh.userData.ring.material.color.copy(crateCol);
```

- [ ] **Step 4: Advance FX by real delta-time**

In the loop, replace:

```js
      fx.update(1 / 60);
```

with:

```js
      const nowT = performance.now();
      const dt = Math.min(0.05, (nowT - lastT) / 1000); // clamp so a tab stall doesn't fast-forward
      lastT = nowT;
      fx.update(dt);
```

- [ ] **Step 5: Remove the `pointerdown` listener in cleanup**

In the cleanup `return () => { ... }`, after `window.removeEventListener('resize', resize);`, add:

```js
      renderer.domElement.removeEventListener('pointerdown', md);
```

- [ ] **Step 6: Build**

Run: `cd client && npm run build`
Expected: build succeeds (the main chunk is small now; the karts chunk carries the warning, which is acceptable).

- [ ] **Step 7: Manual verify**

In a match: visuals unchanged; particles (dust, sparks, explosions) live the same duration as before at 60 Hz and are NOT visibly faster/slower on a high-refresh (120/144 Hz) display; crate colors still match their weapon; pan/audio still correct; no console errors; leaving the match removes the pointerdown listener (no lingering canvas handler).

- [ ] **Step 8: Commit**

```bash
git add client/src/games/Karts.jsx
git commit -m "Smash Karts: frame-independent FX dt, cached color, hoisted panFor, listener cleanup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Half-resolution bloom

**Files:**
- Modify: `client/src/games/karts/scene.js`

**Interfaces:**
- Consumes: existing composer/bloom setup.
- Produces: the bloom pass runs at half the render resolution; resize keeps it half-res.

- [ ] **Step 1: Keep a reference to the bloom pass**

In `client/src/games/karts/scene.js`, replace the bloom-construction block:

```js
  // Bloom postprocessing with graceful fallback.
  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.85));
  } catch (e) {
    console.warn('[karts] bloom unavailable, falling back to direct render', e);
    composer = null;
  }
```

with:

```js
  // Bloom postprocessing with graceful fallback.
  let composer = null;
  let bloom = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.85);
    composer.addPass(bloom);
  } catch (e) {
    console.warn('[karts] bloom unavailable, falling back to direct render', e);
    composer = null;
    bloom = null;
  }
```

- [ ] **Step 2: Set the bloom pass to half-resolution on resize**

In the `resize` function, after `composer?.setSize(w, h);`, add:

```js
    bloom?.setSize(w / 2, h / 2); // run bloom at half-res (~1/4 the pixels) — far cheaper, ~same glow
```

So the function reads:

```js
  const resize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloom?.setSize(w / 2, h / 2); // run bloom at half-res (~1/4 the pixels) — far cheaper, ~same glow
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
```

- [ ] **Step 3: Build**

Run: `cd client && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verify**

In a match: bloom still glows on emissive surfaces (karts, projectiles, trim) and looks essentially the same; no rendering artifacts after a window resize; the no-bloom fallback path (if it ever triggers) still renders.

- [ ] **Step 5: Commit**

```bash
git add client/src/games/karts/scene.js
git commit -m "Smash Karts: run bloom at half resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final integration verification

**Files:**
- Modify: none expected (verification + memory).

- [ ] **Step 1: Confirm no server changes**

Run: `git diff --name-only main -- server/`
Expected: empty.

- [ ] **Step 2: Clean build + record final chunk sizes**

Run: `cd client && rm -rf dist && npm run build && ls -la dist/assets/*.js | awk '{print $5, $9}'`
Expected: main `index-*.js` chunk is much smaller than the 797 KB baseline, with a separate Three.js/Karts chunk. Record the numbers in the report.

- [ ] **Step 3: Full playtest checklist**

Confirm in one session: the lobby loads and shows the Smash Karts card thumbnail without fetching the Three.js chunk (check the Network tab — the big chunk loads only when you enter the match); entering Smash Karts shows "Loading arena…" briefly then the game; bloom glows; particles are frame-rate-independent; crate colors correct; no console errors on enter/play/leave; the other four games (Tic-Tac-Toe, Ghost Rider, Tank Duel, Hangman) still load and play normally.

- [ ] **Step 4: Update project memory**

Update `~/.claude/projects/-home-vishesh-Documents-AI-challenge-2026-projects-Game-platform/memory/playverse-project-overview.md`: note the perf sub-project is done (lazy-loaded Three.js via React.lazy + Suspense with a three-free `KartsThumb.jsx`; frame-independent FX dt; cached crate color; hoisted panFor; pointerdown cleanup; half-res bloom), record the before/after main-chunk sizes, and that the only remaining polish = client prediction.

- [ ] **Step 5: Commit (only if Step 4 or any fix changed tracked files)**

```bash
git add -A
git commit -m "Smash Karts: finalize perf sub-project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- A. Lazy-load (extract thumbnail, React.lazy, Suspense, fallback style) → Task 1. ✔
- B. Frame-independent FX dt → Task 2 Step 4; cached crate color → Step 3; hoisted panFor → Steps 1–2; pointerdown cleanup → Step 5. ✔
- C. Half-res bloom → Task 3. ✔
- Measurable bundle verification → Task 1 Steps 1/7, Task 4 Step 2. ✔
- Client-only / behavior-preserving → Global Constraints; verified Task 4. ✔
- Deferred (instancing, adaptive quality) → not in plan, per spec non-goals. ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code with exact before/after. ✔

**Type consistency:** `KartsThumb.jsx` exports `Thumbnail`; registry imports `{ Thumbnail as KartsThumb }` from it and `{ lazy }` from react; `Karts = lazy(() => import('./Karts.jsx'))` keeps a default export (the `Karts` component still default-exported from `Karts.jsx`). `Game.jsx` imports `Suspense` and wraps `<Component>`. In `Karts.jsx`, `meX` is declared once (outer `let`) and assigned (not redeclared) in the loop; `panFor`/`crateCol`/`lastT` declared once before the loop; `dt` is seconds, matching `fx.update`'s existing per-second math. `bloom` is declared in `scene.js` outer try scope and used in `resize` via optional chaining. ✔
