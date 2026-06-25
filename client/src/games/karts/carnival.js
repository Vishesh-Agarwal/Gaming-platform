// Smash Karts — Desert Carnival decorations. Original procedural geometry.
// Client-only (imports three); never imported by a server test.
import * as THREE from 'three';

const RED = '#d23b3b', CREAM = '#f4e4c1', YELLOW = '#f2c14e', BLUE = '#3f8fd0', SAND = '#cdb277';

// A striped cone (carnival roof) from alternating colored angular segments.
function stripedCone(radius, height, segments = 12) {
  const g = new THREE.Group();
  const colors = [RED, CREAM];
  for (let s = 0; s < segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0, radius, height, 1, 1, true, theta, (Math.PI * 2) / segments);
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[s % 2], roughness: 0.7, side: THREE.DoubleSide })));
  }
  return g;
}

export function addCarnivalStructure(scene, o) {
  if (o.kind === 'cyl') {
    if (o.prop === 'ferris') addFerris(scene, o);
    else if (o.prop === 'fountain') addFountain(scene, o);
    else addCarousel(scene, o);
  } else {
    addTent(scene, o);
  }
}

function addTent(scene, o) {
  const h = o.top == null ? 3 : o.top;
  const body = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.d),
    new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85 }));
  body.position.set(o.x, h / 2, o.z); body.castShadow = body.receiveShadow = true; scene.add(body);
  const roof = stripedCone(Math.max(o.w, o.d) * 0.8, 3, 12);
  roof.position.set(o.x, h + 1.5, o.z); roof.castShadow = true; scene.add(roof);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), new THREE.MeshStandardMaterial({ color: RED }));
  flag.position.set(o.x, h + 3.4, o.z); scene.add(flag);
}

function addCarousel(scene, o) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 2.5, 20),
    new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.6 }));
  base.position.set(o.x, 1.25, o.z); base.castShadow = base.receiveShadow = true; scene.add(base);
  const roof = stripedCone(o.r * 1.15, 3.5, 16);
  roof.position.set(o.x, 4.6, o.z); roof.castShadow = true; scene.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 8),
    new THREE.MeshStandardMaterial({ color: '#caa84a', metalness: 0.6, roughness: 0.3 }));
  pole.position.set(o.x, 3, o.z); scene.add(pole);
}

function addFountain(scene, o) {
  for (const [r, y, h] of [[o.r, 0.5, 1], [o.r * 0.6, 1.4, 0.8], [o.r * 0.3, 2.2, 0.6]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 18),
      new THREE.MeshStandardMaterial({ color: SAND, roughness: 0.9 }));
    tier.position.set(o.x, y, o.z); tier.castShadow = tier.receiveShadow = true; scene.add(tier);
  }
}

function addFerris(scene, o) {
  const wheelR = o.r * 2.2, cx = o.x, cy = wheelR + 2, cz = o.z;
  const steel = new THREE.MeshStandardMaterial({ color: '#e8e2d0', metalness: 0.3, roughness: 0.5 });
  for (const sx of [-o.r, o.r]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, cy + 2, 8),
      new THREE.MeshStandardMaterial({ color: '#b8403a', metalness: 0.4, roughness: 0.5 }));
    leg.position.set(cx + sx, (cy + 2) / 2, cz); leg.castShadow = true; scene.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.4, 8, 32), steel);
  ring.position.set(cx, cy, cz); scene.add(ring);
  const cabinColors = [RED, YELLOW, BLUE, CREAM];
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wheelR * 2, 6), steel);
    spoke.position.set(cx, cy, cz); spoke.rotation.z = a; scene.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2),
      new THREE.MeshStandardMaterial({ color: cabinColors[s % 4], roughness: 0.6 }));
    cab.position.set(cx + Math.cos(a) * wheelR, cy + Math.sin(a) * wheelR, cz); cab.castShadow = true; scene.add(cab);
  }
}

export function addCarnivalDecor(scene, decor) {
  for (const d of decor || []) {
    if (d.kind === 'arch') addArch(scene, d);
    else if (d.kind === 'balloons') addBalloons(scene, d);
    else if (d.kind === 'bunting') addBunting(scene, d);
  }
}

function addArch(scene, d) {
  const postMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.6 });
  for (const sx of [-7, 7]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 8, 10), postMat);
    post.position.set(d.x + sx, 4, d.z); post.castShadow = true; scene.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 1.2),
    new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.6 }));
  top.position.set(d.x, 8, d.z); scene.add(top);
}

function addBalloons(scene, d) {
  const colors = [RED, YELLOW, BLUE, '#5cd860'];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.4 }));
    b.position.set(d.x + (i - 2) * 0.8, 5 + Math.sin(i) * 0.6, d.z); b.castShadow = true; scene.add(b);
  }
}

function addBunting(scene, d) {
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = d.x + (d.x2 - d.x) * t, z = d.z + (d.z2 - d.z) * t;
    const sag = Math.sin(t * Math.PI) * 1.2;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4),
      new THREE.MeshStandardMaterial({ color: [RED, CREAM, YELLOW, BLUE][i % 4] }));
    flag.position.set(x, 6 - sag, z); flag.rotation.x = Math.PI; scene.add(flag);
  }
}
