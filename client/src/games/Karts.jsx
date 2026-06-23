// Smash Karts — Three.js client (combat). Server-authoritative: we send inputs
// (throttle/steer/fire) ~30Hz and render from server snapshots. Kart transforms
// are interpolated ~100ms in the past; crates/projectiles/HUD use the latest snap.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSocket } from '../socket.js';
import { createScene } from './karts/scene.js';
import { makeKart, updateKart } from './karts/kartModel.js';
import { createFx } from './karts/fx.js';
import { createAudio } from './karts/audio.js';

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
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);

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
    const fx = createFx(scene);
    const audio = createAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
    audio.engineStart();
    const ENGINE_MAX_SPEED = 0.5; // per-frame interpolated delta at full throttle (tuning)

    // karts (with a shield bubble child)
    const karts = [];
    for (let i = 0; i < playerCount; i++) {
      const k = makeKart(colors[i % colors.length]);
      scene.add(k); karts.push(k);
    }
    // Per-kart previous render transform, to derive speed/turn for wheel spin + bank.
    const prevT = karts.map(() => ({ x: 0, z: 0, h: 0, init: false }));

    // crate meshes (one per pad, recolored/shown by snapshot)
    const crateMeshes = [];
    const ensureCrates = (list) => {
      while (crateMeshes.length < list.length) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2),
          new THREE.MeshStandardMaterial({ color: '#888', emissive: '#000', emissiveIntensity: 1.0, transparent: true }));
        c.castShadow = true;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.08, 8, 28),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = Math.PI / 2; c.add(ring); c.userData.ring = ring;
        scene.add(c); crateMeshes.push(c);
      }
    };

    // projectile pool keyed by id
    const projMap = new Map();
    const makeProj = (type) => {
      let m;
      if (type === 'mine') {
        m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 16),
          new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: '#ff5d6c', emissiveIntensity: 0.9 }));
        const warn = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 20),
          new THREE.MeshBasicMaterial({ color: '#ff5d6c', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.y = -0.18; m.add(warn);
      } else if (type === 'rocket') {
        m = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8),
          new THREE.MeshStandardMaterial({ color: '#ff7a3c', emissive: '#ff7a3c', emissiveIntensity: 1.0 }));
      } else {
        m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
          new THREE.MeshStandardMaterial({ color: '#fff7b0', emissive: '#ffe39a', emissiveIntensity: 1.2 }));
      }
      m.userData.type = type;
      return m;
    };

    const prevAlive = karts.map(() => true);
    let prevCountdown = null;
    let prevPhase = null;
    let prevWeapon = null;
    let prevShield = false;
    let prevHp = 100;
    let prevKills = 0;
    let intensityOn = false;

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
    const kd = (e) => { const k = e.key.toLowerCase(); if (driveKeys.includes(k)) { keys[k] = true; apply(); audio.resume(); e.preventDefault(); } };
    const ku = (e) => { keys[e.key.toLowerCase()] = false; apply(); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const md = () => { keys[' '] = true; apply(); audio.resume(); };
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
        const me = sample.find((k) => k.i === youAreIndex) || sample[0];
        const meX = me ? me.x : null;
        const panFor = (x) => (meX == null ? 0 : Math.max(-1, Math.min(1, (x - meX) / (arena.w / 2))));
        let localSpeed = 0;
        for (const ks of sample) {
          const g = karts[ks.i];
          if (!g) continue;
          const meta = snap.karts.find((k) => k.i === ks.i);
          const visible = meta ? meta.alive && !meta.gone : true;
          g.visible = visible;
          g.position.set(ks.x, 0, ks.z);
          g.rotation.y = ks.h;
          // derive speed/turn from the interpolated transform delta
          const pt = prevT[ks.i];
          let speed = 0, turn = 0;
          if (pt.init) {
            speed = Math.hypot(ks.x - pt.x, ks.z - pt.z);
            turn = ((ks.h - pt.h + Math.PI) % (Math.PI * 2)) - Math.PI;
          }
          pt.x = ks.x; pt.z = ks.z; pt.h = ks.h; pt.init = true;
          if (ks.i === youAreIndex) localSpeed = speed;
          updateKart(g, { speed, turn, hp: meta?.hp ?? 100, shield: visible && meta?.shield, now: performance.now() });
          if (visible && speed > 0.15 && Math.random() < 0.4) fx.dust(ks.x - Math.sin(ks.h) * 1.8, ks.z - Math.cos(ks.h) * 1.8);
          if (visible && (meta?.hp ?? 100) < 30 && Math.random() < 0.25) fx.smoke(ks.x, 1.0, ks.z);
          // death explosion on alive->dead transition
          if (meta && prevAlive[ks.i] && !meta.alive && !meta.gone) { fx.explode(ks.x, ks.z, colors[ks.i % colors.length]); audio.explosion(panFor(ks.x)); }
          if (meta) prevAlive[ks.i] = meta.alive;
        }
        // countdown beeps, GO, and match-end stinger
        if (snap.phase === 'countdown' && snap.countdown !== prevCountdown) {
          if (snap.countdown > 0) audio.countdownBeep();
          prevCountdown = snap.countdown;
        }
        if (snap.phase !== prevPhase) {
          if (prevPhase === 'countdown' && snap.phase === 'playing') audio.go();
          if (snap.phase === 'over') { audio.matchEnd(); audio.musicDuck(true); audio.engineStop(); }
          prevPhase = snap.phase;
        }
        if (!intensityOn && snap.phase === 'playing' && snap.timeLeft <= 10) { audio.musicIntensity(1); intensityOn = true; }
        const meAlive = !!snap.karts.find((k) => k.i === youAreIndex && k.alive && !k.gone);
        audio.engineUpdate(localSpeed / ENGINE_MAX_SPEED, snap.phase === 'playing' && meAlive);
        // local-player feedback sounds
        const meMeta = snap.karts.find((k) => k.i === youAreIndex);
        if (meMeta) {
          if (meMeta.weapon && !prevWeapon) audio.pickup(0);
          prevWeapon = meMeta.weapon;
          if (meMeta.shield && !prevShield) audio.shieldUp(0);
          prevShield = meMeta.shield;
          if (meMeta.hp < prevHp && meMeta.alive) audio.hit();
          prevHp = meMeta.hp;
          if (meMeta.kills > prevKills) audio.kill();
          prevKills = meMeta.kills;
        }
        // camera follows local kart
        if (me) {
          const fxDir = Math.sin(me.h), fz = Math.cos(me.h);
          camTarget.set(me.x - fxDir * 16, 11, me.z - fz * 16);
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
            if (mesh.userData.ring) mesh.userData.ring.material.color.copy(col);
          } else mesh.visible = false;
        });

        // projectiles (latest snap, no interpolation)
        const seen = new Set();
        for (const p of snap.proj) {
          seen.add(p.id);
          let mesh = projMap.get(p.id);
          if (!mesh) {
            mesh = makeProj(p.type); scene.add(mesh); projMap.set(p.id, mesh);
            if (p.type !== 'mine') fx.muzzle(p.x, p.z, p.h || 0, p.type === 'rocket' ? '#ff7a3c' : '#fff7b0');
            if (p.type === 'rocket') audio.rocketLaunch(panFor(p.x));
            else if (p.type === 'mine') audio.mineDrop(panFor(p.x));
            else audio.mgFire(panFor(p.x));
          }
          mesh.position.set(p.x, p.type === 'mine' ? 0.4 : 1.2, p.z);
          if (p.type === 'rocket') { mesh.rotation.set(Math.PI / 2, 0, -p.h); fx.smoke(p.x, 1.0, p.z); }
        }
        for (const [id, mesh] of projMap) {
          if (!seen.has(id)) {
            if (mesh.userData.type === 'rocket') { fx.explode(mesh.position.x, mesh.position.z, '#ff7a3c'); audio.explosion(panFor(mesh.position.x)); }
            else if (mesh.userData.type !== 'mine') fx.spark(mesh.position.x, mesh.position.z, '#fff7b0');
            scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); projMap.delete(id);
          }
        }
      }

      fx.update(1 / 60);
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
      audio.dispose();
      fx.dispose();
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
          <button
            className="kt-mute"
            onClick={() => { const a = audioRef.current; if (!a) return; const m = !a.isMuted(); a.setMuted(m); setMuted(m); }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
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
