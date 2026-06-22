// Tank Duel — turn-based artillery (client). The server is authoritative: it
// simulates each shot, deforms the shared terrain heightmap, and sends back the
// trajectory + new HP + carved ground. This component renders the world, lets the
// active player drive + aim, emits the move, then animates the returned shell —
// carving its own displayed terrain at the impact moment and throwing debris so
// the crater isn't revealed before the shell lands.
import { useEffect, useRef, useState } from 'react';

// These mirror server/src/games/artillery.js so the aim guide & crater match.
const GRAVITY = 0.18;
const SPEED_K = 0.16;
const BARREL = 22;
const TANK_R = 16;
const MAX_STEPS = 4000;
const CRATER_R = 58;
const EDGE = 40;

// driving feel (client-only; server clamps the final position by move budget)
const MAX_DRIVE = 2.4;
const DRIVE_ACCEL = 0.16;
const DRIVE_FRICTION = 0.78;

const COLORS = ['#5cc8ff', '#ff8a4c']; // tank index 0 / 1
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gAt(ground, step, x) {
  if (x <= 0) return ground[0];
  const maxX = step * (ground.length - 1);
  if (x >= maxX) return ground[ground.length - 1];
  const fi = x / step;
  const i = Math.floor(fi);
  const f = fi - i;
  return ground[i] * (1 - f) + ground[i + 1] * f;
}
const slopeAt = (ground, step, x) =>
  Math.atan2(gAt(ground, step, x + 12) - gAt(ground, step, x - 12), 24);

function carveLocal(ground, step, ix, iy, r, H) {
  for (let i = 0; i < ground.length; i++) {
    const dx = i * step - ix;
    if (Math.abs(dx) > r) continue;
    const bowl = iy + Math.sqrt(r * r - dx * dx);
    if (bowl > ground[i]) ground[i] = Math.min(H, bowl);
  }
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2a3a" />
          <stop offset="100%" stopColor="#3c5a4a" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#art-sky)" />
      <path d="M0 80 Q40 58 70 76 T120 70 L120 120 L0 120 Z" fill="#2f4a35" />
      <path d="M14 28 Q60 0 104 36" fill="none" stroke="#8bd450" strokeWidth="3" strokeDasharray="2 5" />
      <circle cx="104" cy="36" r="5" fill="#ffd24a" />
      <g fill="#5cc8ff">
        <rect x="14" y="74" width="22" height="9" rx="4" />
        <rect x="20" y="68" width="11" height="7" rx="3" />
        <rect x="28" y="62" width="14" height="3" rx="1.5" transform="rotate(-32 28 64)" />
      </g>
      <g fill="#ff8a4c">
        <rect x="86" y="68" width="22" height="9" rx="4" />
        <rect x="91" y="62" width="11" height="7" rx="3" />
        <rect x="80" y="56" width="14" height="3" rx="1.5" transform="rotate(32 94 58)" />
      </g>
    </svg>
  );
}

