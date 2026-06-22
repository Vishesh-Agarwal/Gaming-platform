// Smash Karts — Three.js client (combat). Server-authoritative: we send inputs
// (throttle/steer/fire) ~30Hz and render from server snapshots. Kart transforms
// are interpolated ~100ms in the past; crates/projectiles/HUD use the latest snap.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSocket } from '../socket.js';
import { createScene } from './karts/scene.js';

const INTERP_MS = 100;
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a'];
const WEAPON_COLOR = { mg: '#22e0ff', rocket: '#ff7a3c', mine: '#ffd24a', shield: '#8bd450' };
const WEAPON_LABEL = { mg: 'Machine gun', rocket: 'Rockets', mine: 'Mines', shield: 'Shield' };

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
  const [hud, setHud] = useState({ phase: 'countdown', countdown: 3, timeLeft: 90, players: [], me: null });

  useEffect(() => {
    const socket = getSocket();
    const mount = mountRef.current;
    const cfg = room.state || {};
    const colors = cfg.colors || COLORS;
    const playerCount = room.players.length;
    const names = room.players.map((p) => p.username);
    const roomId = room.id;

    const arena = cfg.arena || { w: 80, d: 80 };
    const { scene, camera, renderer, resize: resizeView, render, dispose: disposeView } = createScene(mount, arena);

    // karts (with a shield bubble child)
    const makeKart = (color) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 3.4),
        new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }));
      body.position.y = 0.8; body.castShadow = true; g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.5),
        new THREE.MeshStandardMaterial({ color: '#15131f', roughness: 0.4 }));
      cabin.position.set(0, 1.5, -0.2); g.add(cabin);
      const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12);
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#0d0d14' });
      for (const [wx, wz] of [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.1], [1.2, -1.1]]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.6, wz); g.add(wheel);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: '#fff', emissive: color, emissiveIntensity: 0.4 }));
      nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.9, 1.9); g.add(nose);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12),
        new THREE.MeshBasicMaterial({ color: '#22e0ff', transparent: true, opacity: 0.22 }));
      shield.position.y = 1; shield.visible = false; g.add(shield);
      g.userData.shield = shield;
      return g;
    };
    const karts = [];
    for (let i = 0; i < playerCount; i++) {
      const k = makeKart(colors[i % colors.length]);
      scene.add(k); karts.push(k);
    }

    // crate meshes (one per pad, recolored/shown by snapshot)
    const crateMeshes = [];
    const ensureCrates = (list) => {
      while (crateMeshes.length < list.length) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2),
          new THREE.MeshStandardMaterial({ color: '#888', emissive: '#000', emissiveIntensity: 0.6, transparent: true }));
        c.castShadow = true; scene.add(c); crateMeshes.push(c);
      }
    };

    // projectile pool keyed by id
    const projMap = new Map();
    const makeProj = (type) => {
      if (type === 'mine') {
        return new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 16),
          new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ff5d6c', emissiveIntensity: 0.5 }));
      }
      if (type === 'rocket') {
        return new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8),
          new THREE.MeshStandardMaterial({ color: '#ff7a3c', emissive: '#ff7a3c', emissiveIntensity: 0.7 }));
      }
      return new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
        new THREE.MeshStandardMaterial({ color: '#fff7b0', emissive: '#ffe39a', emissiveIntensity: 0.9 }));
    };

    // death explosions
    const blasts = [];
    const spawnBlast = (x, z, color) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9 }));
      m.position.set(x, 1.2, z); scene.add(m);
      blasts.push({ m, t: 0 });
    };
    const prevAlive = karts.map(() => true);

    // snapshots
    const buffer = [];
    const latest = { snap: null };
    const onSnap = (snap) => {
      if (!snap?.karts) return;
      buffer.push({ ct: performance.now(), karts: snap.karts });
      if (buffer.length > 10) buffer.shift();
      latest.snap = snap;
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

    // input
    const input = { throttle: 0, steer: 0, fire: false };
    const keys = {};
    const apply = () => {
      input.throttle = ((keys['w'] || keys['arrowup']) ? 1 : 0) + ((keys['s'] || keys['arrowdown']) ? -1 : 0);
      input.steer = ((keys['d'] || keys['arrowright']) ? 1 : 0) + ((keys['a'] || keys['arrowleft']) ? -1 : 0);
      input.fire = !!keys[' '];
    };
    const driveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '];
    const kd = (e) => { const k = e.key.toLowerCase(); if (driveKeys.includes(k)) { keys[k] = true; apply(); e.preventDefault(); } };
    const ku = (e) => { keys[e.key.toLowerCase()] = false; apply(); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const md = () => { keys[' '] = true; apply(); };
    const mu = () => { keys[' '] = false; apply(); };
    renderer.domElement.addEventListener('pointerdown', md);
    window.addEventListener('pointerup', mu);
    const sendTimer = setInterval(() => {
      socket?.emit('game:rt:input', { roomId, input: { throttle: input.throttle, steer: input.steer, fire: input.fire } });
    }, 33);

    // HUD state pushed to React ~6/s
    const hudTimer = setInterval(() => {
      const s = latest.snap;
      if (!s) return;
      setHud({
        phase: s.phase, countdown: s.countdown, timeLeft: s.timeLeft,
        players: s.karts.map((k) => ({ i: k.i, name: names[k.i] || `P${k.i + 1}`, kills: k.kills, hp: k.hp, alive: k.alive, gone: k.gone, color: colors[k.i % colors.length] })),
        me: s.karts.find((k) => k.i === youAreIndex) || null,
      });
    }, 160);

    const resize = () => {
      const r = mount.getBoundingClientRect();
      resizeView(r.width, r.height);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const camTarget = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sample = sampleAt(performance.now() - INTERP_MS);
      const snap = latest.snap;
      if (sample && snap) {
        for (const ks of sample) {
          const g = karts[ks.i];
          if (!g) continue;
          const meta = snap.karts.find((k) => k.i === ks.i);
          const visible = meta ? meta.alive && !meta.gone : true;
          g.visible = visible;
          g.position.set(ks.x, 0, ks.z);
          g.rotation.y = ks.h;
          g.userData.shield.visible = visible && meta?.shield;
          // death explosion on alive->dead transition
          if (meta && prevAlive[ks.i] && !meta.alive && !meta.gone) spawnBlast(ks.x, ks.z, colors[ks.i % colors.length]);
          if (meta) prevAlive[ks.i] = meta.alive;
        }
        // camera follows local kart
        const me = sample.find((k) => k.i === youAreIndex) || sample[0];
        if (me) {
          const fx = Math.sin(me.h), fz = Math.cos(me.h);
          camTarget.set(me.x - fx * 16, 11, me.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(me.x, 1.5, me.z);
        }

        // crates
        ensureCrates(snap.crates);
        snap.crates.forEach((c, i) => {
          const mesh = crateMeshes[i];
          if (!mesh) return;
          if (c.type) {
            mesh.visible = true;
            mesh.position.set(c.x, 1.6 + Math.sin(performance.now() / 300 + i) * 0.25, c.z);
            mesh.rotation.y += 0.03;
            const col = new THREE.Color(WEAPON_COLOR[c.type] || '#fff');
            mesh.material.color.copy(col); mesh.material.emissive.copy(col);
          } else mesh.visible = false;
        });

        // projectiles (latest snap, no interpolation)
        const seen = new Set();
        for (const p of snap.proj) {
          seen.add(p.id);
          let mesh = projMap.get(p.id);
          if (!mesh) { mesh = makeProj(p.type); scene.add(mesh); projMap.set(p.id, mesh); }
          mesh.position.set(p.x, p.type === 'mine' ? 0.4 : 1.2, p.z);
          if (p.type === 'rocket') mesh.rotation.set(Math.PI / 2, 0, -p.h);
        }
        for (const [id, mesh] of projMap) {
          if (!seen.has(id)) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); projMap.delete(id); }
        }
      }

      // animate blasts
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i];
        b.t += 0.06; b.m.scale.setScalar(1 + b.t * 6); b.m.material.opacity = Math.max(0, 0.9 - b.t);
        if (b.t >= 1) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); blasts.splice(i, 1); }
      }

      render();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(sendTimer);
      clearInterval(hudTimer);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('pointerup', mu);
      window.removeEventListener('resize', resize);
      socket?.off('game:rt:snap', onSnap);
      disposeView();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="kt-wrap">
      <div className="kt-stage">
        <div ref={mountRef} className="kt-canvas" />

        {/* HUD overlay */}
        <div className="kt-hud">
          <div className="kt-timer">
            {hud.phase === 'countdown' ? (hud.countdown > 0 ? hud.countdown : 'GO!')
              : hud.phase === 'over' ? "TIME!" : fmtTime(hud.timeLeft)}
          </div>
          <div className="kt-scores">
            {hud.players.map((p) => (
              <div key={p.i} className={`kt-score ${p.gone ? 'gone' : ''}`}>
                <span className="kt-dot" style={{ background: p.color }} />
                <span className="kt-name">{p.i === youAreIndex ? 'You' : p.name}</span>
                <span className="kt-kills">{p.kills}</span>
              </div>
            ))}
          </div>
        </div>

        {hud.me && (
          <div className="kt-myhud">
            <div className="kt-hpbar"><span style={{ width: `${Math.max(0, hud.me.hp)}%` }} /></div>
            <div className="kt-weapon">
              {hud.me.weapon
                ? <><b style={{ color: WEAPON_COLOR[hud.me.weapon] }}>{WEAPON_LABEL[hud.me.weapon]}</b> ×{hud.me.ammo}</>
                : <span className="muted">No weapon — grab a crate</span>}
            </div>
          </div>
        )}
      </div>
      <p className="kt-hint muted">
        <b>W/S</b> drive · <b>A/D</b> steer · <b>Space</b>/click fire. Grab crates for weapons —
        most kills when the clock hits 0 wins.
      </p>
    </div>
  );
}
