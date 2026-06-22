# Smash Karts Visual Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the Smash Karts 3D client to a premium neon-arcade look (bloom, refined karts, arena dressing, particle FX) with no external assets and no netcode/audio changes.

**Architecture:** Extract the growing visual code out of `client/src/games/Karts.jsx` into three focused modules under `client/src/games/karts/` — `scene.js` (renderer + tone mapping + bloom + arena), `kartModel.js` (kart mesh + per-frame updates), `fx.js` (bounded pooled particle system). `Karts.jsx` keeps React/socket/interpolation/input/HUD and drives the new modules from its render loop.

**Tech Stack:** React, Three.js (already a dependency), `three/examples/jsm` postprocessing (EffectComposer, RenderPass, UnrealBloomPass).

## Global Constraints

- **Client-only.** Do NOT modify anything under `server/`. The combat sim is untouched, so combat behavior cannot regress.
- **Asset-free.** No external textures, glTF models, or audio files. All visuals procedural.
- **No netcode changes.** Snapshot format and socket events stay exactly as-is.
- **Bloom must degrade gracefully** — if `EffectComposer`/bloom construction throws (old GPU), fall back to plain `renderer.render()`.
- **Particle system is bounded** — a hard max live-particle budget; emitters drop new particles when full rather than allocating.
- **Dispose everything** — every new geometry/material/render target is released in cleanup.
- **Test cycle (adapted for 3D):** each task ends with `npm run build` clean (run from `client/`; the Three.js chunk-size warning is expected and accepted — lazy-load is the next sub-project) + a manual playtest checklist. There are no unit tests for rendering.
- Run build from the `client/` directory: `cd client && npm run build`.

---

### Task 1: Scene module — tone mapping, bloom, arena dressing

**Files:**
- Create: `client/src/games/karts/scene.js`
- Modify: `client/src/games/Karts.jsx` (replace inline renderer/scene/lights/arena setup + render call + part of cleanup)

**Interfaces:**
- Produces: `createScene(mount, arena)` → `{ scene, camera, renderer, composer, resize(w,h), render(), dispose() }`.
  - `arena` is `{ w, d }`.
  - `render()` uses the bloom composer when available, else `renderer.render(scene, camera)`.
  - `resize(w,h)` updates renderer, composer, and camera aspect.
  - `dispose()` releases renderer, composer, removes the canvas, and disposes all scene geometries/materials.

- [ ] **Step 1: Create `client/src/games/karts/scene.js`**

```js
// Smash Karts — scene/renderer setup: tone mapping, bloom postprocessing,
// lights, and the arena (ground, glowing seams, neon-trimmed walls, backdrop).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

function makeBackdrop() {
  // Vertical gradient so the arena reads as a place, not a void.
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1a1430');
  grad.addColorStop(0.55, '#0d0a1c');
  grad.addColorStop(1, '#050409');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildArena(scene, arena) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.w, arena.d),
    new THREE.MeshStandardMaterial({ color: '#0e1020', roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Glowing floor seams instead of a plain grid.
  const seams = new THREE.GridHelper(arena.w, arena.w / 8, '#3aa0ff', '#1c2452');
  seams.material.transparent = true;
  seams.material.opacity = 0.5;
  seams.position.y = 0.02;
  scene.add(seams);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#201b40', emissive: '#140f33', roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#5cc8ff', emissive: '#5cc8ff', emissiveIntensity: 1.8 });
  const wallH = 3, tk = 1.5;
  for (const [w, h, d, x, y, z] of [
    [arena.w + tk, wallH, tk, 0, wallH / 2, -arena.d / 2],
    [arena.w + tk, wallH, tk, 0, wallH / 2, arena.d / 2],
    [tk, wallH, arena.d + tk, -arena.w / 2, wallH / 2, 0],
    [tk, wallH, arena.d + tk, arena.w / 2, wallH / 2, 0],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, y, z);
    scene.add(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), trimMat);
    trim.position.set(x, h + 0.1, z);
    scene.add(trim);
  }

  // Corner hazard accents.
  const hazMat = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ffae00', emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3.4, 8), hazMat);
    post.position.set(sx * (arena.w / 2 - 1), 1.7, sz * (arena.d / 2 - 1));
    scene.add(post);
  }
}

export function createScene(mount, arena) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

  const scene = new THREE.Scene();
  scene.background = makeBackdrop();
  scene.fog = new THREE.Fog('#0a0813', 80, 190);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  camera.position.set(0, 16, 28);

  scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1626', 0.8));
  const dir = new THREE.DirectionalLight('#ffffff', 1.0);
  dir.position.set(30, 50, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  Object.assign(dir.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 });
  scene.add(dir);
  const p1 = new THREE.PointLight('#5cc8ff', 0.5, 140); p1.position.set(-30, 18, -30); scene.add(p1);
  const p2 = new THREE.PointLight('#ff5d6c', 0.5, 140); p2.position.set(30, 18, 30); scene.add(p2);

  buildArena(scene, arena);

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

  const resize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const render = () => {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  };

  const dispose = () => {
    composer?.dispose?.();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  };

  return { scene, camera, renderer, composer, resize, render, dispose };
}
```

