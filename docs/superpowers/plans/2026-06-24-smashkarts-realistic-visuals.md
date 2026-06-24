# Smash Karts Realistic Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-game Smash Karts neon-arcade rendering with a semi-realistic, PBR, fully-procedural daylit look (painted karts, asphalt+grass ground, real shadows, environment lighting, no bloom, no neon residue).

**Architecture:** Client-render-only. A new `three`-free `materialParams.js` holds pure, unit-tested parameter/cache logic; a new `materials.js` builds procedural canvas textures + a PMREM environment from those params; `scene.js` and `kartModel.js` are rewritten to draw with the new materials. No physics, server, or map-data changes — geometry is derived from the same `map` object the renderer already reads.

**Tech Stack:** Three.js r0.184 (`MeshStandardMaterial`, `CanvasTexture`, `PMREMGenerator`, `DirectionalLight`, `HemisphereLight`), Vite, `node --test` for the pure helpers.

## Global Constraints

- Original assets only — generate all textures/environment in code; do NOT rip Smash Karts assets.
- Zero new binary files committed.
- No changes to `kartMaps.js`, `kartPhysics.js`, `server/src/games/karts.js`, or `Karts.jsx` logic.
- Preserve render contracts exactly: `createScene(mount, map) -> { scene, camera, renderer, resize, render, dispose }`; `makeKart(color) -> THREE.Group`; `updateKart(group, { speed, turn, hp, shield, now })`.
- The kart `Group` must keep `userData = { wheels, shield, bodyMat, baseColor, body }` so `updateKart` is unchanged.
- Keep the four player color identities: `#ff5d6c` (red), `#5cc8ff` (blue), `#8bd450` (green), `#ffd24a` (yellow).
- Fully realistic in-game look: **no bloom, no neon, no additive-blended glow decals.**
- Target 60 fps at current arena scale; one shadow-casting directional light + one hemisphere fill.
- Any file imported by a `node --test` test must NOT import `three` (the server test runner has no `three`).
- Server suite stays green: `npm test --prefix server` = all passing.

---

### Task 1: Pure material parameters + cache (`materialParams.js`)

**Files:**
- Create: `client/src/games/karts/materialParams.js`
- Test: `server/test/materialParams.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `groundParamsFor(mapId: string) -> { grassRatio: number, asphalt: string, grass: string }`
  - `kartPaintParams(color: string) -> { color: string, metalness: number, roughness: number }`
  - `createCache(producer: (key) => V) -> { get(key): V, has(key): boolean, dispose(): void }`

- [ ] **Step 1: Write the failing test**

Create `server/test/materialParams.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groundParamsFor,
  kartPaintParams,
  createCache,
} from '../../client/src/games/karts/materialParams.js';

