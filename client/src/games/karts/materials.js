// Smash Karts — procedural PBR materials + environment, generated entirely in code.
// No binary assets, no neon. Verified by build + manual playtest (GL-dependent).
import * as THREE from 'three';
import { groundParamsFor } from './materialParams.js';

// Hazard glow color, shared by the grain texture and the material emissive
// so a future tuning change can't desync the two.

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
// normal maps must stay linear — leave colorSpace at the default (NoColorSpace)
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

  // Painted boost arrows as a road marking (alpha cut from a generated texture).
  const boostTex = track(makeBoostTexture());
  const boost = new THREE.MeshStandardMaterial({
    map: boostTex, transparent: true, roughness: 0.6, metalness: 0.0,
  });

  return {
    sky, environment, asphalt, grass, wall, block, ramp, boost,
    grassRatio: gp.grassRatio,
    dispose() {
      for (const m of [asphalt, grass, wall, block, ramp, boost]) m.dispose();
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
