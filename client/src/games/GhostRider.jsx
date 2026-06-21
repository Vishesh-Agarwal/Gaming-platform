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

const ACCEL = 0.34;
const BRAKE = 0.42;
const MAX_SPEED = 9.5;
const REVERSE_MAX = 2.0;
const DRAG = 0.988;
const GRAVITY = 0.46;      // lower gravity => fast launches float longer (more air)
const SPIN_ACCEL = 0.0075; // how quickly you wind up a flip
const MAX_SPIN = 0.17;     // capped flip rate (~37 frames / 360deg) => natural-looking
const AIR_DRAG = 0.999;
const CRASH_ANGLE = 1.35;  // land >~77deg off the slope => wreck (must finish the flip)
const CRASH_TIME = 1300;   // ms downed before respawn
const WHEEL_R = 11;
const SEND_HZ = 15;

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

    const startX = 120;
    const car = {
      x: startX, y: terrainY(startX), vx: 0, vy: 0, spd: 0,
      a: groundAngle(startX), av: 0,
      onGround: true, finished: false,
      crashed: false, crashUntil: 0, crashes: 0,
    };
    const ghost = {
      x: startX, y: terrainY(startX), angle: 0,
      tx: startX, ty: terrainY(startX), tAngle: 0,
    };
    const input = { gas: false, brake: false };

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
      if (!msg?.s) return;
      ghost.tx = msg.s.x;
      ghost.ty = msg.s.y;
      ghost.tAngle = msg.s.angle || 0;
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
        if (now >= car.crashUntil) {
          car.crashed = false;
          car.y = terrainY(car.x);
          car.spd = 0; car.vx = 0; car.vy = 0; car.av = 0;
          car.a = groundAngle(car.x);
          car.onGround = true;
        }
      } else if (live && car.onGround) {
        // Drive ALONG the slope. Speed builds on the ramp face; when the ground
        // falls away faster than the trajectory (the lip), the bike launches.
        if (input.gas) car.spd += ACCEL * dt;
        else if (input.brake) car.spd -= BRAKE * dt;
        car.spd *= Math.pow(DRAG, dt);
        if (car.spd > MAX_SPEED) car.spd = MAX_SPEED;
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
        if (car.x <= startX && car.spd < 0) car.spd = 0;

        if (car.x >= trackLength && !car.finished) {
          car.finished = true;
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
          if (Math.abs(norm(car.a - ga)) > CRASH_ANGLE) {
            // came down on its head -> crash & tumble
            car.crashed = true;
            car.crashUntil = now + CRASH_TIME;
            car.crashes += 1;
            car.vx = 0; car.vy = 0; car.spd = 0;
            car.av = (Math.random() < 0.5 ? -1 : 1) * 0.14;
          } else {
            // clean landing: snap to slope, keep speed along it
            car.y = groundY;
            car.a = ga;
            car.av = 0;
            car.onGround = true;
            car.spd = car.vx * Math.cos(ga) + car.vy * Math.sin(ga);
            if (car.spd > MAX_SPEED) car.spd = MAX_SPEED;
          }
        }

        if (car.x >= trackLength && !car.finished) {
          car.finished = true;
          socket?.emit('game:rt:finish', { roomId });
        }
      }

      sendState(now);

      const k = Math.min(1, 0.25 * dt);
      ghost.x += (ghost.tx - ghost.x) * k;
      ghost.y += (ghost.ty - ghost.y) * k;
      ghost.angle += norm(ghost.tAngle - ghost.angle) * k;

      draw(now);
    };

    // --- rendering ---
    const draw = (now) => {
      const camX = car.x - W * 0.3;
      const camY = car.y - H * 0.58;

      drawSky();
      drawSun(camX);
      drawClouds(now, camX);
      drawRange(camX * 0.2, H * 0.5, 70, 0.0011, p2, '#3a2356', '#2a1840');
      drawRange(camX * 0.4, H * 0.62, 48, 0.0024, p3, '#4a2a5c', '#321d40');
      drawGround(camX, camY);

      const fsx = trackLength - camX;
      if (fsx > -40 && fsx < W + 40) drawFinish(fsx, terrainY(trackLength) - camY);

      drawBike(ghost.x - camX, ghost.y - camY, ghost.angle, '#22e0ff', true, ghost.x / WHEEL_R);
      drawBike(car.x - camX, car.y - camY, car.a, '#ff7a3c', false, car.x / WHEEL_R);

      drawHUD();
    };

    const drawSky = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#160b2e');
      g.addColorStop(0.55, '#3b1f5e');
      g.addColorStop(1, '#7a3b6a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };

    const drawSun = (camX) => {
      const x = W * 0.74 - camX * 0.03;
      const y = H * 0.26;
      const g = ctx.createRadialGradient(x, y, 8, x, y, 120);
      g.addColorStop(0, 'rgba(255,196,120,0.95)');
      g.addColorStop(0.25, 'rgba(255,150,90,0.55)');
      g.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 120, y - 120, 240, 240);
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#ffca78';
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

    const drawGround = (camX, camY) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += 5) ctx.lineTo(sx, terrainY(camX + sx) - camY);
      ctx.lineTo(W, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
      g.addColorStop(0, '#5b4636');
      g.addColorStop(1, '#241a12');
      ctx.fillStyle = g;
      ctx.fill();

      ctx.beginPath();
      for (let sx = 0; sx <= W; sx += 5) {
        const sy = terrainY(camX + sx) - camY;
        sx === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#3f9d4f';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(140,230,150,0.6)';
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

    const drawBike = (sx, sy, angle, color, isGhost, spin) => {
      const R = WHEEL_R;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.translate(0, -R); // pivot around the axle centre so flips look natural
      ctx.rotate(angle);
      ctx.translate(0, R);
      ctx.globalAlpha = isGhost ? 0.5 : 1;

      ctx.strokeStyle = isGhost ? color : '#d3d7ea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, -R);
      ctx.lineTo(-4, -R - 11);
      ctx.lineTo(12, -R - 11);
      ctx.lineTo(18, -R);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-13, -R - 17, 26, 8, 3);
      else ctx.rect(-13, -R - 17, 26, 8);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, -R - 13);
      ctx.lineTo(21, -R - 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(11, -R - 11);
      ctx.lineTo(18, -R);
      ctx.stroke();

      for (const wx of [-18, 18]) {
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
        ctx.beginPath(); ctx.moveTo(-2, -R - 16); ctx.lineTo(7, -R - 27); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -R - 27); ctx.lineTo(19, -R - 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2, -R - 16); ctx.lineTo(-7, -R - 3); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(9, -R - 31, 5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(7, -R - 27, 5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawHUD = () => {
      const pad = 16;
      const barW = W - pad * 2;
      const barH = 8;
      const by = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(pad, by, barW, barH);
      const myP = Math.max(0, Math.min(1, car.x / trackLength));
      const ghP = Math.max(0, Math.min(1, ghost.x / trackLength));
      ctx.fillStyle = '#22e0ff';
      ctx.fillRect(pad + ghP * barW - 2, by - 3, 4, barH + 6);
      ctx.fillStyle = '#ff7a3c';
      ctx.fillRect(pad, by, myP * barW, barH);
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillStyle = '#f0f2fb';
      ctx.textAlign = 'left';
      ctx.fillText('You', pad, by + 26);
      ctx.textAlign = 'right';
      ctx.fillText('Opponent (ghost)', W - pad, by + 26);
      ctx.textAlign = 'left';

      if (car.crashed) {
        ctx.fillStyle = '#ff5d6c';
        ctx.font = '800 46px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED!', W / 2, H / 2);
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillStyle = '#ffd4d8';
        ctx.fillText('Respawning…', W / 2, H / 2 + 34);
        ctx.textAlign = 'left';
      }

      const remaining = startAt - Date.now();
      if (remaining > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = '800 80px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.ceil(remaining / 1000)), W / 2, H / 2);
        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillText('Get ready…', W / 2, H / 2 + 50);
        ctx.textAlign = 'left';
      } else if (remaining > -800) {
        ctx.fillStyle = '#22e0ff';
        ctx.font = '800 64px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GO!', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
    };

    raf = requestAnimationFrame(loop);

    return () => {
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
      <canvas ref={canvasRef} className="gr-canvas" />
      <div className="gr-controls">
        <button className="gr-btn gr-brake" type="button">◀ Brake / lean fwd</button>
        <button className="gr-btn gr-gas" type="button">Gas / lean back ▶</button>
      </div>
      <p className="gr-hint muted">
        <b>→</b>/<b>Space</b> gas · <b>←</b> brake. Hit a ramp fast for big air — the more speed,
        the longer you hang. In the air <b>gas</b> backflips, <b>brake</b> frontflips; release to
        hold. Finish the rotation and land on your wheels, or you wreck and respawn.
      </p>
    </div>
  );
}