test('groundParamsFor returns per-map params for known maps', () => {
  const a = groundParamsFor('arena');
  assert.ok(a.grassRatio >= 0 && a.grassRatio <= 1);
  assert.match(a.asphalt, /^#[0-9a-fA-F]{6}$/);
  assert.match(a.grass, /^#[0-9a-fA-F]{6}$/);
});

test('groundParamsFor falls back to a default for unknown maps', () => {
  const d = groundParamsFor('does-not-exist');
  assert.ok(d.grassRatio >= 0 && d.grassRatio <= 1);
  assert.match(d.asphalt, /^#[0-9a-fA-F]{6}$/);
  assert.match(d.grass, /^#[0-9a-fA-F]{6}$/);
});

test('kartPaintParams keeps the base color and yields a painted-metal range', () => {
  const p = kartPaintParams('#ff5d6c');
  assert.equal(p.color, '#ff5d6c');
  assert.ok(p.metalness > 0 && p.metalness <= 1);
  assert.ok(p.roughness > 0 && p.roughness < 1);
});

test('createCache produces each key once and returns the same instance', () => {
  let calls = 0;
  const cache = createCache((k) => ({ k, n: ++calls }));
  const first = cache.get('a');
  const second = cache.get('a');
  assert.equal(first, second);          // same instance
  assert.equal(calls, 1);               // producer ran once
  cache.get('b');
  assert.equal(calls, 2);
  assert.equal(cache.has('a'), true);
});

test('createCache dispose() calls each value.dispose() and clears the store', () => {
  const disposed = [];
  const cache = createCache((k) => ({ dispose() { disposed.push(k); } }));
  cache.get('x');
  cache.get('y');
  cache.dispose();
  assert.deepEqual(disposed.sort(), ['x', 'y']);
  assert.equal(cache.has('x'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `Cannot find module '.../materialParams.js'`.

- [ ] **Step 3: Write the implementation**

Create `client/src/games/karts/materialParams.js`:

```js
// Pure, GL-free material parameters and a generic disposing cache.
// IMPORTANT: do NOT import three here — this file is imported by node --test,
// whose runner (the server package) has no three dependency.

// Per-map ground composition. The drivable field is asphalt; a grass perimeter
// band and grass aprons frame it. grassRatio biases how wide the grass border is.
const GROUND_PARAMS = {
  arena:     { grassRatio: 0.35, asphalt: '#3b3d42', grass: '#4a6b32' },
  pillars:   { grassRatio: 0.30, asphalt: '#3a3c41', grass: '#496a31' },
  gauntlet:  { grassRatio: 0.20, asphalt: '#37393e', grass: '#456530' },
  launchpad: { grassRatio: 0.25, asphalt: '#3c3e44', grass: '#4c6e34' },
};
const GROUND_DEFAULT = { grassRatio: 0.30, asphalt: '#3b3d42', grass: '#4a6b32' };

export function groundParamsFor(mapId) {
  return GROUND_PARAMS[mapId] || GROUND_DEFAULT;
}

// Painted automotive metal: keep the player's base color, give it a clearcoat-ish
// sheen via moderate metalness and low-ish roughness so the env map reads on it.
export function kartPaintParams(color) {
  return { color, metalness: 0.6, roughness: 0.35 };
}

// Generic memoizing cache. producer(key) -> value; value may expose .dispose().
export function createCache(producer) {
  const store = new Map();
  return {
    get(key) {
      if (!store.has(key)) store.set(key, producer(key));
      return store.get(key);
    },
    has(key) {
      return store.has(key);
    },
    dispose() {
      for (const v of store.values()) {
        if (v && typeof v.dispose === 'function') v.dispose();
      }
      store.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — all `materialParams` tests green, and the existing suite still passes.

- [ ] **Step 5: Commit**

```bash
git add client/src/games/karts/materialParams.js server/test/materialParams.test.js
git commit -m "feat(karts): pure material params + disposing cache"
```

---

### Task 2: Procedural material + environment factory (`materials.js`)

**Files:**
- Create: `client/src/games/karts/materials.js`

**Interfaces:**
- Consumes: `groundParamsFor`, `kartPaintParams`, `createCache` from `./materialParams.js`.
- Produces: `createMaterials(renderer: THREE.WebGLRenderer, map) -> factory` where `factory` is:
  ```
  {
    sky: THREE.Texture,            // equirect gradient sky for scene.background
    environment: THREE.Texture,    // PMREM cubemap for scene.environment (or null on failure)
    asphalt: THREE.MeshStandardMaterial,
    grass: THREE.MeshStandardMaterial,
    wall: THREE.MeshStandardMaterial,
    block: THREE.MeshStandardMaterial,   // obstacles + box mesas + wedge plateaus
    ramp: THREE.MeshStandardMaterial,    // sloped wedges (glossier)
    hazard: THREE.MeshStandardMaterial,  // realistic lava/oil patch, subtle emissive
    boost: THREE.MeshStandardMaterial,   // painted arrow road-marking (alpha)
    grassRatio: number,                  // map's grass-band bias, for scene.js layout
    kartPaint(color: string): THREE.MeshStandardMaterial,  // cached per color
    dispose(): void,
  }
  ```
- This file is GL-dependent and is verified by a clean Vite build + manual playtest, not by `node --test`.

- [ ] **Step 1: Write the implementation**

Create `client/src/games/karts/materials.js`:

```js
// Smash Karts — procedural PBR materials + environment, generated entirely in code.
// No binary assets, no neon. Verified by build + manual playtest (GL-dependent).
import * as THREE from 'three';
import { groundParamsFor, kartPaintParams, createCache } from './materialParams.js';

// --- canvas helpers -------------------------------------------------------

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Speckled tileable albedo: a base fill with random light/dark grains.
function grainTexture(base, grains, size = 256, density = 0.18) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const count = Math.floor(size * size * density);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = grains[(Math.random() * grains.length) | 0];
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    g.fillRect(x, y, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Cheap normal map from the same grain pattern (grayscale -> bluish normals).
function grainNormal(size = 256, density = 0.18) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#8080ff';
  g.fillRect(0, 0, size, size);
  const count = Math.floor(size * size * density);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 110 + ((Math.random() * 90) | 0);
    g.fillStyle = `rgb(${v},${v},255)`;
    g.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// --- sky + environment ----------------------------------------------------

function buildSky() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#5b8fd6'); // zenith
  grad.addColorStop(0.55, '#9cc0e8');
  grad.addColorStop(1.0, '#e6edf2'); // horizon haze
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// --- factory --------------------------------------------------------------

export function createMaterials(renderer, map) {
  const gp = groundParamsFor(map.id);
  const arena = map.arena;

  const disposables = []; // textures + render targets to free on dispose
  const track = (t) => { if (t) disposables.push(t); return t; };

  // Ground textures, tiled to roughly 1 repeat / 16 world units.
  const asphaltTex = track(grainTexture(gp.asphalt, ['#2c2e33', '#54565c'], 256, 0.22));
  const asphaltNrm = track(grainNormal(256, 0.22));
  asphaltTex.repeat.set(arena.w / 16, arena.d / 16);
  asphaltNrm.repeat.set(arena.w / 16, arena.d / 16);

  const grassTex = track(grainTexture(gp.grass, ['#3c5a28', '#5a7e3a', '#33491f'], 256, 0.4));
  grassTex.repeat.set(arena.w / 10, arena.d / 10);

  const sky = track(buildSky());

  // Environment via PMREM with graceful fallback to no reflections.
  let environment = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(sky);
    environment = rt.texture;
    track(rt); // WebGLRenderTarget has .dispose()
    pmrem.dispose();
  } catch (e) {
    console.warn('[karts] environment unavailable, continuing without reflections', e);
    environment = null;
  }

  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTex, normalMap: asphaltNrm, roughness: 0.92, metalness: 0.0,
  });
  const grass = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 1.0, metalness: 0.0,
  });
  const wall = new THREE.MeshStandardMaterial({ color: '#9a9a96', roughness: 0.8, metalness: 0.05 });
  const block = new THREE.MeshStandardMaterial({ color: '#8d8f93', roughness: 0.75, metalness: 0.1 });
  const ramp = new THREE.MeshStandardMaterial({ color: '#7f8186', roughness: 0.5, metalness: 0.2 });

  // Realistic hazard: dark crust + warm cracks, only a subtle emissive cue.
  const hazardTex = track(grainTexture('#1c0e08', ['#7a2a10', '#b5471a', '#e06a22'], 256, 0.12));
  const hazard = new THREE.MeshStandardMaterial({
    map: hazardTex, emissive: '#b5471a', emissiveIntensity: 0.35, roughness: 0.9, metalness: 0.0,
  });

  // Painted boost arrows as a road marking (alpha cut from a generated texture).
  const boostTex = track(makeBoostTexture());
  const boost = new THREE.MeshStandardMaterial({
    map: boostTex, transparent: true, roughness: 0.6, metalness: 0.0,
  });

  const paintCache = createCache((color) => {
    const p = kartPaintParams(color);
    return new THREE.MeshStandardMaterial({
      color: p.color, metalness: p.metalness, roughness: p.roughness,
    });
  });

  return {
    sky, environment, asphalt, grass, wall, block, ramp, hazard, boost,
    grassRatio: gp.grassRatio,
    kartPaint(color) { return paintCache.get(color); },
    dispose() {
      paintCache.dispose();
      for (const m of [asphalt, grass, wall, block, ramp, hazard, boost]) m.dispose();
      for (const t of disposables) t.dispose();
    },
  };
}

function makeBoostTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#f2c200';
  g.lineWidth = 12;
  g.lineCap = 'round';
  for (const yo of [-28, 0, 28]) {
    g.beginPath();
    g.moveTo(28, 84 + yo);
    g.lineTo(64, 44 + yo);
    g.lineTo(100, 84 + yo);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build --prefix client`
Expected: `✓ built in <time>` with no errors (the module imports cleanly and is tree-shaken/bundled).

- [ ] **Step 3: Commit**

```bash
git add client/src/games/karts/materials.js
git commit -m "feat(karts): procedural PBR material + environment factory"
```

---

### Task 3: Realistic scene pipeline + arena (`scene.js`)

**Files:**
- Modify: `client/src/games/karts/scene.js` (full rewrite of `buildArena`, `createScene`; remove `makeBackdrop` and all bloom/composer code)

**Interfaces:**
- Consumes: `createMaterials(renderer, map)` from `./materials.js`.
- Produces: `createScene(mount, map) -> { scene, camera, renderer, resize, render, dispose }` (unchanged signature; no `composer`/`bloom` fields).

**Notes for the implementer:**
- Geometry rules are unchanged from the current file: box obstacles drawn at height `top` (`o.top ?? 3`); cylinders at height 3; ramps where `loY === hiY` are flat plateaus drawn as solid blocks of height `hiY`; ramps where `loY !== hiY` are tilted slabs (angle from rise/run, rotate `-angle` on x for axis `z`, `+angle` on z for axis `x`).
- Ground is layered: a full-arena **grass** plane at `y=0`, an inset **asphalt** field on top at `y=0.01` (inset by a grass perimeter band derived from `grassRatio`), and small **grass aprons** at `y=0.02` around each obstacle/plateau footprint.
- No `GridHelper` seams, no emissive wall trims, no additive glow decals, no point lights, no bloom.

- [ ] **Step 1: Replace the file contents**

Overwrite `client/src/games/karts/scene.js` with:

```js
// Smash Karts — realistic scene/renderer: daylight sun + sky environment,
// PBR ground (asphalt field framed by grass), shadows, no bloom, no neon.
import * as THREE from 'three';
import { createMaterials } from './materials.js';

function footprint(o) {
  // Returns { x, z, w, d } world-space footprint for an obstacle or ramp.
  if (o.kind === 'cyl') return { x: o.x, z: o.z, w: o.r * 2, d: o.r * 2 };
  return { x: o.x, z: o.z, w: o.w, d: o.d };
}

function buildArena(scene, map, mat) {
  const arena = map.arena;

  // Grass base covering the whole arena.
  const grassBase = new THREE.Mesh(new THREE.PlaneGeometry(arena.w, arena.d), mat.grass);
  grassBase.rotation.x = -Math.PI / 2;
  grassBase.receiveShadow = true;
  scene.add(grassBase);

  // Asphalt drivable field, inset by a grass perimeter band sized from grassRatio.
  const inset = Math.min(arena.w, arena.d) * (0.06 + 0.18 * mat.grassRatio);
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(8, arena.w - 2 * inset), Math.max(8, arena.d - 2 * inset)),
    mat.asphalt,
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.01;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  // Grass aprons around obstacle/plateau bases (reads as ground patches).
  const apronMat = mat.grass;
  const addApron = (o) => {
    const f = footprint(o);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(f.w + 4, f.d + 4), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(f.x, 0.02, f.z);
    apron.receiveShadow = true;
    scene.add(apron);
  };

  // Perimeter walls (concrete barriers).
  const wallH = 3, tk = 1.5;
  for (const [w, h, d, x, y, z] of [
    [arena.w + tk, wallH, tk, 0, wallH / 2, -arena.d / 2],
    [arena.w + tk, wallH, tk, 0, wallH / 2, arena.d / 2],
    [tk, wallH, arena.d + tk, -arena.w / 2, wallH / 2, 0],
    [tk, wallH, arena.d + tk, arena.w / 2, wallH / 2, 0],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.wall);
    wall.position.set(x, y, z);
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
  }

  // Obstacles.
  for (const o of map.obstacles || []) {
    addApron(o);
    if (o.kind === 'cyl') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 3, 24), mat.block);
      m.position.set(o.x, 1.5, o.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    } else {
      const top = o.top == null ? 3 : o.top;
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, top, o.d), mat.block);
      m.position.set(o.x, top / 2, o.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Ramps: flat plateaus (loY === hiY) -> solid blocks; sloped -> tilted slabs.
  for (const r of map.ramps || []) {
    addApron(r);
    if (r.loY === r.hiY) {
      const H = r.hiY;
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, H, r.d), mat.block);
      m.position.set(r.x, H / 2, r.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    } else {
      const len = r.axis === 'x' ? r.w : r.d;
      const rise = r.hiY - r.loY;
      const slabLen = Math.hypot(len, rise);
      const angle = Math.atan2(rise, len);
      const geo = new THREE.BoxGeometry(r.axis === 'x' ? slabLen : r.w, 0.4, r.axis === 'z' ? slabLen : r.d);
      const m = new THREE.Mesh(geo, mat.ramp);
      m.position.set(r.x, (r.loY + r.hiY) / 2, r.z);
      if (r.axis === 'z') m.rotation.x = -angle; else m.rotation.z = angle;
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
  }

  // Hazard zones — realistic lava/oil patches (no glow).
  for (const hz of map.hazards || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 32), mat.hazard);
    m.rotation.x = -Math.PI / 2;
    m.position.set(hz.x, 0.04, hz.z);
    scene.add(m);
  }

  // Boost pads — painted arrow road markings.
  for (const b of map.boosts || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(b.r, 32), mat.boost);
    m.rotation.x = -Math.PI / 2;
    m.position.set(b.x, 0.05, b.z);
    scene.add(m);
  }
}

