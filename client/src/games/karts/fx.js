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
