// Ghost Rider — real-time racing game (client).
// Each player simulates its OWN bike locally over a shared procedural track (built
// from the server's seed) and broadcasts its position+angle ~15x/sec. The opponent
// is drawn as a translucent "ghost". First to the finish line wins (server arbitrates
// via game:rt:finish -> game:over). Socket used directly (high-frequency updates).
//
// Physics: momentum-based. Climbing a ramp builds upward velocity, so cresting it
// LAUNCHES you proportionally to speed. In the air, gas leans back / brake leans
// forward, letting you flip & barrel-roll. Land too tilted (on your head) and you
// CRASH, then respawn after a short delay (a time penalty).
import { useEffect, useRef } from 'react';
import { getSocket } from '../socket.js';
import { createGhostRiderAudio } from './ghostRiderAudio.js';

const ACCEL = 0.34;
const BRAKE = 0.42;
const MAX_SPEED = 9.5;
const REVERSE_MAX = 2.0;
const DRAG = 0.988;
const GRAVITY = 0.46;      // lower gravity => fast launches float longer (more air)
const SPIN_ACCEL = 0.009;  // how quickly you wind up a flip
const MAX_SPIN = 0.20;     // capped flip rate (~31 frames / 360deg) => controlled mobile flips
const AIR_DRAG = 0.999;
const CRASH_ANGLE = 1.35;  // land >~77deg off the slope => wreck (must finish the flip)
const BAD_LANDING_ANGLE = 0.68;
const CRASH_TIME = 1300;   // ms downed before respawn
const WHEEL_R = 11;
const SEND_HZ = 15;
const STABILITY_MAX = 100;
const HARD_CRASH_STABILITY = 18;
const STABILITY_RECOVER = 0.11;
const SUSPENSION_REBOUND = 0.14;
const SUSPENSION_DAMPING = 0.82;

// Boost pickups: deterministic pads along the track give a short speed surge.
const BOOST_MS = 1500;     // how long the surge lasts after grabbing a pad
const BOOST_MAX = 14;      // raised speed ceiling while boosting (vs MAX_SPEED)
const BOOST_KICK = 3.5;    // instant speed added on pickup
const PICKUP_R = 30;       // grab radius (world units)

// Ghost colors for opponents (the local rider is always orange).
const GHOST_COLORS = ['#22e0ff', '#c08bff', '#ffd84d', '#5dff9b'];

const norm = (x) => Math.atan2(Math.sin(x), Math.cos(x)); // wrap to [-PI, PI]

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#241038" />
          <stop offset="100%" stopColor="#6a2f5a" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#gr-sky)" />
      <circle cx="90" cy="32" r="15" fill="#ffb24d" opacity="0.9" />
      <path d="M0 70 L24 50 L44 66 L70 44 L96 64 L120 50 L120 120 L0 120 Z" fill="#3a2350" opacity="0.8" />
      <path d="M0 88 Q 30 62 56 82 T 120 74 L120 120 L0 120 Z" fill="#2c1f14" />
      <path d="M0 88 Q 30 62 56 82 T 120 74" fill="none" stroke="#4caf50" strokeWidth="4" />
      <g stroke="#ff7a3c" strokeWidth="3" fill="#161616">
        <circle cx="40" cy="82" r="7" />
        <circle cx="60" cy="78" r="7" />
      </g>
      <path d="M40 82 L50 72 L60 78" stroke="#ff7a3c" strokeWidth="3" fill="none" />
      <circle cx="52" cy="66" r="4" fill="#ff7a3c" />
    </svg>
  );
}