- [ ] **Step 2: Wire `createScene` into `Karts.jsx`**

In `client/src/games/Karts.jsx`, add the import near the top (after the THREE import):

```js
import { createScene } from './karts/scene.js';
```

Replace the inline setup block — everything from `const renderer = new THREE.WebGLRenderer(...)` through the end of the wall-building `for` loop (the original lines that create renderer, scene, camera, lights, ground, grid, and walls) — with:

```js
    const arena = cfg.arena || { w: 80, d: 80 };
    const { scene, camera, renderer, resize: resizeView, render, dispose: disposeView } = createScene(mount, arena);
```

(Keep the existing `const cfg = room.state || {};`, `const colors = ...`, `const playerCount = ...`, `const names = ...`, `const roomId = ...` lines. Remove the now-duplicate `const arena = ...` line if it already exists above so it's declared once.)

- [ ] **Step 3: Use the module's resize and render**

In the `resize` function inside the effect, replace its body with a call into the view:

```js
    const resize = () => {
      const r = mount.getBoundingClientRect();
      resizeView(r.width, r.height);
    };
    resize();
    window.addEventListener('resize', resize);
```

In the render loop, replace `renderer.render(scene, camera);` with:

```js
      render();
```

- [ ] **Step 4: Use the module's dispose in cleanup**

In the cleanup `return () => { ... }`, remove the lines that did `renderer.dispose()`, removed the canvas, and traversed the scene disposing geometries/materials, and replace them with:

```js
      disposeView();
```

(Keep all the other cleanup: cancelAnimationFrame, clearInterval x2, removeEventListener x4, socket.off.)

- [ ] **Step 5: Build**

Run: `cd client && npm run build`
Expected: build succeeds. A `(!) Some chunks are larger than 500 kB` warning is expected and accepted.

- [ ] **Step 6: Manual verify**

Start a 2+ player Smash Karts match. Expected: arena renders with a gradient backdrop, glowing blue wall trim, yellow corner posts, and visible bloom glow on emissive surfaces; karts/crates/projectiles still appear and move; resizing the window keeps the view correct; leaving the game throws no console errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/games/karts/scene.js client/src/games/Karts.jsx
git commit -m "Smash Karts: extract scene module + bloom, tone mapping, arena dressing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Kart model module — refined mesh, spinning wheels, banking, damage tint, shield

**Files:**
- Create: `client/src/games/karts/kartModel.js`
- Modify: `client/src/games/Karts.jsx` (replace inline `makeKart`; add per-kart prev-state; call `updateKart` in the loop)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (independent module).
- Produces:
  - `makeKart(color)` → THREE.Group with `userData = { wheels, shield, bodyMat, baseColor, body }`.
  - `updateKart(group, { speed, turn, hp, shield, now })` → spins wheels by `speed`, banks `body` by `turn`, tints `bodyMat.emissive` toward red below 30 HP, toggles/pulses `shield`.

- [ ] **Step 1: Create `client/src/games/karts/kartModel.js`**

```js
// Smash Karts — kart mesh + per-frame visual updates (wheels, bank, damage, shield).
import * as THREE from 'three';

export function makeKart(color) {
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color, metalness: 0.4, roughness: 0.45, emissive: color, emissiveIntensity: 0.15,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 3.4), bodyMat);
  body.position.y = 0.8; body.castShadow = true;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), bodyMat);
  hood.position.set(0, 0.45, 0.2); body.add(hood);
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.3),
    new THREE.MeshStandardMaterial({ color: '#15131f', roughness: 0.3, metalness: 0.2 }));
  cabin.position.set(0, 1.7, -0.3); g.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5),
    new THREE.MeshStandardMaterial({ color: '#15131f' }));
  spoiler.position.set(0, 1.55, -1.7); g.add(spoiler);
  for (const sx of [-0.9, 0.9]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12),
      new THREE.MeshStandardMaterial({ color: '#15131f' }));
    strut.position.set(sx, 1.35, -1.7); g.add(strut);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#0d0d14', roughness: 0.8 });
  const wheels = [];
  for (const [wx, wz] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.1], [1.2, -1.1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.6, wz);
    g.add(wheel); wheels.push(wheel);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.6 }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.9, 1.9); g.add(nose);

  // Colored underglow disc.
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.0, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow);

  // Fresnel-ish faceted shield bubble.
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({ color: '#22e0ff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  shield.position.y = 1; shield.visible = false; g.add(shield);

  g.userData = { wheels, shield, bodyMat, baseColor: new THREE.Color(color), body };
  return g;
}

const RED = new THREE.Color('#ff2a2a');

export function updateKart(group, { speed, turn, hp, shield, now }) {
  const ud = group.userData;
  for (const w of ud.wheels) w.rotation.x += speed * 0.4;
  const targetBank = THREE.MathUtils.clamp(-turn * 6, -0.18, 0.18);
  ud.body.rotation.z += (targetBank - ud.body.rotation.z) * 0.15;
  const dmg = hp < 30 ? (30 - Math.max(0, hp)) / 30 : 0;
  ud.bodyMat.emissive.copy(ud.baseColor).lerp(RED, dmg);
  ud.bodyMat.emissiveIntensity = 0.15 + dmg * 0.7;
  ud.shield.visible = !!shield;
  if (shield) {
    ud.shield.material.opacity = 0.18 + Math.sin(now / 120) * 0.08;
    ud.shield.rotation.y += 0.02;
  }
}
```

- [ ] **Step 2: Import the module and remove the inline `makeKart`**

In `client/src/games/Karts.jsx`, add:

```js
import { makeKart, updateKart } from './karts/kartModel.js';
```

Delete the entire inline `const makeKart = (color) => { ... };` function (the version that built body/cabin/wheels/nose/shield and set `g.userData.shield`).

- [ ] **Step 3: Add per-kart previous-state tracking**

Right after the `karts` array is built (the `for` loop that pushes `makeKart(...)` groups), add:

```js
    // Per-kart previous render transform, to derive speed/turn for wheel spin + bank.
    const prevT = karts.map(() => ({ x: 0, z: 0, h: 0, init: false }));
```

- [ ] **Step 4: Call `updateKart` from the render loop**

In the loop, inside `for (const ks of sample) { ... }`, after `g.rotation.y = ks.h;` and the existing `g.userData.shield.visible = ...` line, replace that shield line and add the update call so the block reads:

```js
          g.position.set(ks.x, 0, ks.z);
          g.rotation.y = ks.h;
          // derive speed/turn from the interpolated transform delta
          const pt = prevT[ks.i];
          let speed = 0, turn = 0;
          if (pt.init) {
            speed = Math.hypot(ks.x - pt.x, ks.z - pt.z);
            turn = ((ks.h - pt.h + Math.PI) % (Math.PI * 2)) - Math.PI;
          }
          pt.x = ks.x; pt.z = ks.z; pt.h = ks.h; pt.init = true;
          updateKart(g, { speed, turn, hp: meta?.hp ?? 100, shield: visible && meta?.shield, now: performance.now() });
```

(Remove the old standalone `g.userData.shield.visible = visible && meta?.shield;` line — `updateKart` now owns the shield.)

- [ ] **Step 5: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 6: Manual verify**

In a match: karts show the refined body + spoiler; wheels visibly spin while driving and stop when still; the body leans into turns; taking damage to <30 HP tints the kart red; the shield bubble appears and pulses while a shield is active.

- [ ] **Step 7: Commit**

```bash
git add client/src/games/karts/kartModel.js client/src/games/Karts.jsx
git commit -m "Smash Karts: refined kart model with spinning wheels, banking, damage tint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: FX module — pooled particles, and wire all combat/drive effects

**Files:**
- Create: `client/src/games/karts/fx.js`
- Modify: `client/src/games/Karts.jsx` (create fx; replace `spawnBlast`/`blasts`; add muzzle/spark/smoke/dust hooks; enhance crate + mine visuals)

**Interfaces:**
- Consumes: the `scene` from Task 1.
- Produces: `createFx(scene)` → `fx` with:
  - `fx.spark(x, z, color)` — impact sparks.
  - `fx.smoke(x, y, z)` — rising smoke wisp.
  - `fx.dust(x, z)` — low ground puff behind a kart.
  - `fx.muzzle(x, z, h, color)` — nose flash.
  - `fx.explode(x, z, color)` — debris burst + shockwave ring (replaces `spawnBlast`).
  - `fx.update(dt)` — advance/recycle; call once per frame.
  - `fx.dispose()` — release shared geometries/materials.

- [ ] **Step 1: Create `client/src/games/karts/fx.js`**

```js
// Smash Karts — bounded pooled particle FX (sparks, smoke, dust, muzzle, explosions).
// A fixed pool of small additive meshes is recycled; emissions past the budget are
// dropped rather than allocating. Shockwave rings are a small separate recycled set.
import * as THREE from 'three';

const MAX = 240;

export function createFx(scene) {
  const sparkGeo = new THREE.SphereGeometry(0.18, 6, 6);
  const ringGeo = new THREE.RingGeometry(0.6, 1.0, 24);

  const pool = [];
  const live = [];
  for (let i = 0; i < MAX; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    pool.push(m);
  }
  const rings = [];

  const emit = (x, y, z, o) => {
    const m = pool.pop();
    if (!m) return; // budget reached: drop
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(o.size || 1);
    m.material.color.set(o.color || '#ffffff');
    m.material.opacity = 1;
    live.push({ m, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life, age: 0, grav: o.grav || 0, shrink: o.shrink || 0 });
  };

  const burst = (x, y, z, n, color, spd, life) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      emit(x, y, z, {
        color, size: 0.8 + Math.random() * 0.8, life,
        vx: Math.cos(a) * spd * Math.random(),
        vy: Math.random() * spd,
        vz: Math.sin(a) * spd * Math.random(),
        grav: -9, shrink: 1.2,
      });
    }
  };

  const ring = (x, z, color) => {
    let r = rings.find((q) => !q.m.visible);
    if (!r) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      scene.add(m); r = { m, age: 0, life: 0.5 }; rings.push(r);
    }
    r.m.material.color.set(color); r.m.visible = true; r.m.position.set(x, 0.3, z);
    r.age = 0; r.life = 0.5;
  };

  const update = (dt) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { p.m.visible = false; pool.push(p.m); live.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.m.position.x += p.vx * dt;
      p.m.position.y += p.vy * dt;
      p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy = 0; }
      p.m.material.opacity = 1 - p.age / p.life;
      p.m.scale.setScalar(Math.max(0.01, p.m.scale.x + p.shrink * dt));
    }
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      if (r.age >= r.life) { r.m.visible = false; continue; }
      const k = r.age / r.life;
      r.m.scale.setScalar(1 + k * 8);
      r.m.material.opacity = 1 - k;
    }
  };

  const dispose = () => {
    sparkGeo.dispose(); ringGeo.dispose();
    for (const m of pool) m.material.dispose();
    for (const p of live) p.m.material.dispose();
    for (const r of rings) r.m.material.dispose();
  };

  return {
    spark: (x, z, color) => burst(x, 1.0, z, 8, color || '#fff7b0', 8, 0.4),
    smoke: (x, y, z) => emit(x, y, z, { color: '#6a6a78', size: 1.4, vy: 3, life: 0.6, shrink: -1.5 }),
    dust: (x, z) => emit(x, 0.2, z, { color: '#3a3458', size: 1.2, vy: 1.5, life: 0.5, shrink: -1 }),
    muzzle: (x, z, h, color) => emit(x + Math.sin(h) * 2.2, 1.0, z + Math.cos(h) * 2.2,
      { color: color || '#ffffff', size: 1.6, life: 0.12, shrink: 4 }),
    explode: (x, z, color) => { burst(x, 1.2, z, 24, color || '#ff7a3c', 14, 0.7);
      burst(x, 1.2, z, 10, '#ffd24a', 9, 0.6); ring(x, z, color || '#ff7a3c'); },
    update, dispose,
  };
}
```

- [ ] **Step 2: Import fx and create it; remove the old blast system**

In `client/src/games/Karts.jsx`, add:

```js
import { createFx } from './karts/fx.js';
```

After the `scene` is created (Task 1), add:

```js
    const fx = createFx(scene);
