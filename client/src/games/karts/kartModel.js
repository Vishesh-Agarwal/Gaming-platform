// Smash Karts — PBR kart mesh + per-frame visual updates.
// Painted-metal body (lit by the scene environment), rubber tires, glass cabin,
// emissive headlights. No neon. updateKart contract preserved.
import * as THREE from 'three';
import { kartPaintParams } from './materialParams.js';

export function makeKart(color, accent = color) {
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

  // Per-player marker: a small roof fin in the player's accent color so
  // teammates sharing a team color stay distinguishable.
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.3, emissive: accent, emissiveIntensity: 0.25 });
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 1.0), accentMat);
  fin.position.set(0, 2.25, -0.3); fin.castShadow = true; g.add(fin);

  // Held-weapon attachments — original procedural geometry; only the active one shows.
  const wMat = new THREE.MeshStandardMaterial({ color: '#2c2f36', roughness: 0.5, metalness: 0.6 });

  const mgW = new THREE.Group();
  const mgBarrel = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10);
  for (const bx of [-0.18, 0.18]) {
    const barrel = new THREE.Mesh(mgBarrel, wMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(bx, 0, 0.7); mgW.add(barrel);
  }
  mgW.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), wMat));
  mgW.position.set(0, 1.5, 0.7); g.add(mgW);

  const rocketW = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12), wMat);
  tube.rotation.x = Math.PI / 2; tube.position.z = 0.4; rocketW.add(tube);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12),
    new THREE.MeshStandardMaterial({ color: '#ff7a3c', roughness: 0.5, metalness: 0.3 }));
  tip.rotation.x = Math.PI / 2; tip.position.z = 1.4; rocketW.add(tip);
  rocketW.position.set(0, 1.55, 0.3); g.add(rocketW);

  const mineW = new THREE.Group();
  const discGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12);
  const discMat = new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.6, metalness: 0.4 });
  for (const [dx, dy] of [[-0.3, 0], [0.3, 0], [0, 0.22]]) {
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.set(dx, dy, 0); mineW.add(disc);
  }
  mineW.position.set(0, 1.5, -1.5); g.add(mineW);

  for (const w of [mgW, rocketW, mineW]) w.visible = false;

  g.userData = { wheels, shield, bodyMat, baseColor: new THREE.Color(color), body, weapons: { mg: mgW, rocket: rocketW, mine: mineW } };
  return g;
}

const RED = new THREE.Color('#ff2a2a');

export function updateKart(group, { speed, turn, hp, shield, weapon, now }) {
  const ud = group.userData;
  if (ud.weapons) {
    ud.weapons.mg.visible = weapon === 'mg';
    ud.weapons.rocket.visible = weapon === 'rocket';
    ud.weapons.mine.visible = weapon === 'mine';
  }
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