// Small SVG dial that shows the firing angle as a needle on a 0–90° arc.
function AngleDial({ angle, color }) {
  const a = (angle * Math.PI) / 180;
  const cx = 34, cy = 34, r = 26;
  const nx = cx + Math.cos(a) * r;
  const ny = cy - Math.sin(a) * r;
  return (
    <svg width="68" height="42" viewBox="0 0 68 40" className="art-dial-svg">
      <path d="M8 34 A26 26 0 0 1 60 34" fill="none" stroke="#3a3f24" strokeWidth="4" strokeLinecap="round" />
      {[0, 30, 45, 60, 90].map((t) => {
        const tr = (t * Math.PI) / 180;
        return (
          <line key={t}
            x1={cx + Math.cos(tr) * 21} y1={cy - Math.sin(tr) * 21}
            x2={cx + Math.cos(tr) * 26} y2={cy - Math.sin(tr) * 26}
            stroke="#6a6a48" strokeWidth="1.5" />
        );
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3.5" fill={color} />
    </svg>
  );
}

export default function Artillery({ room, youAreIndex, onMove }) {
  const canvasRef = useRef(null);
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(60);
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState(0);

  const myTurn = room.status === 'playing' && room.state.turn === youAreIndex;
  const canFire = myTurn && !busy;
  const budget = room.state.moveBudget ?? 150;
  const fuelLeft = Math.max(0, budget - moved);
  const accent = COLORS[youAreIndex];

  // refs shared with the render loop / keyboard (avoid stale closures)
  const stateRef = useRef(room.state);
  const uiRef = useRef({ angle, power, you: youAreIndex, myTurn });
  const angleRef = useRef(angle);
  const powerRef = useRef(power);
  const canFireRef = useRef(canFire);
  const onMoveRef = useRef(onMove);
  const animRef = useRef({ active: false });
  const displayHpRef = useRef(room.state.tanks.map((t) => t.hp));
  const hpTargetRef = useRef(room.state.tanks.map((t) => t.hp));
  const lastSeqRef = useRef(room.state.seq ?? 0);
  const fireRef = useRef(() => {});
  const localXRef = useRef(room.state.tanks[youAreIndex].x);
  const wasMyTurnRef = useRef(false);
  const groundRef = useRef(room.state.ground.slice()); // displayed terrain
  const heldDirRef = useRef(0);
  const driveVelRef = useRef(0);
  const treadRef = useRef(0);
  const movedRef = useRef(0);
  const debrisRef = useRef([]);
  const dustRef = useRef([]);
  const smokeTickRef = useRef(0);

  stateRef.current = room.state;
  uiRef.current = { angle, power, you: youAreIndex, myTurn };
  angleRef.current = angle;
  powerRef.current = power;
  canFireRef.current = canFire;
  onMoveRef.current = onMove;

  const fire = () => {
    if (!canFireRef.current) return;
    heldDirRef.current = 0;
    setBusy(true);
    onMoveRef.current({
      angle: angleRef.current,
      power: powerRef.current,
      x: Math.round(localXRef.current),
    });
  };
  fireRef.current = fire;

  // new server shot -> animate it (keep showing pre-crater terrain until impact)
  useEffect(() => {
    const st = room.state;
    if (st.lastShot && st.seq !== lastSeqRef.current) {
      lastSeqRef.current = st.seq;
      animRef.current = {
        active: true,
        phase: 'fly',
        i: 0,
        speed: Math.max(0.8, st.lastShot.path.length / 55),
        path: st.lastShot.path,
        impact: st.lastShot.impact,
        crater: st.lastShot.crater,
        boom: 0,
        carved: false,
      };
      setBusy(true);
    } else if (!st.lastShot) {
      lastSeqRef.current = st.seq ?? 0;
      groundRef.current = st.ground.slice();
    }
  }, [room.state]);

  // when a fresh turn becomes mine, snap local position to my tank and refuel
  useEffect(() => {
    if (myTurn && !wasMyTurnRef.current) {
      localXRef.current = room.state.tanks[youAreIndex].x;
      driveVelRef.current = 0;
      movedRef.current = 0;
      setMoved(0);
    }
    wasMyTurnRef.current = myTurn;
  }, [myTurn, room.state, youAreIndex]);

  // keyboard controls
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { fireRef.current(); e.preventDefault(); return; }
      if (!canFireRef.current) return;
      const big = e.shiftKey ? 5 : 1;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowUp') { setAngle((a) => clamp(a + big, 1, 89)); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { setAngle((a) => clamp(a - big, 1, 89)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setPower((p) => clamp(p + big, 5, 100)); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { setPower((p) => clamp(p - big, 5, 100)); e.preventDefault(); }
      else if (k === 'a') { heldDirRef.current = -1; e.preventDefault(); }
      else if (k === 'd') { heldDirRef.current = 1; e.preventDefault(); }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'd') heldDirRef.current = 0;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // render + simulation loop (mount once)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();

    const finishAnim = () => {
      animRef.current.active = false;
      groundRef.current = stateRef.current.ground.slice(); // snap to authoritative
      setBusy(false);
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      let dt = (now - last) / 16.6667;
      last = now;
      if (dt > 3) dt = 3;
      const st = stateRef.current;

      // ---- driving (only on our turn, while not animating) ----
      if (canFireRef.current) {
        const dir = heldDirRef.current;
        if (dir !== 0) driveVelRef.current = clamp(driveVelRef.current + dir * DRIVE_ACCEL * dt, -MAX_DRIVE, MAX_DRIVE);
        else driveVelRef.current *= Math.pow(DRIVE_FRICTION, dt);
        if (Math.abs(driveVelRef.current) > 0.02) {
          const startX = st.tanks[youAreIndex].x;
          let nx = localXRef.current + driveVelRef.current * dt;
          const lo = Math.max(EDGE, startX - budget);
          const hi = Math.min(st.W - EDGE, startX + budget);
          if (nx < lo) { nx = lo; driveVelRef.current = 0; }
          if (nx > hi) { nx = hi; driveVelRef.current = 0; }
          treadRef.current += Math.abs(nx - localXRef.current);
          // kick up dust at the rear
          if (Math.abs(driveVelRef.current) > 0.6 && Math.random() < 0.4) {
            const gy = gAt(groundRef.current, st.step, nx);
            dustRef.current.push({ x: nx - Math.sign(driveVelRef.current) * 14, y: gy - 3,
              vx: -driveVelRef.current * 0.2 + (Math.random() - 0.5), vy: -0.4 - Math.random() * 0.5,
              life: 22, r: 2 + Math.random() * 2, smoke: false });
          }
          localXRef.current = nx;
          const rmd = Math.round(Math.abs(nx - startX));
          if (rmd !== movedRef.current) { movedRef.current = rmd; setMoved(rmd); }
        }
      }

      // ---- shell animation ----
      const anim = animRef.current;
      if (anim.active) {
        if (anim.phase === 'fly') {
          anim.i += anim.speed * dt;
          if (anim.i >= anim.path.length - 1) {
            anim.i = anim.path.length - 1;
            anim.phase = 'boom';
            anim.boom = 0;
            hpTargetRef.current = st.tanks.map((t) => t.hp);
            if (anim.crater && !anim.carved) {
              carveLocal(groundRef.current, st.step, anim.crater.x, anim.crater.y, anim.crater.r, st.H);
              spawnDebris(anim.crater);
              anim.carved = true;
            }
          }
        } else if (anim.phase === 'boom') {
          anim.boom += dt;
          if (anim.boom > 28) finishAnim();
        }
      }

      // ---- hp lerp ----
      for (let k = 0; k < 2; k++) {
        const tgt = hpTargetRef.current[k] ?? 0;
        const cur = displayHpRef.current[k];
        displayHpRef.current[k] = Math.abs(tgt - cur) < 0.5 ? tgt : cur + (tgt - cur) * 0.22;
      }

      // ---- wreck smoke ----
      smokeTickRef.current += dt;
      if (smokeTickRef.current > 5) {
        smokeTickRef.current = 0;
        for (let i = 0; i < 2; i++) {
          if (st.tanks[i].hp <= 0) {
            const gy = gAt(groundRef.current, st.step, st.tanks[i].x);
            dustRef.current.push({ x: st.tanks[i].x + (Math.random() - 0.5) * 8, y: gy - 14,
              vx: (Math.random() - 0.5) * 0.4, vy: -0.7 - Math.random() * 0.4,
              life: 60, r: 4 + Math.random() * 3, smoke: true });
          }
        }
      }

      stepParticles(dt);
      draw(ctx, canvas, st, now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = (dir) => () => { if (canFireRef.current) heldDirRef.current = dir; };
  const release = () => { heldDirRef.current = 0; };

  const statusLabel = room.status === 'over' ? 'CEASE FIRE' : busy ? 'INCOMING' : myTurn ? 'YOUR SHOT' : 'OPPONENT';

  return (
    <div className="art-wrap">
      <canvas ref={canvasRef} className="art-canvas" />
      <div className="art-console">
        <div className="art-console-head">
          <span className="art-title">⌖ FIRE CONTROL</span>
          <span className={`art-badge ${myTurn && !busy ? 'live' : ''}`}>{statusLabel}</span>
        </div>
        <div className="art-grid">
          <div className="art-cell">
            <span className="art-label">Angle</span>
            <div className="art-anglewrap">
              <AngleDial angle={angle} color={accent} />
              <span className="art-readout">{angle}°</span>
            </div>
            <input className="art-slider" type="range" min="1" max="89" value={angle} disabled={!canFire}
              onChange={(e) => setAngle(Number(e.target.value))} />
          </div>

          <div className="art-cell">
            <span className="art-label">Power</span>
            <div className="art-meter"><span className="art-meter-fill" style={{ width: `${power}%` }} /></div>
            <span className="art-readout">{power}</span>
            <input className="art-slider" type="range" min="5" max="100" value={power} disabled={!canFire}
              onChange={(e) => setPower(Number(e.target.value))} />
          </div>

          <div className="art-cell">
            <span className="art-label">Fuel</span>
            <div className="art-meter fuel"><span className="art-meter-fill" style={{ width: `${(fuelLeft / budget) * 100}%` }} /></div>
            <span className="art-readout">{fuelLeft}</span>
            <div className="art-drive">
              <button type="button" className="art-mv" disabled={!canFire}
                onPointerDown={press(-1)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}>◀</button>
              <button type="button" className="art-mv" disabled={!canFire}
                onPointerDown={press(1)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}>▶</button>
            </div>
          </div>

          <button className="art-fire" type="button" disabled={!canFire} onClick={fire}>
            <span>🔥</span> FIRE
          </button>
        </div>
      </div>
      <p className="art-hint muted">
        <b>A/D</b> or ◀ ▶ drive · <b>↑/↓</b> angle · <b>←/→</b> power (<b>Shift</b> ×5) · <b>Space</b> fire.
        Mind the wind, dig in, and deplete your opponent's health to win.
      </p>
    </div>
  );

  // ---------- particles ----------
  function spawnDebris(crater) {
    for (let i = 0; i < 20; i++) {
      const ang = -Math.PI * (0.12 + Math.random() * 0.76); // upward fan
      const spd = 2 + Math.random() * 6;
      debrisRef.current.push({
        x: crater.x + (Math.random() - 0.5) * crater.r * 0.6,
        y: crater.y - Math.random() * 6,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 30 + Math.random() * 20, size: 1.5 + Math.random() * 3,
        col: Math.random() < 0.5 ? '#4a3a26' : '#5e4a30',
      });
    }
  }
  function stepParticles(dt) {
    const d = debrisRef.current;
    for (let i = d.length - 1; i >= 0; i--) {
      const p = d[i];
      p.vy += GRAVITY * 1.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) d.splice(i, 1);
    }
    const du = dustRef.current;
    for (let i = du.length - 1; i >= 0; i--) {
      const p = du[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.smoke ? -0.012 : 0.02) * dt; p.life -= dt;
      if (p.smoke) p.r += 0.08 * dt;
      if (p.life <= 0) du.splice(i, 1);
    }
    if (d.length > 200) d.splice(0, d.length - 200);
    if (du.length > 120) du.splice(0, du.length - 120);
  }

  // ---------- rendering ----------
  function draw(ctx, canvas, st, now) {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    const s = cw / st.W;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    const W = st.W, H = st.H;
    const ground = groundRef.current;
    const step = st.step;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#16243a');
    sky.addColorStop(0.6, '#274055');
    sky.addColorStop(1, '#3c5a4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // sun
    const sx = W * 0.82, sy = H * 0.2;
    const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90);
    sg.addColorStop(0, 'rgba(255,225,150,0.9)');
    sg.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe39a';
    ctx.fill();

    // terrain
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < ground.length; i++) ctx.lineTo(i * step, ground[i]);
    ctx.lineTo(W, H);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, H * 0.4, 0, H);
    gg.addColorStop(0, '#3c6b43');
    gg.addColorStop(1, '#1f3322');
    ctx.fillStyle = gg;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < ground.length; i++) {
      const x = i * step;
      i === 0 ? ctx.moveTo(x, ground[i]) : ctx.lineTo(x, ground[i]);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8bd450';
    ctx.lineJoin = 'round';
    ctx.stroke();

    drawWind(ctx, W, st.wind);

    // tanks + HP (local tank shown at its driven position while it's our turn)
    const ui = uiRef.current;
    for (let i = 0; i < st.tanks.length; i++) {
      const tx = i === ui.you && ui.myTurn ? localXRef.current : st.tanks[i].x;
      const gy = gAt(ground, step, tx);
      const sl = slopeAt(ground, step, tx);
      let aimA = 45;
      if (i === ui.you && ui.myTurn && !animRef.current.active) aimA = ui.angle;
      else if (st.lastShot && st.lastShot.by === i) aimA = st.lastShot.angle;
      const wrecked = displayHpRef.current[i] <= 0.5;
      drawTank(ctx, tx, gy, i, aimA, sl, treadRef.current, wrecked);
      drawHpBar(ctx, tx, gy, displayHpRef.current[i], st.maxHp, i);
    }

    if (ui.myTurn && !animRef.current.active) {
      drawAimGuide(ctx, ground, step, st.W, st.wind, ui.you, localXRef.current, ui.angle, ui.power);
    }

    // particles
    for (const p of debrisRef.current) {
      ctx.globalAlpha = Math.min(1, p.life / 12);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const p of dustRef.current) {
      ctx.globalAlpha = Math.min(0.5, p.life / (p.smoke ? 80 : 40));
      ctx.fillStyle = p.smoke ? '#3a3a3a' : '#b8a583';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // shell / explosion
    const anim = animRef.current;
    if (anim.active) {
      if (anim.phase === 'fly') drawShell(ctx, anim);
      else drawBoom(ctx, anim.impact, anim.boom);
    }
  }

  function drawWind(ctx, W, wind) {
    const cx = W / 2, cy = 30;
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillStyle = '#cfe0ff';
    ctx.textAlign = 'center';
    ctx.fillText('WIND', cx, cy - 10);
    const mag = Math.min(1, Math.abs(wind) / 0.045);
    const len = 12 + mag * 60;
    const dir = wind >= 0 ? 1 : -1;
    ctx.strokeStyle = wind === 0 ? '#7f8ba3' : '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - (len / 2) * dir, cy);
    ctx.lineTo(cx + (len / 2) * dir, cy);
    ctx.stroke();
    if (wind !== 0) {
      const tip = cx + (len / 2) * dir;
      ctx.beginPath();
      ctx.moveTo(tip, cy);
      ctx.lineTo(tip - 8 * dir, cy - 5);
      ctx.lineTo(tip - 8 * dir, cy + 5);
      ctx.closePath();
      ctx.fillStyle = '#ffd24a';
      ctx.fill();
    }
    ctx.textAlign = 'left';
  }

  function drawTank(ctx, x, gy, idx, aimDeg, slope, tread, wrecked) {
    const color = wrecked ? '#5a5a52' : COLORS[idx];
    const dir = idx === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, gy);

    // tilted chassis
    ctx.save();
    ctx.rotate(slope);
    // treads
    ctx.fillStyle = '#15171f';
    rrect(ctx, -22, -7, 44, 8, 4); ctx.fill();
    // wheels with a spinning spoke
    ctx.fillStyle = '#0d0f14';
    for (const wx of [-15, -5, 5, 15]) {
      ctx.beginPath(); ctx.arc(wx, -3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a2d38'; ctx.lineWidth = 1;
      const sp = tread / 4 + wx;
      ctx.beginPath();
      ctx.moveTo(wx, -3); ctx.lineTo(wx + Math.cos(sp) * 3, -3 + Math.sin(sp) * 3);
      ctx.stroke();
    }
    // body + turret
    ctx.fillStyle = color;
    rrect(ctx, -18, -16, 36, 11, 5); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -16, 8, Math.PI, 0); ctx.fill();
    if (wrecked) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(ctx, -18, -16, 36, 11, 5); ctx.fill();
    }
    ctx.restore();

    // barrel at absolute aim angle, anchored at the (tilted) turret
    const tcx = Math.sin(slope) * 15;
    const tcy = -Math.cos(slope) * 15;
    const rad = (aimDeg * Math.PI) / 180;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tcx, tcy);
    ctx.lineTo(tcx + Math.cos(rad) * BARREL * dir, tcy - Math.sin(rad) * BARREL);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  function drawHpBar(ctx, x, gy, hp, maxHp, idx) {
    const w = 44, h = 6, y = gy - 42;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - w / 2, y, w, h);
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = frac > 0.5 ? '#5fd17a' : frac > 0.25 ? '#ffce4a' : '#ff5d6c';
    ctx.fillRect(x - w / 2, y, w * frac, h);
    ctx.strokeStyle = COLORS[idx];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, y, w, h);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#eef3ff';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(hp)), x, y - 4);
    ctx.textAlign = 'left';
  }

  function drawAimGuide(ctx, ground, step, mapW, wind, you, tankX, angle, power) {
    const dir = you === 0 ? 1 : -1;
    const rad = (angle * Math.PI) / 180;
    const speed = power * SPEED_K;
    let vx = Math.cos(rad) * speed * dir;
    let vy = -Math.sin(rad) * speed;
    const baseY = gAt(ground, step, tankX) - TANK_R;
    let x = tankX + Math.cos(rad) * BARREL * dir;
    let y = baseY - Math.sin(rad) * BARREL;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let s2 = 0; s2 < 60; s2++) {
      vx += wind; vy += GRAVITY; x += vx; y += vy;
      if (s2 % 6 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (x < 0 || x > mapW || y >= gAt(ground, step, x)) break;
    }
  }

  function drawShell(ctx, anim) {
    const p = anim.path;
    const i = Math.floor(anim.i);
    const f = anim.i - i;
    const a = p[i];
    const b = p[Math.min(i + 1, p.length - 1)];
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    ctx.strokeStyle = 'rgba(255,210,120,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const from = Math.max(0, i - 8);
    ctx.moveTo(p[from].x, p[from].y);
    for (let k = from + 1; k <= i; k++) ctx.lineTo(p[k].x, p[k].y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe39a';
    ctx.fill();
  }

  function drawBoom(ctx, impact, t) {
    if (!impact) return;
    const r = 8 + t * 3.4;
    const alpha = Math.max(0, 1 - t / 28);
    const g = ctx.createRadialGradient(impact.x, impact.y, 2, impact.x, impact.y, r);
    g.addColorStop(0, `rgba(255,240,180,${alpha})`);
    g.addColorStop(0.5, `rgba(255,140,60,${alpha * 0.8})`);
    g.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(impact.x, impact.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
}
