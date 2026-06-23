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

function buildArena(scene, map) {
  const arena = map.arena;
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

  // obstacles
  const obMat = new THREE.MeshStandardMaterial({ color: '#2a2450', emissive: '#161033', roughness: 0.6 });
  const obTrim = new THREE.MeshStandardMaterial({ color: '#7cc4ff', emissive: '#7cc4ff', emissiveIntensity: 1.4 });
  for (const o of map.obstacles || []) {
    if (o.kind === 'cyl') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 3, 20), obMat);
      m.position.set(o.x, 1.5, o.z); m.castShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.05, o.r * 1.05, 0.2, 20), obTrim);
      cap.position.set(o.x, 3.1, o.z); scene.add(cap);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, 3, o.d), obMat);
      m.position.set(o.x, 1.5, o.z); m.castShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.2, o.d), obTrim);
      cap.position.set(o.x, 3.1, o.z); scene.add(cap);
    }
  }
  // hazard zones (flat red glow)
  for (const hz of map.hazards || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 28),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(hz.x, 0.04, hz.z); scene.add(m);
  }
  // boost pads (cyan glow)
  for (const b of map.boosts || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(b.r, 28),
      new THREE.MeshBasicMaterial({ color: '#22e0ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(b.x, 0.05, b.z); scene.add(m);
  }
}

export function createScene(mount, map) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

  const scene = new THREE.Scene();
  const backdrop = makeBackdrop();
  scene.background = backdrop;
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

  buildArena(scene, map);

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

  const resize = (w, h) => {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloom?.setSize(w / 2, h / 2); // run bloom at half-res (~1/4 the pixels) — far cheaper, ~same glow
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
    backdrop.dispose();
  };

  return { scene, camera, renderer, composer, resize, render, dispose };
}
