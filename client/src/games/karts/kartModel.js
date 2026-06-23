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