export function createScene(mount, map) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

  const scene = new THREE.Scene();
  const mat = createMaterials(renderer, map);
  scene.background = mat.sky;
  if (mat.environment) scene.environment = mat.environment;
  scene.fog = new THREE.Fog('#dfe7ec', 120, 280); // light horizon haze

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  camera.position.set(0, 16, 28);

  scene.add(new THREE.HemisphereLight('#dff0ff', '#5a5440', 0.7));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  buildArena(scene, map, mat);

  const resize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const render = () => {
    renderer.render(scene, camera);
  };

  const dispose = () => {
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    mat.dispose();
  };

  return { scene, camera, renderer, resize, render, dispose };
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build --prefix client`
Expected: `✓ built in <time>` with no errors. Grep the build output for stale references — there should be no remaining import of `UnrealBloomPass`/`EffectComposer` in this file.

Run: `grep -n "Bloom\|EffectComposer\|composer\|makeBackdrop\|GridHelper" client/src/games/karts/scene.js`
Expected: no matches.

- [ ] **Step 3: Manual smoke check**

Start dev (server `--watch` only; do NOT also run `npm start`): `npm run dev`
Open the karts game, confirm: daylit arena, asphalt field framed by grass, grey concrete walls/obstacles with real shadows, no neon/bloom, hazards look like lava patches, boosts look like painted arrows. Smooth (~60 fps).

- [ ] **Step 4: Commit**

```bash
git add client/src/games/karts/scene.js
git commit -m "feat(karts): realistic daylight scene, PBR arena, remove bloom/neon"
```

---

### Task 4: PBR kart model (`kartModel.js`)

**Files:**
- Modify: `client/src/games/karts/kartModel.js` (rewrite `makeKart`; keep `updateKart` behavior + the `userData` contract)

**Interfaces:**
- Consumes: `kartPaintParams(color)` from `./materialParams.js`.
- Produces: `makeKart(color) -> THREE.Group` with `userData = { wheels, shield, bodyMat, baseColor, body }`; `updateKart(group, { speed, turn, hp, shield, now })` unchanged in behavior.

- [ ] **Step 1: Replace the file contents**

Overwrite `client/src/games/karts/kartModel.js` with:

```js
// Smash Karts — PBR kart mesh + per-frame visual updates.
// Painted-metal body (lit by the scene environment), rubber tires, glass cabin,
// emissive headlights. No neon. updateKart contract preserved.
import * as THREE from 'three';
import { kartPaintParams } from './materialParams.js';

