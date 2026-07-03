// Smash Karts — bounded pooled particle FX (sparks, smoke, dust, muzzle, explosions).
// A fixed pool of small meshes is recycled; emissions past the budget are dropped
// rather than allocating. Daylight look: normal blending (no additive glow) with
// smoke/dust palettes that read under the sun; shockwave rings are a small
// separate recycled set drawn as ground dust.
import * as THREE from 'three';

const MAX = 240;

export function createFx(scene) {
  const sparkGeo = new THREE.SphereGeometry(0.18, 6, 6);
  const ringGeo = new THREE.RingGeometry(0.6, 1.0, 24);

  const pool = [];
  const live = [];
  for (let i = 0; i < MAX; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false,
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
    m.material.opacity = o.fade ?? 1;
    live.push({ m, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life, age: 0, grav: o.grav || 0, shrink: o.shrink || 0, fade: o.fade ?? 1 });
  };

  const burst = (x, y, z, n, color, spd, life, fade = 1) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      emit(x, y, z, {
        color, size: 0.8 + Math.random() * 0.8, life, fade,
        vx: Math.cos(a) * spd * Math.random(),
        vy: Math.random() * spd,
        vz: Math.sin(a) * spd * Math.random(),
        grav: -9, shrink: 1.2,
      });
    }
  };

  // Rising gray smoke plume — the body of a daylight explosion.
  const plume = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      emit(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.6, {
        color: i % 2 ? '#5c5c60' : '#75726c',
        size: 1.6 + Math.random() * 1.2,
        life: 0.9 + Math.random() * 0.4,
        fade: 0.6,
        vy: 3.5 + Math.random() * 2,
        shrink: -2.2,
      });
    }
  };

  const ring = (x, z, color) => {
    let r = rings.find((q) => !q.m.visible);
    if (!r) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, side: THREE.DoubleSide, depthWrite: false,
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
      p.m.material.opacity = p.fade * (1 - p.age / p.life);
      p.m.scale.setScalar(Math.max(0.01, p.m.scale.x + p.shrink * dt));
    }
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      if (r.age >= r.life) { r.m.visible = false; continue; }
      const k = r.age / r.life;
      r.m.scale.setScalar(1 + k * 8);
      r.m.material.opacity = 0.45 * (1 - k);
    }
  };

  const dispose = () => {
    sparkGeo.dispose(); ringGeo.dispose();
    for (const m of pool) m.material.dispose();
    for (const p of live) p.m.material.dispose();
    for (const r of rings) r.m.material.dispose();
  };

  return {
    spark: (x, z, color) => burst(x, 1.0, z, 8, color || '#ffd98a', 8, 0.4),
    smoke: (x, y, z) => emit(x, y, z, { color: '#5c5c60', size: 1.4, vy: 3, life: 0.6, shrink: -1.5, fade: 0.65 }),
    dust: (x, z) => emit(x, 0.2, z, { color: '#a89a84', size: 1.2, vy: 1.5, life: 0.5, shrink: -1, fade: 0.55 }),
    muzzle: (x, z, h, color) => emit(x + Math.sin(h) * 2.2, 1.0, z + Math.cos(h) * 2.2,
      { color: color || '#fff3d0', size: 1.3, life: 0.1, shrink: 3, fade: 0.85 }),
    explode: (x, z, color) => {
      burst(x, 1.2, z, 16, color || '#ff8a3c', 14, 0.5);   // fire core
      burst(x, 1.2, z, 8, '#ffd24a', 9, 0.45);             // embers
      plume(x, 1.6, z, 6);                                  // gray smoke plume
      ring(x, z, '#8f8574');                                // ground dust ring
    },
    update, dispose,
  };
}
