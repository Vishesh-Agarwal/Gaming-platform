// Smash Karts — realistic scene/renderer: daylight sun + sky environment,
// PBR ground (asphalt field framed by grass), shadows, no bloom, no neon.
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { addCarnivalStructure, addCarnivalDecor } from './carnival.js';

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
    if (map.theme === 'carnival') { addCarnivalStructure(scene, o); continue; }
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

  // Boost pads — painted arrow road markings.
  for (const b of map.boosts || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(b.r, 32), mat.boost);
    m.rotation.x = -Math.PI / 2;
    m.position.set(b.x, 0.05, b.z);
    scene.add(m);
  }

  if (map.theme === 'carnival') addCarnivalDecor(scene, map.decor || []);
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
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    mat.dispose();
  };

  return { scene, camera, renderer, resize, render, dispose };
}