export default function GhostRider({ room }) {
  const canvasRef = useRef(null);
  const statusRef = useRef(room.status);
  useEffect(() => {
    statusRef.current = room.status;
  }, [room.status]);

  useEffect(() => {
    const socket = getSocket();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { seed, trackLength, startAt } = room.state;
    const roomId = room.id;

    // --- deterministic terrain + scenery from the shared seed ---
    const frand = (n) => {
      const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const p1 = frand(1) * Math.PI * 2;
    const p2 = frand(2) * Math.PI * 2;
    const p3 = frand(3) * Math.PI * 2;
    // Base rolling ground whose character drifts: some calm flats, some hilly.
    const baseTerrain = (x) => {
      const env = 0.5 + 0.5 * Math.sin(x * 0.00035 + p1); // 0..1 amplitude envelope
      return (
        Math.sin(x * 0.0016 + p1) * 90 * env +
        Math.sin(x * 0.0041 + p2) * 32 * env +
        Math.sin(x * 0.0090 + p3) * 12
      );
    };
    // Launch ramps with two distinct flavours: small hops and big kickers. Each is a
    // front face whose slope steepens to a sharp lip, then the ground drops away.
    const ramps = [];
    for (let rx = 800, i = 0; rx < trackLength - 500; i++) {
      const big = frand(80 + i) > 0.45;
      ramps.push({
        lip: rx,
        w: (big ? 150 : 95) + frand(40 + i) * (big ? 90 : 45),    // front-face length
        rh: (big ? 130 : 50) + frand(50 + i) * (big ? 95 : 45),   // launch height
        drop: (big ? 70 : 45) + frand(60 + i) * 45,               // back-side drop
      });
      rx += (big ? 1000 : 560) + frand(70 + i) * 720; // spacing varies with size
    }
    const rampHeight = (x) => {
      let h = 0;
      for (const r of ramps) {
        const d = x - (r.lip - r.w);
        if (d >= 0 && d <= r.w) h += r.rh * (d / r.w) * (d / r.w); // steepening rise
        else {
          const d2 = x - r.lip;
          if (d2 > 0 && d2 <= r.drop) h += r.rh * (1 - d2 / r.drop); // quick drop
        }
      }
      return h;
    };
    const terrainY = (x) => baseTerrain(x) - rampHeight(x); // up = smaller y
    const groundAngle = (x) => Math.atan2(terrainY(x + 6) - terrainY(x - 6), 12);

    const clouds = Array.from({ length: 6 }, (_, i) => ({
      x: frand(10 + i) * 3000,
      y: 40 + frand(20 + i) * 120,
      s: 0.7 + frand(30 + i) * 0.8,
    }));
    const stars = Array.from({ length: 70 }, (_, i) => ({
      x: frand(300 + i) * 4000,
      y: 18 + frand(400 + i) * 190,
      r: 0.7 + frand(500 + i) * 1.6,
      tw: frand(600 + i) * Math.PI * 2,
    }));
    const silhouettes = Array.from({ length: 28 }, (_, i) => ({
      x: 260 + i * 220 + frand(700 + i) * 120,
      h: 44 + frand(800 + i) * 76,
      w: 12 + frand(900 + i) * 24,
      lean: (frand(1000 + i) - 0.5) * 0.5,
    }));

    const startX = 120;
    const car = {
      x: startX, y: terrainY(startX), vx: 0, vy: 0, spd: 0,
      a: groundAngle(startX), av: 0,
      onGround: true, finished: false,
      crashed: false, crashUntil: 0, crashes: 0,
      boostUntil: 0,
      stability: STABILITY_MAX, bikeHealth: STABILITY_MAX,
      suspension: 0, suspensionV: 0, damageFlashUntil: 0,
    };
    // Opponents arrive over the wire keyed by player id; each gets its own color
    // and is interpolated toward its last reported pose. Supports N racers.
    const ghosts = new Map(); // id -> { x,y,angle, tx,ty,tAngle, color }
    const input = { gas: false, brake: false };
    const particles = [];
    const audio = createGhostRiderAudio();

    // Deterministic boost pads floating just above the track (same for everyone).
    const pickups = [];
    for (let px = 600, i = 0; px < trackLength - 300; i++) {
      pickups.push({ x: px, taken: false });
      px += 520 + frand(120 + i) * 520;
    }
    const pickupY = (x) => terrainY(x) - 38;
    const boosting = () => performance.now() < car.boostUntil;
    const speedCap = () => (boosting() ? BOOST_MAX : MAX_SPEED);
    // Grab any pad we're overlapping (ignores the vertical gap a bit so you can
    // snag them mid-jump too).
    const grabPickups = () => {
      for (const p of pickups) {
        if (p.taken) continue;
        if (Math.abs(car.x - p.x) < PICKUP_R && Math.abs(car.y - pickupY(p.x)) < PICKUP_R + 24) {
          p.taken = true;
          car.boostUntil = performance.now() + BOOST_MS;
          car.spd = Math.min(BOOST_MAX, Math.max(car.spd, 0) + BOOST_KICK);
          emitSparks(car.x, car.y, 14);
          audio.pickup();
        }
      }
    };
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const recoverStability = (dt) => {
      if (car.crashed || !car.onGround || Math.abs(car.spd) < 1.2) return;
      car.stability = clamp(car.stability + STABILITY_RECOVER * dt, 0, STABILITY_MAX);
      car.bikeHealth = car.stability;
    };
    const emitDust = (x, y, amount = 1.5, color = 'rgba(210,184,138,0.72)') => {
      const count = Math.max(1, Math.round(amount));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x - Math.random() * 22,
          y: y - 4 + Math.random() * 8,
          vx: -1.6 - Math.random() * 2.4 - Math.max(0, car.spd) * 0.08,
          vy: -0.4 - Math.random() * 1.2,
          life: 34 + Math.random() * 22,
          maxLife: 56,
          r: 2 + Math.random() * 4,
          color,
        });
      }
      if (particles.length > 180) particles.splice(0, particles.length - 180);
    };
    const emitSparks = (x, y, amount = 9) => {
      for (let i = 0; i < amount; i++) {
        particles.push({
          x,
          y: y - 4,
          vx: -3 + Math.random() * 6,
          vy: -2.8 - Math.random() * 2.6,
          life: 18 + Math.random() * 18,
          maxLife: 36,
          r: 1 + Math.random() * 2,
          color: Math.random() > 0.45 ? '#ffdf6b' : '#ff6a3c',
          spark: true,
        });
      }
      if (particles.length > 180) particles.splice(0, particles.length - 180);
    };
    const damageLanding = (tilt, impact, now) => {
      const angleOver = Math.max(0, tilt - BAD_LANDING_ANGLE);
      const impactOver = Math.max(0, impact - 7);
      const damage = angleOver * 42 + impactOver * 4;
      if (damage <= 0) return false;
      car.stability = clamp(car.stability - damage, 0, STABILITY_MAX);
      car.bikeHealth = car.stability;
      car.damageFlashUntil = now + 260;
      car.suspensionV += Math.min(8, damage * 0.08);
      emitSparks(car.x, terrainY(car.x), Math.min(18, 5 + damage * 0.2));
      return car.stability <= HARD_CRASH_STABILITY || tilt > CRASH_ANGLE + 0.28;
    };
    const updateParticles = (dt) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.spark ? 0.24 : 0.05) * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    };

    // --- canvas sizing (DPR-aware) ---
    let W = 0, H = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // --- keyboard ---
    const keydown = (e) => {
      if (e.key === 'ArrowRight' || e.code === 'Space') { input.gas = true; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { input.brake = true; e.preventDefault(); }
    };
    const keyup = (e) => {
      if (e.key === 'ArrowRight' || e.code === 'Space') input.gas = false;
      if (e.key === 'ArrowLeft') input.brake = false;
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);

    // --- touch / pointer buttons ---
    const wrap = canvas.parentElement;
    const set = (key, val) => (e) => { input[key] = val; e.preventDefault(); };
    const binds = [];
    const bind = (sel, key) => {
      const el = wrap.querySelector(sel);
      if (!el) return;
      const down = set(key, true);
      const up = set(key, false);
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
      binds.push({ el, down, up });
    };
    bind('.gr-brake', 'brake');
    bind('.gr-gas', 'gas');

    // --- networking ---
    const onGhost = (msg) => {
      if (!msg?.s || msg.from == null) return;
      let g = ghosts.get(msg.from);
      if (!g) {
        g = {
          x: msg.s.x, y: msg.s.y, angle: msg.s.angle || 0,
          tx: msg.s.x, ty: msg.s.y, tAngle: msg.s.angle || 0,
          color: GHOST_COLORS[ghosts.size % GHOST_COLORS.length],
        };
        ghosts.set(msg.from, g);
      }
      g.tx = msg.s.x;
      g.ty = msg.s.y;
      g.tAngle = msg.s.angle || 0;
    };
    socket?.on('game:rt:ghost', onGhost);

    let lastSend = 0;
    const sendState = (now) => {
      if (!socket || statusRef.current !== 'playing') return;
      if (now - lastSend < 1000 / SEND_HZ) return;
      lastSend = now;
      socket.emit('game:rt:state', { roomId, s: { x: car.x, y: car.y, angle: car.a } });
    };

    // --- main loop ---
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 16.6667;
      last = now;
      if (dt > 3) dt = 3;

      const live = Date.now() >= startAt && statusRef.current === 'playing' && !car.finished;

      if (live && car.crashed) {
        // downed: tumble visually, then respawn upright (keeps x = time penalty)
        car.a += car.av * dt;
        car.av *= Math.pow(0.96, dt);
        car.suspension *= Math.pow(0.9, dt);
        if (now >= car.crashUntil) {
          car.crashed = false;
          car.y = terrainY(car.x);
          car.spd = 0; car.vx = 0; car.vy = 0; car.av = 0;
          car.a = groundAngle(car.x);
          car.onGround = true;
          car.stability = 58;
          car.bikeHealth = car.stability;
        }
      } else if (live && car.onGround) {
        // Drive ALONG the slope. Speed builds on the ramp face; when the ground
        // falls away faster than the trajectory (the lip), the bike launches.
        if (input.gas) car.spd += ACCEL * dt;
        else if (input.brake) car.spd -= BRAKE * dt;
        car.spd *= Math.pow(DRAG, dt);
        if (car.spd > speedCap()) car.spd = speedCap();
        if (car.spd < -REVERSE_MAX) car.spd = -REVERSE_MAX;

        // slope just BEHIND us (the face we're riding) — avoids the lip discontinuity
        const ga = Math.atan2(terrainY(car.x) - terrainY(car.x - 10), 10);
        car.vx = Math.cos(ga) * car.spd;
        car.vy = Math.sin(ga) * car.spd;
        const nextX = Math.max(startX, car.x + car.vx * dt);
        const projY = car.y + car.vy * dt;
        const groundNext = terrainY(nextX);
        if (projY < groundNext - 0.75) {
          // lip / crest: ground dropped away -> airborne, momentum carries us
          car.x = nextX;
          car.y = projY;
          car.onGround = false;
        } else {
          car.x = nextX;
          car.y = groundNext;
          car.a = ga;
        }
        car.suspensionV += (Math.abs(car.spd) * 0.012 - car.suspension) * SUSPENSION_REBOUND * dt;
        car.suspensionV *= Math.pow(SUSPENSION_DAMPING, dt);
        car.suspension = clamp(car.suspension + car.suspensionV * dt, -2, 8);
        recoverStability(dt);
        if (Math.abs(car.spd) > 2.5) emitDust(car.x, car.y, Math.abs(car.spd) * 0.12);
        if (car.x <= startX && car.spd < 0) car.spd = 0;

        if (car.x >= trackLength && !car.finished) {
          car.finished = true;
          audio.finish();
          socket?.emit('game:rt:finish', { roomId });
        }
      } else if (live) {
        // airborne: wind up a capped, natural flip rate. Gas = backflip, brake =
        // frontflip. Release both to hold attitude and line up the landing.
        if (input.gas) car.av -= SPIN_ACCEL * dt;
        else if (input.brake) car.av += SPIN_ACCEL * dt;
        else car.av *= Math.pow(0.985, dt);
        if (car.av > MAX_SPIN) car.av = MAX_SPIN;
        if (car.av < -MAX_SPIN) car.av = -MAX_SPIN;
        car.vx *= Math.pow(AIR_DRAG, dt);
        car.vy += GRAVITY * dt;
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        car.a += car.av * dt;

        const groundY = terrainY(car.x);
        if (car.y >= groundY) {
          const ga = groundAngle(car.x);
          const tilt = Math.abs(norm(car.a - ga));
          const impact = Math.abs(car.vy) + Math.max(0, Math.abs(car.av) * 20);
          if (damageLanding(tilt, impact, now)) {
            // repeated hard impacts still wreck, but one imperfect landing usually limps onward
            car.crashed = true;
            car.crashUntil = now + CRASH_TIME;
            car.crashes += 1;
            car.vx = 0; car.vy = 0; car.spd = 0;
            car.av = (Math.random() < 0.5 ? -1 : 1) * 0.14;
            audio.crash();
          } else {
            // landing: snap to slope, keep most speed, and let stability absorb roughness
            car.y = groundY;
            car.a = ga + norm(car.a - ga) * 0.12;
            car.av *= tilt > BAD_LANDING_ANGLE ? 0.18 : 0;
            car.onGround = true;
            car.suspensionV += Math.min(10, impact * 0.75);
            car.spd = (car.vx * Math.cos(ga) + car.vy * Math.sin(ga)) * (tilt > BAD_LANDING_ANGLE ? 0.72 : 0.94);
            if (car.spd > speedCap()) car.spd = speedCap();
            if (Math.abs(car.spd) > 2) emitDust(car.x, groundY, 8 + impact * 0.6, 'rgba(226,198,148,0.78)');
            audio.land(Math.min(1, impact / 12));
          }
        }

        if (car.x >= trackLength && !car.finished) {
          car.finished = true;
          audio.finish();
          socket?.emit('game:rt:finish', { roomId });
        }
      }

      if (live) grabPickups();
      audio.updateEngine(
        live && !car.crashed ? Math.abs(car.spd) / BOOST_MAX : 0,
        live && !car.crashed && input.gas,
        boosting()
      );
      updateParticles(dt);

      sendState(now);

      const k = Math.min(1, 0.25 * dt);
      for (const g of ghosts.values()) {
        g.x += (g.tx - g.x) * k;
        g.y += (g.ty - g.y) * k;
        g.angle += norm(g.tAngle - g.angle) * k;
      }

      draw(now);
    };

    // --- rendering ---
    const draw = (now) => {
      const camX = car.x - W * 0.3;
      const camY = car.y - H * 0.58;
      const shake = Math.max(0, car.damageFlashUntil - now) / 260;

      drawSky();
      drawStars(now, camX);
      drawMoon(camX);
      drawClouds(now, camX);
      drawRange(camX * 0.2, H * 0.5, 70, 0.0011, p2, '#1a2843', '#101827');
      drawRange(camX * 0.4, H * 0.62, 48, 0.0024, p3, '#26324c', '#151b25');
      drawSilhouettes(camX, camY);
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 5);
      drawGround(camX, camY);

      const fsx = trackLength - camX;
      if (fsx > -40 && fsx < W + 40) drawFinish(fsx, terrainY(trackLength) - camY);

      drawPickups(now, camX, camY);
      drawParticles(camX, camY);

      for (const g of ghosts.values()) {
        drawExhaustTrail(g.x - camX, g.y - camY, g.angle, g.color, 0.35);
        drawBike(g.x - camX, g.y - camY, g.angle, g.color, true, g.x / WHEEL_R, 0);
      }
      drawExhaustTrail(car.x - camX, car.y - camY, car.a, '#ff7a3c', boosting() ? 1 : 0.65);
      drawHeadlight(car.x - camX, car.y - camY, car.a);
      drawBike(car.x - camX, car.y - camY, car.a, '#ff7a3c', false, car.x / WHEEL_R, car.suspension);
      ctx.restore();

      drawHUD(now);
    };

    const drawSky = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#160b2e');
      g.addColorStop(0.55, '#3b1f5e');
      g.addColorStop(1, '#7a3b6a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };

    const drawStars = (now, camX) => {
      for (const s of stars) {
        let sx = ((s.x - camX * 0.04) % (W + 120)) - 60;
        if (sx < -60) sx += W + 120;
        const alpha = 0.34 + Math.sin(now * 0.002 + s.tw) * 0.18;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#d9e9ff';
        ctx.beginPath();
        ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawMoon = (camX) => {
      const x = W * 0.74 - camX * 0.03;
      const y = H * 0.26;
      const g = ctx.createRadialGradient(x, y, 8, x, y, 145);
      g.addColorStop(0, 'rgba(188,232,255,0.9)');
      g.addColorStop(0.3, 'rgba(88,164,220,0.28)');
      g.addColorStop(1, 'rgba(70,110,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 145, y - 145, 290, 290);
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#d9f0ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 9, y - 8, 5, 0, Math.PI * 2);
      ctx.arc(x + 8, y + 7, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(86,126,158,0.25)';
      ctx.fill();
    };

    const drawClouds = (now, camX) => {
      ctx.fillStyle = 'rgba(255,235,245,0.16)';
      for (const c of clouds) {
        let sx = ((c.x - camX * 0.12 + now * 0.004) % (W + 240)) - 120;
        if (sx < -120) sx += W + 240;
        const sy = c.y;
        const s = c.s;
        for (const [dx, dy, r] of [[0, 0, 26], [22, 6, 20], [-22, 6, 18], [0, 10, 30]]) {
          ctx.beginPath();
          ctx.ellipse(sx + dx * s, sy + dy * s, r * s, r * s * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawRange = (offX, baseY, amp, freq, phase, top, bot) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 8) {
        const wx = offX + sx;
        const y = baseY + Math.sin(wx * freq + phase) * amp + Math.sin(wx * freq * 2.7 + phase) * amp * 0.3;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, baseY - amp, 0, H);
      g.addColorStop(0, top);
      g.addColorStop(1, bot);
      ctx.fillStyle = g;
      ctx.fill();
    };

    const drawSilhouettes = (camX, camY) => {
      ctx.fillStyle = 'rgba(8,10,16,0.78)';
      for (const s of silhouettes) {
        const sx = s.x - camX * 0.58;
        if (sx < -80 || sx > W + 80) continue;
        const sy = terrainY(s.x) - camY + 4;
        ctx.beginPath();
        ctx.moveTo(sx - s.w, sy);
        ctx.lineTo(sx + s.lean * 42, sy - s.h);
        ctx.lineTo(sx + s.w, sy);
        ctx.closePath();
        ctx.fill();
      }
    };

    const drawGround = (camX, camY) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 5) ctx.lineTo(sx, terrainY(camX + sx) - camY);
      ctx.lineTo(W, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
      g.addColorStop(0, '#3d352d');
      g.addColorStop(0.45, '#241f1b');
      g.addColorStop(1, '#10100f');
      ctx.fillStyle = g;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.lineWidth = 1;
      for (let sx = -20; sx <= W + 20; sx += 42) {
        const wx = camX + sx;
        const sy = terrainY(wx) - camY + 18 + Math.sin(wx * 0.031) * 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 24, sy + Math.sin(wx * 0.021) * 7);
        ctx.stroke();
      }

      ctx.beginPath();
      for (let sx = 0; sx <= W; sx += 5) {
        const sy = terrainY(camX + sx) - camY;
        sx === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#1a1410';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#6a3c24';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,190,112,0.62)';
      ctx.stroke();
    };

    const drawFinish = (sx, sy) => {
      const h = 100;
      const c = 9;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - 2, sy - h, 4, h);
      for (let r = 0; r < 4; r++)
        for (let col = 0; col < 3; col++) {
          ctx.fillStyle = (r + col) % 2 ? '#fff' : '#111';
          ctx.fillRect(sx + 2 + col * c, sy - h + r * c, c, c);
        }
    };

    const drawPickups = (now, camX, camY) => {
      for (const p of pickups) {
        if (p.taken) continue;
        const sx = p.x - camX;
        if (sx < -40 || sx > W + 40) continue;
        const bob = Math.sin(now * 0.005 + p.x) * 4;
        const sy = pickupY(p.x) - camY + bob;
        ctx.save();
        ctx.translate(sx, sy);
        // soft glow disc
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
        g.addColorStop(0, 'rgba(255,224,120,0.85)');
        g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
        // lightning bolt
        ctx.fillStyle = '#ffdf5a';
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(2, -10); ctx.lineTo(-5, 1); ctx.lineTo(-1, 1);
        ctx.lineTo(-2, 10); ctx.lineTo(5, -2); ctx.lineTo(1, -2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    };

    const drawParticles = (camX, camY) => {
      for (const p of particles) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - camX, p.y - camY, p.r * (p.spark ? 0.7 : 1 + (1 - alpha) * 0.7), 0, Math.PI * 2);
        ctx.fill();
        if (p.spark) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x - camX, p.y - camY);
          ctx.lineTo(p.x - camX - p.vx * 2.8, p.y - camY - p.vy * 2.8);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const drawExhaustTrail = (sx, sy, angle, color, intensity = 0.6) => {
      ctx.save();
      ctx.translate(sx, sy - WHEEL_R);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(-18, 0, -78, 6);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,122,60,0)');
      ctx.globalAlpha = intensity;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-20, -8);
      ctx.quadraticCurveTo(-54, -20, -88, -8);
      ctx.quadraticCurveTo(-46, 8, -20, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawHeadlight = (sx, sy, angle) => {
      ctx.save();
      ctx.translate(sx, sy - WHEEL_R);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(22, -18, 150, -28);
      g.addColorStop(0, 'rgba(204,236,255,0.42)');
      g.addColorStop(1, 'rgba(204,236,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(20, -18);
      ctx.lineTo(155, -48);
      ctx.lineTo(150, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawBike = (sx, sy, angle, color, isGhost, spin, suspension = 0) => {
      const R = WHEEL_R;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.translate(0, -R); // pivot around the axle centre so flips look natural
      ctx.rotate(angle);
      ctx.translate(0, R);
      ctx.globalAlpha = isGhost ? 0.5 : 1;

      const suspensionDrop = isGhost ? 0 : suspension;
      const frameY = -R - 12 + suspensionDrop * 0.55;
      const rearX = -22;
      const frontX = 23;

      ctx.strokeStyle = isGhost ? color : 'rgba(20,22,28,0.95)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(rearX, -R - 1);
      ctx.lineTo(-7, frameY - 7);
      ctx.lineTo(12, frameY - 8);
      ctx.lineTo(frontX, -R - 1);
      ctx.stroke();

      ctx.strokeStyle = isGhost ? color : '#d3d7ea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rearX, -R);
      ctx.lineTo(-7, frameY - 8);
      ctx.lineTo(12, frameY - 8);
      ctx.lineTo(frontX, -R);
      ctx.moveTo(-7, frameY - 8);
      ctx.lineTo(1, -R - 1);
      ctx.lineTo(12, frameY - 8);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(230,235,255,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rearX + 4, -R - 1);
      ctx.lineTo(-5, frameY - 5);
      ctx.moveTo(frontX - 4, -R - 1);
      ctx.lineTo(14, frameY - 6);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-18, frameY - 16, 31, 10, 4);
      else ctx.rect(-18, frameY - 16, 31, 10);
      ctx.fill();

      ctx.fillStyle = isGhost ? color : '#111722';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(4, frameY - 20, 18, 8, 3);
      else ctx.rect(4, frameY - 20, 18, 8);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(13, frameY - 15);
      ctx.lineTo(28, frameY - 21);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, frameY - 9);
      ctx.lineTo(frontX, -R);
      ctx.stroke();

      for (const wx of [rearX, frontX]) {
        ctx.beginPath();
        ctx.arc(wx, -R, R, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = isGhost ? color : '#121212';
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(wx, -R, R - 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.translate(wx, -R);
        ctx.rotate(spin);
        ctx.strokeStyle = isGhost ? color : '#9aa0bd';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(R - 3, 0);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(wx, -R, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!isGhost) {
        ctx.strokeStyle = '#e8ebff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-4, frameY - 17); ctx.lineTo(7, frameY - 31); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, frameY - 31); ctx.lineTo(22, frameY - 21); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4, frameY - 17); ctx.lineTo(-12, -R - 4); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = '#171a24';
        ctx.beginPath(); ctx.ellipse(8, frameY - 32, 7, 6, -0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(9, frameY - 33, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(7, frameY - 31, 5, 0, Math.PI * 2); ctx.fill();
      }

      if (!isGhost && performance.now() < car.damageFlashUntil) {
        ctx.strokeStyle = 'rgba(255,95,80,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -R - 16, 42, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawHUD = (now) => {
      const speedText = `${Math.round(Math.abs(car.spd) * 12)} km/h`;
      const stabilityText = `${Math.round(car.bikeHealth)}%`;
      const distanceText = `${Math.round(Math.max(0, trackLength - car.x))} m`;
      const hud = wrap.querySelector('.gr-hud');
      if (hud) {
        hud.classList.toggle('is-damaged', now < car.damageFlashUntil || car.bikeHealth < 45);
        const speedEl = hud.querySelector('[data-gr-speed]');
        const stabilityEl = hud.querySelector('[data-gr-stability]');
        const distanceEl = hud.querySelector('[data-gr-distance]');
        if (speedEl) speedEl.textContent = speedText;
        if (stabilityEl) stabilityEl.textContent = stabilityText;
        if (distanceEl) distanceEl.textContent = distanceText;
      }

      const pad = 16;
      const barW = W - pad * 2;
      const barH = 8;
      const by = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(pad, by, barW, barH);
      const myP = Math.max(0, Math.min(1, car.x / trackLength));
      for (const g of ghosts.values()) {
        const ghP = Math.max(0, Math.min(1, g.x / trackLength));
        ctx.fillStyle = g.color;
        ctx.fillRect(pad + ghP * barW - 2, by - 3, 4, barH + 6);
      }
      ctx.fillStyle = '#ff7a3c';
      ctx.fillRect(pad, by, myP * barW, barH);
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillStyle = '#f0f2fb';
      ctx.textAlign = 'left';
      const racers = ghosts.size + 1;
      ctx.fillText('You', pad, by + 26);
      ctx.textAlign = 'right';
      ctx.fillText(racers > 2 ? `${racers} racers` : 'Opponent (ghost)', W - pad, by + 26);
      ctx.textAlign = 'left';

      if (boosting()) {
        ctx.fillStyle = '#ffdf5a';
        ctx.font = '800 18px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡ BOOST', W / 2, by + 30);
        ctx.textAlign = 'left';
      }

      if (car.crashed) {
        ctx.fillStyle = '#ff5d6c';
        ctx.font = '800 46px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BIKE DOWN', W / 2, H / 2);
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillStyle = '#ffd4d8';
        ctx.fillText('Recovering stability...', W / 2, H / 2 + 34);
        ctx.textAlign = 'left';
      }

      const remaining = startAt - Date.now();
      if (remaining > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = '800 80px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.ceil(remaining / 1000)), W / 2, H / 2);
        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillText('Get ready…', W / 2, H / 2 + 50);
        ctx.textAlign = 'left';
      } else if (remaining > -800) {
        ctx.fillStyle = '#22e0ff';
        ctx.font = '800 64px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GO!', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
    };

    raf = requestAnimationFrame(loop);

    return () => {
      audio.dispose();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      socket?.off('game:rt:ghost', onGhost);
      for (const { el, down, up } of binds) {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointerleave', up);
        el.removeEventListener('pointercancel', up);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gr-wrap">
      <div className="gr-hud" aria-hidden="true">
        <div>
          <span className="gr-hud__label">Speed</span>
          <strong className="gr-hud__value" data-gr-speed>0 km/h</strong>
        </div>
        <div>
          <span className="gr-hud__label">Stability</span>
          <strong className="gr-hud__value" data-gr-stability>100%</strong>
        </div>
        <div>
          <span className="gr-hud__label">Finish</span>
          <strong className="gr-hud__value" data-gr-distance>0 m</strong>
        </div>
      </div>
      <canvas ref={canvasRef} className="gr-canvas" />
      <div className="gr-controls gr-thumb-controls" aria-label="Ghost Rider controls">
        <button className="gr-btn gr-brake" type="button">
          <span className="gr-control-icon">◀</span>
          <span>Brake</span>
        </button>
        <button className="gr-btn gr-gas" type="button">
          <span>Gas</span>
          <span className="gr-control-icon">▶</span>
        </button>
      </div>
      <p className="gr-hint muted">
        <b>→</b>/<b>Space</b> gas · <b>←</b> brake. Hit a ramp fast for big air — the more speed,
        the longer you hang. In the air <b>gas</b> backflips and <b>brake</b> frontflips. Rough
        landings damage stability before the bike goes down. Grab glowing boost pads and finish first.
      </p>
    </div>
  );
}
