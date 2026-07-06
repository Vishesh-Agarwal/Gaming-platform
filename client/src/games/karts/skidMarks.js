// Skid marks: pooled dark rubber decals dropped under the rear wheels while a
// kart corners hard. Round-robin pool (oldest mark is recycled), each mark
// fades out over its lifetime. Client-render-only.
import * as THREE from 'three';

const POOL = 160;
const LIFE = 6; // seconds a mark stays before it has fully faded
const OPACITY = 0.4;

export function createSkidMarks(scene) {
  const geo = new THREE.PlaneGeometry(0.3, 0.85);
  const group = new THREE.Group();
  scene.add(group);
  const marks = [];
  let next = 0;
  for (let i = 0; i < POOL; i += 1) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#17181a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    mesh.visible = false;
    mesh.userData.t = 0;
    group.add(mesh);
    marks.push(mesh);
  }
  return {
    // Stamp one mark at a wheel contact point, aligned to the kart heading.
    markAt(x, y, z, heading) {
      const mesh = marks[next];
      next = (next + 1) % POOL;
      mesh.position.set(x, y + 0.04, z);
      mesh.rotation.set(-Math.PI / 2, 0, -heading);
      mesh.userData.t = LIFE;
      mesh.material.opacity = OPACITY;
      mesh.visible = true;
    },
    update(dt) {
      for (const mesh of marks) {
        if (!mesh.visible) continue;
        mesh.userData.t -= dt;
        if (mesh.userData.t <= 0) {
          mesh.visible = false;
          continue;
        }
        mesh.material.opacity = OPACITY * Math.min(1, mesh.userData.t / LIFE);
      }
    },
    dispose() {
      scene.remove(group);
      geo.dispose();
      for (const mesh of marks) mesh.material.dispose();
    },
  };
}