export function makeKart(color) {
  const g = new THREE.Group();

  const p = kartPaintParams(color);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: p.color, metalness: p.metalness, roughness: p.roughness,
    emissive: color, emissiveIntensity: 0.0, // raised only on damage flash
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 3.4), bodyMat);
  body.position.y = 0.8; body.castShadow = true;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), bodyMat);
  hood.position.set(0, 0.45, 0.2); hood.castShadow = true; body.add(hood);
  g.add(body);

  const glassMat = new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.15, metalness: 0.4 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.3), glassMat);
  cabin.position.set(0, 1.7, -0.3); cabin.castShadow = true; g.add(cabin);

  const trimMat = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6, metalness: 0.5 });
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), trimMat);
  spoiler.position.set(0, 1.55, -1.7); spoiler.castShadow = true; g.add(spoiler);
  for (const sx of [-0.9, 0.9]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), trimMat);
    strut.position.set(sx, 1.35, -1.7); g.add(strut);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 20);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#101012', roughness: 0.95, metalness: 0.0 });
  const wheels = [];
  for (const [wx, wz] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.1], [1.2, -1.1]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.6, wz);
    wheel.castShadow = true;
    g.add(wheel); wheels.push(wheel);
  }

  // Emissive headlights (read as lamps, not neon).
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#fff0b0', emissiveIntensity: 1.2 });
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), lampMat);
    lamp.position.set(sx, 0.85, 1.72); g.add(lamp);
  }

  // Faceted shield bubble (unchanged behavior; subtle, not bloomed).
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.18, depthWrite: false }));
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
  ud.bodyMat.emissiveIntensity = dmg * 0.7;
  ud.shield.visible = !!shield;
  if (shield) {
    ud.shield.material.opacity = 0.16 + Math.sin(now / 120) * 0.06;
    ud.shield.rotation.y += 0.02;
  }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build --prefix client`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 3: Manual smoke check**

With `npm run dev` running, confirm karts look like painted vehicles (paint catches the sky/sun, glass cabin, rubber tires, headlights), that the body still banks when turning, flashes red below 30 HP, and shows the shield bubble when shielded.

- [ ] **Step 4: Commit**

```bash
git add client/src/games/karts/kartModel.js
git commit -m "feat(karts): PBR painted kart model, env-lit, no neon"
```

---

## Self-Review

**Spec coverage:**
- Semi-realistic PBR, procedural assets → Tasks 2 (textures + PMREM env), 3 (PBR arena), 4 (PBR karts). ✓
- No map-data/physics/server change → only client `karts/` files touched. ✓
- Ground = asphalt field + grass perimeter band + aprons → Task 3 `buildArena`. ✓
- Bloom fully off → Task 3 removes composer/bloom; grep gate. ✓
- No neon residue (hazards/boosts realistic) → Task 2 `hazard`/`boost` materials, Task 3 decals without additive blending. ✓
- Color identities preserved → `kartPaintParams` keeps base color (Task 1 test asserts it). ✓
- Render contracts preserved → Tasks 3/4 keep signatures + `userData` shape. ✓
- Pure helpers unit-tested without GL → Task 1 (`three`-free file, server test runner). ✓
- Build clean + manual as primary gates → every GL task. ✓
- Dispose frees textures/PMREM/materials → Task 2 `dispose`, Task 3 calls `mat.dispose()`. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete, runnable code. Aesthetic constants (colors, roughness, band widths) are concrete values, tunable by eye during manual checks.

**Type consistency:** `createMaterials(renderer, map)` is produced in Task 2 and consumed in Task 3; `kartPaintParams(color)` produced in Task 1, consumed in Tasks 2 and 4; the factory field names (`asphalt`, `grass`, `wall`, `block`, `ramp`, `hazard`, `boost`, `kartPaint`, `sky`, `environment`, `dispose`) match between Task 2's definition and Task 3's usage; the kart `userData` shape matches between Task 4's `makeKart` and `updateKart`.

**Note for implementer (Task 3):** `map.id` is read by `createMaterials` (Task 2) via `groundParamsFor(map.id)`. This is safe: every map in `kartMaps.js` carries an `id` field (`arena`, `pillars`, `gauntlet`, `launchpad`) and `getMap(id)` returns those objects verbatim, so `map.id` is always present. Unknown ids fall back to `GROUND_DEFAULT`.