```

Delete the old death-explosion code: the `const blasts = [];` line, the entire `const spawnBlast = (x, z, color) => { ... };` function, and the `// animate blasts` loop block in the render loop (the `for (let i = blasts.length - 1; ...)` that scaled/faded `b.m`).

- [ ] **Step 3: Track projectile lifecycle for muzzle/impact FX**

Where projectiles are diffed in the loop, add muzzle FX on appearance and impact FX on removal. Replace the projectile section so it reads:

```js
        // projectiles (latest snap, no interpolation)
        const seen = new Set();
        for (const p of snap.proj) {
          seen.add(p.id);
          let mesh = projMap.get(p.id);
          if (!mesh) {
            mesh = makeProj(p.type); scene.add(mesh); projMap.set(p.id, mesh);
            if (p.type !== 'mine') fx.muzzle(p.x, p.z, p.h || 0, p.type === 'rocket' ? '#ff7a3c' : '#fff7b0');
          }
          mesh.position.set(p.x, p.type === 'mine' ? 0.4 : 1.2, p.z);
          if (p.type === 'rocket') { mesh.rotation.set(Math.PI / 2, 0, -p.h); fx.smoke(p.x, 1.0, p.z); }
        }
        for (const [id, mesh] of projMap) {
          if (!seen.has(id)) {
            if (mesh.userData.type === 'rocket') fx.explode(mesh.position.x, mesh.position.z, '#ff7a3c');
            else if (mesh.userData.type !== 'mine') fx.spark(mesh.position.x, mesh.position.z, '#fff7b0');
            scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); projMap.delete(id);
          }
        }
```

