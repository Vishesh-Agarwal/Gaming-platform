// Smash Karts (vertical slice) — Three.js client. Server-authoritative: we send
// inputs (throttle/steer) ~30Hz and render karts from server snapshots, buffered
// and interpolated ~100ms in the past for smoothness. Driving only, no combat.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getSocket } from '../socket.js';

const INTERP_MS = 100;
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a'];

const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="kt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#241a3a" />
          <stop offset="100%" stopColor="#10131f" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#kt-bg)" />
      <polygon points="20,88 100,88 86,58 34,58" fill="#1b2233" stroke="#3a4060" strokeWidth="1.5" />
      <g>
        <rect x="40" y="62" width="20" height="12" rx="3" fill="#ff5d6c" transform="rotate(-8 50 68)" />
        <rect x="68" y="68" width="20" height="12" rx="3" fill="#5cc8ff" transform="rotate(10 78 74)" />
      </g>
      <circle cx="60" cy="30" r="10" fill="#ffd24a" opacity="0.85" />
    </svg>
  );
}

export default function Karts({ room, youAreIndex }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    const mount = mountRef.current;
    const cfg = room.state || {};
    const arena = cfg.arena || { w: 80, d: 80 };
    const colors = cfg.colors || COLORS;
    const playerCount = room.players.length;
    const roomId = room.id;

    // --- renderer / scene / camera ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0813');
    scene.fog = new THREE.Fog('#0a0813', 60, 160);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    camera.position.set(0, 16, 28);

    // --- lights ---
    scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1626', 0.9));
    const dir = new THREE.DirectionalLight('#ffffff', 1.1);
    dir.position.set(30, 50, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -60; dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60; dir.shadow.camera.bottom = -60;
    scene.add(dir);

    // --- arena ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(arena.w, arena.d),
      new THREE.MeshStandardMaterial({ color: '#15182a', roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(arena.w, arena.w / 4, '#3a3460', '#241f3d');
    grid.position.y = 0.02;
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#2a2450', emissive: '#1b1640', roughness: 0.6 });
    const wallH = 3, t = 1.5;
    const walls = [
      [arena.w + t, wallH, t, 0, wallH / 2, -arena.d / 2],
      [arena.w + t, wallH, t, 0, wallH / 2, arena.d / 2],
      [t, wallH, arena.d + t, -arena.w / 2, wallH / 2, 0],
      [t, wallH, arena.d + t, arena.w / 2, wallH / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, y, z);
      scene.add(wall);
    }

    // --- karts ---
    const makeKart = (color) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1, 3.4),
        new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
      );
      body.position.y = 0.8; body.castShadow = true;
      g.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.9, 1.5),
        new THREE.MeshStandardMaterial({ color: '#15131f', roughness: 0.4 })
      );
      cabin.position.set(0, 1.5, -0.2); cabin.castShadow = true;
      g.add(cabin);
      const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12);
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#0d0d14' });
      for (const [wx, wz] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.1], [1.2, -1.1]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.6, wz);
        wheel.castShadow = true;
        g.add(wheel);
      }
      // a little nose marker so facing is readable
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.4 })
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 0.9, 1.9);
      g.add(nose);
      return g;
    };
    const karts = [];
    for (let i = 0; i < playerCount; i++) {
      const k = makeKart(colors[i % colors.length]);
      scene.add(k);
      karts.push(k);
    }

    // --- snapshot buffer + interpolation ---
    const buffer = []; // { ct, karts:[{i,x,z,h}] }
    const onSnap = (snap) => {
      if (!snap?.karts) return;
      buffer.push({ ct: performance.now(), karts: snap.karts });
      if (buffer.length > 10) buffer.shift();
    };
    socket?.on('game:rt:snap', onSnap);

    const sampleAt = (renderT) => {
      if (buffer.length === 0) return null;
      if (buffer.length === 1) return buffer[0].karts;
      let a = buffer[0], b = buffer[buffer.length - 1];
      for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i].ct <= renderT && buffer[i + 1].ct >= renderT) { a = buffer[i]; b = buffer[i + 1]; break; }
      }
      const span = b.ct - a.ct || 1;
      const f = Math.max(0, Math.min(1, (renderT - a.ct) / span));
      return a.karts.map((ka) => {
        const kb = b.karts.find((x) => x.i === ka.i) || ka;
        return { i: ka.i, x: lerp(ka.x, kb.x, f), z: lerp(ka.z, kb.z, f), h: lerpAngle(ka.h, kb.h, f) };
      });
    };

    // --- input ---
    const input = { throttle: 0, steer: 0 };
    const keys = {};
    const applyKeys = () => {
      const up = keys['w'] || keys['arrowup'];
      const down = keys['s'] || keys['arrowdown'];
      const left = keys['a'] || keys['arrowleft'];
      const right = keys['d'] || keys['arrowright'];
      input.throttle = (up ? 1 : 0) + (down ? -1 : 0);
      input.steer = (right ? 1 : 0) + (left ? -1 : 0);
    };
    const kd = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys[k] = true; applyKeys(); e.preventDefault();
      }
    };
    const ku = (e) => { keys[e.key.toLowerCase()] = false; applyKeys(); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const sendTimer = setInterval(() => {
      socket?.emit('game:rt:input', { roomId, input: { throttle: input.throttle, steer: input.steer } });
    }, 33);

    // --- resize ---
    const resize = () => {
      const r = mount.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    // --- render loop ---
    let raf = 0;
    const camTarget = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sample = sampleAt(performance.now() - INTERP_MS);
      if (sample) {
        for (const ks of sample) {
          const g = karts[ks.i];
          if (!g) continue;
          g.position.set(ks.x, 0, ks.z);
          g.rotation.y = ks.h;
        }
        const me = sample.find((k) => k.i === youAreIndex) || sample[0];
        if (me) {
          const fx = Math.sin(me.h), fz = Math.cos(me.h);
          camTarget.set(me.x - fx * 16, 11, me.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(me.x, 1.5, me.z);
        }
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(sendTimer);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', resize);
      socket?.off('game:rt:snap', onSnap);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="kt-wrap">
      <div ref={mountRef} className="kt-canvas" />
      <p className="kt-hint muted">
        <b>W/S</b> or <b>↑/↓</b> drive · <b>A/D</b> or <b>←/→</b> steer. Server-authoritative 3D —
        weapons &amp; more players coming next.
      </p>
    </div>
  );
}
