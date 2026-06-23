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
import { integrateKart, SIM_DT } from './karts/kartPhysics.js';
import { getMap } from './karts/kartMaps.js';

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

    const map = getMap(cfg.mapId);
    const arena = map.arena;
    const { scene, camera, renderer, resize: resizeView, render, dispose: disposeView } = createScene(mount, map);
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
    // client-side prediction of the local kart
    const pred = { x: 0, z: 0, heading: 0, vel: 0, has: false };
    const pending = [];
    const renderLocal = { x: 0, z: 0, h: 0 };
    let renderInit = false;
    let inputSeq = 0;
    const PRED_SMOOTH = 0.35;
    const onSnap = (snap) => {
      if (!snap?.karts) return;
      buffer.push({ ct: performance.now(), karts: snap.karts });
      if (buffer.length > 10) buffer.shift();
      latest.snap = snap;
      // reconcile local prediction against the authoritative state
      const mine = snap.karts.find((k) => k.i === youAreIndex);
      if (mine && mine.alive && !mine.gone) {
        pred.x = mine.x; pred.z = mine.z; pred.heading = mine.h; pred.vel = mine.v || 0;
        const ack = mine.seq || 0;
        while (pending.length && pending[0].seq <= ack) pending.shift();
        for (const p of pending) integrateKart(pred, p, SIM_DT, map);
        pred.has = true;
      } else if (mine) {
        pred.has = false; pending.length = 0; renderInit = false;
      }
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
      inputSeq += 1;
      const cmd = { seq: inputSeq, throttle: input.throttle, steer: input.steer, fire: input.fire };
      if (pred.has) {
        integrateKart(pred, cmd, SIM_DT, map);
        pending.push({ seq: inputSeq, throttle: cmd.throttle, steer: cmd.steer });
        if (pending.length > 240) pending.shift();
      }
      socket?.emit('game:rt:input', { roomId, input: cmd });
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
    // perf: reuse across frames instead of allocating per frame
    const crateCol = new THREE.Color();
    let meX = null;
    const panFor = (x) => (meX == null ? 0 : Math.max(-1, Math.min(1, (x - meX) / (arena.w / 2))));
    let lastT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sample = sampleAt(performance.now() - INTERP_MS);
      const snap = latest.snap;
      if (sample && snap) {
        const me = sample.find((k) => k.i === youAreIndex) || sample[0];
        meX = me ? me.x : null;
        // ease the rendered local pose toward the predicted pose
        if (pred.has) {
          if (!renderInit) { renderLocal.x = pred.x; renderLocal.z = pred.z; renderLocal.h = pred.heading; renderInit = true; }
          else {
            renderLocal.x += (pred.x - renderLocal.x) * PRED_SMOOTH;
            renderLocal.z += (pred.z - renderLocal.z) * PRED_SMOOTH;
            renderLocal.h = lerpAngle(renderLocal.h, pred.heading, PRED_SMOOTH);
          }
        }
        const camPose = pred.has ? renderLocal : me;
        let localSpeed = 0;
        for (const ks of sample) {
          const g = karts[ks.i];
          if (!g) continue;
          const meta = snap.karts.find((k) => k.i === ks.i);
          const visible = meta ? meta.alive && !meta.gone : true;
          g.visible = visible;
          const useLocal = ks.i === youAreIndex && pred.has;
          const rx = useLocal ? renderLocal.x : ks.x;
          const rz = useLocal ? renderLocal.z : ks.z;
          const rh = useLocal ? renderLocal.h : ks.h;
          g.position.set(rx, 0, rz);
          g.rotation.y = rh;
          // derive speed/turn from the interpolated transform delta
          const pt = prevT[ks.i];
          let speed = 0, turn = 0;
          if (pt.init) {
            speed = Math.hypot(rx - pt.x, rz - pt.z);
            turn = ((rh - pt.h + Math.PI) % (Math.PI * 2)) - Math.PI;
          }
          pt.x = rx; pt.z = rz; pt.h = rh; pt.init = true;
          if (ks.i === youAreIndex) localSpeed = speed;
          updateKart(g, { speed, turn, hp: meta?.hp ?? 100, shield: visible && meta?.shield, now: performance.now() });
          if (visible && speed > 0.15 && Math.random() < 0.4) fx.dust(rx - Math.sin(rh) * 1.8, rz - Math.cos(rh) * 1.8);
          if (visible && (meta?.hp ?? 100) < 30 && Math.random() < 0.25) fx.smoke(rx, 1.0, rz);
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
        if (camPose) {
          const fxDir = Math.sin(camPose.h), fz = Math.cos(camPose.h);
          camTarget.set(camPose.x - fxDir * 16, 11, camPose.z - fz * 16);
          camera.position.lerp(camTarget, 0.08);
          camera.lookAt(camPose.x, 1.5, camPose.z);
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
            crateCol.set(WEAPON_COLOR[c.type] || '#fff');
            mesh.material.color.copy(crateCol); mesh.material.emissive.copy(crateCol);
            if (mesh.userData.ring) mesh.userData.ring.material.color.copy(crateCol);
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

      const nowT = performance.now();
      const dt = Math.min(0.05, (nowT - lastT) / 1000); // clamp so a tab stall doesn't fast-forward
      lastT = nowT;
      fx.update(dt);
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
      renderer.domElement.removeEventListener('pointerdown', md);
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