- [ ] **Step 4: Tag projectile type on the mesh, enhance mine + crate visuals**

In the inline `makeProj` function, set `m.userData.type` so the removal diff knows the type, add a ground warning ring to mines, and return. Replace `makeProj` with:

```js
    const makeProj = (type) => {
      let m;
      if (type === 'mine') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 16),
          new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ff5d6c', emissiveIntensity: 0.9 }));
        const warn = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 20),
          new THREE.MeshBasicMaterial({ color: '#ff5d6c', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.y = -0.18; m.add(warn);
      } else if (type === 'rocket') {
        m = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8),
          new THREE.MeshStandardMaterial({ color: '#ff7a3c', emissive: '#ff7a3c', emissiveIntensity: 1.0 }));
      } else {
        m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
          new THREE.MeshStandardMaterial({ color: '#fff7b0', emissive: '#ffe39a', emissiveIntensity: 1.2 }));
      }
      m.userData.type = type;
      return m;
    };
```

In `ensureCrates`, raise the emissive glow and add a floating pickup ring child. Replace the `while` body so each new crate is:

```js
      while (crateMeshes.length < list.length) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2),
          new THREE.MeshStandardMaterial({ color: '#888', emissive: '#000', emissiveIntensity: 1.0, transparent: true }));
        c.castShadow = true;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.08, 8, 28),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = Math.PI / 2; c.add(ring); c.userData.ring = ring;
        scene.add(c); crateMeshes.push(c);
      }
```

In the crate update loop, tint the ring to match the weapon color by adding inside the `if (c.type) { ... }` block, after the existing emissive copy:

```js
          if (mesh.userData.ring) mesh.userData.ring.material.color.copy(col);
```

- [ ] **Step 5: Death explosion + low-HP smoke via fx**

In the loop where the alive→dead transition is detected, replace the `spawnBlast(...)` call with:

```js
          if (meta && prevAlive[ks.i] && !meta.alive && !meta.gone) fx.explode(ks.x, ks.z, colors[ks.i % colors.length]);
```

Add drive dust + low-HP smoke right after the `updateKart(...)` call from Task 2 (still inside the `for (const ks of sample)` block):

```js
          if (visible && speed > 0.15 && Math.random() < 0.4) fx.dust(ks.x - Math.sin(ks.h) * 1.8, ks.z - Math.cos(ks.h) * 1.8);
          if (visible && (meta?.hp ?? 100) < 30 && Math.random() < 0.25) fx.smoke(ks.x, 1.0, ks.z);
```

- [ ] **Step 6: Advance and dispose fx**

In the render loop, just before `render();`, add:

```js
      fx.update(1 / 60);
```

In cleanup, before `disposeView();`, add:

```js
      fx.dispose();
```

- [ ] **Step 7: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 8: Manual verify**

In a match: firing the MG/rockets shows a nose muzzle flash; rockets leave a smoke trail; projectiles that expire/hit leave sparks (rockets a small explosion); mines show a red ground warning ring; crates glow brighter with a colored floating ring; a kill produces a debris burst + expanding shockwave ring; driving kicks up dust; a kart under 30 HP smokes. Frame rate stays smooth with 4 karts.

- [ ] **Step 9: Commit**

```bash
git add client/src/games/karts/fx.js client/src/games/Karts.jsx
git commit -m "Smash Karts: particle FX — muzzle, sparks, smoke, dust, explosions; crate/mine glow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final integration verification

**Files:**
- Modify: none expected (verification + any small fixes surfaced).

**Interfaces:**
- Consumes: all of the above.
- Produces: a verified, committed visual upgrade.

- [ ] **Step 1: Confirm no server files changed**

Run: `git diff --name-only main -- server/`
Expected: empty output (client-only sub-project; combat sim untouched, so no combat regression).

- [ ] **Step 2: Clean build from scratch**

Run: `cd client && rm -rf dist && npm run build`
Expected: build succeeds; only the accepted chunk-size warning.

- [ ] **Step 3: Full playtest checklist (4 players if possible, else 2)**

Confirm in one session: countdown → play → time-up → standings overlay all render; bloom glow present; karts refined with spinning wheels + banking + damage tint + pulsing shield; muzzle/sparks/smoke/dust/explosion FX all fire; mines show warning ring; crates glow with pickup ring; no console errors on join, play, death/respawn, or leave; leaving mid-match cleanly disposes (no WebGL context warnings).

- [ ] **Step 4: Update project memory**

Update `~/.claude/projects/-home-vishesh-Documents-AI-challenge-2026-projects-Game-platform/memory/playverse-project-overview.md`: note the Smash Karts visual-upgrade sub-project is done (bloom/tone mapping, refined karts, arena dressing, pooled particle FX, split into `games/karts/{scene,kartModel,fx}.js`), and that remaining polish = sound, 4-player perf, client prediction.

- [ ] **Step 5: Commit (only if Step 4 or any fix changed tracked files)**

```bash
git add -A
git commit -m "Smash Karts: finalize visual-upgrade sub-project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Rendering pipeline (tone mapping, bloom, point lights, graceful fallback) → Task 1. ✔
- Karts (refined model, spinning wheels, banking, damage tint, shield) → Task 2. ✔
- Arena (neon trim, hazard accents, glowing seams, gradient backdrop) → Task 1. ✔
- Combat/drive FX (muzzle, rocket trail, mine ring, crate glow, impact sparks, upgraded death explosion, dust) → Task 3. ✔
- File structure (`games/karts/{scene,kartModel,fx}.js`; slimmed `Karts.jsx`) → Tasks 1–3. ✔
- Error handling (bloom fallback, bounded particles, dispose) → Task 1 (fallback/dispose), Task 3 (bounded/dispose). ✔
- Testing/verification (build clean, no server changes, manual checklist, memory update) → Task 4. ✔

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✔

**Type consistency:** `createScene` returns `{ scene, camera, renderer, composer, resize, render, dispose }` (Task 1) — `Karts.jsx` consumes `render`/`resize`/`dispose` (aliased `resizeView`/`disposeView`). `makeKart`/`updateKart` signatures and `userData` keys (`wheels`, `shield`, `bodyMat`, `baseColor`, `body`) match between Task 2's module and its loop usage. `createFx` returns `spark/smoke/dust/muzzle/explode/update/dispose` — all used names exist. `makeProj` sets `userData.type`, read in the removal diff. ✔
