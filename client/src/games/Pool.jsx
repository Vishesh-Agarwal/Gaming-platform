// Pool — 2-player cue sports. Server simulates each shot; this renders the table,
// takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { predictShot } from './aimPredict.js';
import ShotClock from './ShotClock.jsx';

const VIEW_W = 900;                 // on-screen width; logical table is 1000x500 (2:1)
const PALETTE = ['#e7b416', '#2f6fd0', '#d8453a', '#7d3cc0', '#e07b2c', '#2f9e54', '#8a3324'];
const PULL_MAX = 320;               // logical drag length that maps to full power
const MIN_FIRE = 8;
const BLITZ_MS = 20000;
const PREDICT_CUE_LEN = 190;
const PREDICT_OBJECT_LEN = 70;

// A pool ball's id IS its number, so color + stripe derive straight from the id.
function ballBase(id) {
  if (id === 0) return '#f4f0e6';        // cue
  if (id === 8) return '#222';           // 8 ball
  if (id < 8) return PALETTE[id - 1];    // solids 1-7
  return PALETTE[id - 9];                // stripes 9-15 share the solid colors
}
const isStripe = (id) => id >= 9;

function aimForViewVector(vector, flip) {
  const visual = { dx: -vector.dx, dy: -vector.dy };
  return flip ? { dx: -visual.dx, dy: -visual.dy } : visual;
}

function shotFromCueDrag(vector, flip) {
  const dist = Math.hypot(vector.dx, vector.dy);
  const power = Math.max(0, Math.min(100, Math.round((dist / PULL_MAX) * 100)));
  return { aim: aimForViewVector(vector, flip), power };
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <rect x="6" y="20" width="88" height="60" rx="8" fill="#5a3a20" />
      <rect x="12" y="26" width="76" height="48" rx="4" fill="#1f7a4d" />
      {[[16, 30], [50, 28], [84, 30], [16, 70], [50, 72], [84, 70]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4.5" fill="#0c1f16" />
      ))}
      <circle cx="34" cy="50" r="5" fill="#f4f0e6" />
      <circle cx="50" cy="50" r="5" fill="#2a2a2a" />
      <circle cx="62" cy="46" r="5" fill="#e4b53a" />
      <circle cx="62" cy="55" r="5" fill="#d8453a" />
    </svg>
  );
}

export default function Pool({ room, youAreIndex, onMove }) {
  const st = room.state;
  const scale = VIEW_W / st.W;
  const viewH = st.H * scale;
  const canvasRef = useRef(null);
  const myTurn = st.turn === youAreIndex && room.status === 'playing';
  const canPlace = myTurn && (st.ballInHand || st.onBreak);
  const flip = youAreIndex === 1; // player 2 views the table rotated 180° (plays from the bottom)

  const [aim, setAim] = useState(null);          // { dx, dy } pointing from the cue
  const [power, setPower] = useState(0);
  const [spin, setSpin] = useState({ along: 0, side: 0 }); // english: follow/draw + side
  const [cuePlace, setCuePlace] = useState(null); // local cue placement when ball-in-hand/break
  const [dragging, setDragging] = useState(null); // 'cue' | 'pull' | null
  const baseCue = useMemo(() => cuePlace || st.cue, [cuePlace, st.cue, st.seq]);
  const bounds = useMemo(() => ({ loX: 46, hiX: st.W - 46, loY: 46, hiY: st.H - 46 }), [st.W, st.H]);
  const objectBalls = useMemo(() => st.balls.filter((b) => b.id !== 0).map((b) => ({ ...b, r: st.ballR })), [st.balls, st.ballR]);

  // replay
  const [frameIdx, setFrameIdx] = useState(null);
  const [banner, setBanner] = useState(null);
  const lastSeq = useRef(st.seq);
  const rafRef = useRef(0);

  useEffect(() => {
    if (room.status !== 'playing') return;
    const foul = st.lastShot?.foul;
    const msg = foul
      ? (foul === 'timeout' ? '⏱ Time out!' : 'Foul — ball in hand')
      : (myTurn ? 'Your shot' : null);
    if (!msg) return;
    setBanner({ msg, foul: !!foul, key: st.seq });
    const id = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(id);
  }, [st.seq, myTurn, room.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (st.seq === lastSeq.current) return;
    lastSeq.current = st.seq;
    setAim(null); setPower(0); setCuePlace(null); setSpin({ along: 0, side: 0 });
    const frames = st.lastShot?.frames;
    if (!frames || frames.length === 0) { setFrameIdx(null); return; }
    let i = 0; setFrameIdx(0);
    const tick = () => {
      i += 1;
      if (i >= frames.length) { setFrameIdx(null); return; }
      setFrameIdx(i);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [st.seq]);

  // draw
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    ctx.scale(scale, scale);
    if (flip) { ctx.translate(st.W, st.H); ctx.rotate(Math.PI); } // rotate 180° for player 2
    drawTable(ctx, st);
    const playing = frameIdx != null && st.lastShot?.frames;
    if (playing) {
      for (const d of st.lastShot.frames[frameIdx]) drawBall(ctx, d.x, d.y, d.id, st.ballR);
    } else {
      for (const b of st.balls) if (b.id !== 0) drawBall(ctx, b.x, b.y, b.id, st.ballR);
      if (canPlace) { ctx.save(); ctx.strokeStyle = 'rgba(45,212,191,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(baseCue.x, baseCue.y, st.ballR + 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      drawBall(ctx, baseCue.x, baseCue.y, 0, st.ballR);
      if (myTurn && aim && (aim.dx || aim.dy)) {
        const pred = predictShot(baseCue, { x: aim.dx, y: aim.dy }, objectBalls, st.ballR, bounds, 0);
        drawPrediction(ctx, pred, st.ballR, predictionAllowedForHit(st, youAreIndex, pred.hit?.ball));
        drawCueStick(ctx, baseCue, aim, power, st.ballR);
      }
    }
    ctx.restore();
  }, [st, frameIdx, aim, power, baseCue, myTurn, canPlace, scale, objectBalls, bounds, flip]);

  // Map a pointer event to logical table coords (robust to CSS scaling + the flip).
  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    let x = (e.clientX - r.left) * (st.W / r.width);
    let y = (e.clientY - r.top) * (st.H / r.height);
    if (flip) { x = st.W - x; y = st.H - y; }
    return { x, y };
  };
  const cuePullFrom = (vector) => shotFromCueDrag(vector, flip);
  const aimFromPoint = (p) => ({ dx: p.x - baseCue.x, dy: p.y - baseCue.y });
  const onDown = (e) => {
    if (!myTurn || frameIdx != null) return;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const p = toLogical(e);
    const onCue = Math.hypot(p.x - baseCue.x, p.y - baseCue.y) < st.ballR * 2.2;
    if (canPlace && onCue) { setDragging('cue'); return; }
    setDragging('aim');
    setAim(aimFromPoint(p));
    setPower(0);
  };
  const onMoveP = (e) => {
    if (!myTurn || frameIdx != null) return;
    const p = toLogical(e);
    if (dragging === 'cue') {
      const m = st.ballR + 4;
      const hiX = st.onBreak ? st.W / 2 - st.ballR : st.W - m;
      setCuePlace({ x: Math.max(m, Math.min(hiX, p.x)), y: Math.max(m, Math.min(st.H - m, p.y)) });
      return;
    }
    if (dragging === 'aim') {
      setAim(aimFromPoint(p));
    }
  };
  const onUp = () => setDragging(null);

  const doShoot = (a, pw) => {
    if (!myTurn || !a || (a.dx === 0 && a.dy === 0)) return;
    onMove({ dx: a.dx, dy: a.dy, power: pw, spin, ...(cuePlace ? { cue: cuePlace } : {}) });
    setAim(null);
    setPower(0);
  };

  const oppIdx = 1 - youAreIndex;
  const blitz = st.mode === 'blitz';

  return (
    <div className="pool">
      <Scoreboard st={st} room={room} you={youAreIndex} opp={oppIdx} myTurn={myTurn} blitz={blitz} />

      <div className="pool-playfield">
        {myTurn && frameIdx == null && (
          <PoolPowerStick
            power={power}
            disabled={!aim}
            cuePullFrom={cuePullFrom}
            onPreview={(pw) => setPower(pw)}
            onFire={(pw) => doShoot(aim, pw)}
          />
        )}
        <div className="board-wrap">
          <canvas
            ref={canvasRef}
            width={VIEW_W}
            height={viewH}
            className="pool-canvas"
            onPointerDown={onDown}
            onPointerMove={onMoveP}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {banner && <div key={banner.key} className={`game-banner ${banner.foul ? 'foul' : 'turn'}`}>{banner.msg}</div>}
        </div>
      </div>

      {myTurn && frameIdx == null && (
        <div className="pool-controls">
          <SpinPad spin={spin} onChange={setSpin} />
          <span className="pool-hint muted">
            {canPlace
              ? 'Place the cue ball, aim on the table, then pull the side stick.'
              : 'Aim on the table, pull the side stick, and release.'}
          </span>
        </div>
      )}
    </div>
  );
}

// Two-player panel with a captured-balls tray (8-ball), shared rack (9-ball), or score (practice).
function Scoreboard({ st, room, you, opp, myTurn, blitz }) {
  const name = (i) => room.players?.find((p) => p.index === i)?.username || (i === you ? 'You' : 'Opponent');
  const onTable = useMemo(() => new Set(st.balls.map((b) => b.id)), [st.balls]);
  const nineball = st.mode === 'nineball';
  const practice = st.mode === 'practice';
  const groupIds = (g) => (g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : g === 'stripe' ? [9, 10, 11, 12, 13, 14, 15] : []);

  const Panel = ({ i, mine }) => {
    const active = st.turn === i && room.status === 'playing';
    const group = st.groups?.[i];
    const ids = groupIds(group);
    const cleared = ids.length > 0 && ids.every((id) => !onTable.has(id));
    return (
      <div className={`sb-panel ${active ? 'active' : ''}`}>
        <div className="sb-top"><span className="sb-name">{mine ? 'You' : name(i)}</span></div>
        <div className="sb-meta">
          {practice ? <>Score <b>{st.scores[i]}</b></>
            : nineball ? (active ? 'shooting' : 'waiting')
              : group ? <span className="sb-cap">{group}s {cleared ? '· on the 8' : ''}</span> : 'open table'}
        </div>
        {!practice && !nineball && group && (
          <div className="sb-tray">
            {ids.map((id) => <MiniBall key={id} id={id} potted={!onTable.has(id)} />)}
            <MiniBall id={8} potted={!onTable.has(8)} target={cleared} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="scoreboard">
      <Panel i={you} mine />
      <div className="sb-center">
        {blitz && <ShotClock endsAt={room.turnEndsAt} totalMs={BLITZ_MS} active={myTurn} />}
        {nineball
          ? <div className="sb-tray">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => <MiniBall key={id} id={id} potted={!onTable.has(id)} />)}</div>
          : <span className="sb-vs">vs</span>}
      </div>
      <Panel i={opp} />
    </div>
  );
}

function MiniBall({ id, potted, target }) {
  const base = ballBase(id);
  const style = isStripe(id)
    ? { background: `linear-gradient(#fff 28%, ${base} 28%, ${base} 72%, #fff 72%)` }
    : { background: base };
  return (
    <span className={`sb-ball ${potted ? 'potted' : ''} ${target ? 'target' : ''}`} style={style} title={`${id} ball`}>
      <span className="sb-ball-num">{id}</span>
    </span>
  );
}

function drawTable(ctx, st) {
  ctx.fillStyle = '#101a33';
  ctx.fillRect(0, 0, st.W, st.H);
  ctx.fillStyle = '#4b2119';
  ctx.fillRect(18, 18, st.W - 36, st.H - 36);
  ctx.fillStyle = '#70d7d5';
  ctx.fillRect(34, 34, st.W - 68, st.H - 68);
  drawRailInlays(ctx, st);
  ctx.fillStyle = '#1d6b62';
  ctx.fillRect(36, 36, st.W - 72, st.H - 72);
  drawFeltPattern(ctx, st);
  ctx.fillStyle = '#123f3a';
  ctx.fillRect(62, 62, st.W - 124, 22);
  ctx.fillRect(62, st.H - 84, st.W - 124, 22);
  ctx.fillRect(62, 62, 22, st.H - 124);
  ctx.fillRect(st.W - 84, 62, 22, st.H - 124);
  ctx.fillStyle = '#0c1f16';
  for (const p of st.pockets) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, Math.PI * 2); ctx.fillStyle = '#54140f'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = '#040606'; ctx.fill();
  }
  // head string (kitchen line)
  ctx.strokeStyle = 'rgba(232,255,250,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(st.W / 4, 46); ctx.lineTo(st.W / 4, st.H - 46); ctx.stroke();
}

function drawRailInlays(ctx, st) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 246, 214, 0.78)';
  const marks = [190, 390, 610, 810];
  for (const x of marks) {
    ctx.fillRect(x - 48, 38, 96, 16);
    ctx.fillRect(x - 48, st.H - 54, 96, 16);
  }
  for (const y of [150, 350]) {
    ctx.fillRect(38, y - 40, 16, 80);
    ctx.fillRect(st.W - 54, y - 40, 16, 80);
  }
  ctx.fillStyle = 'rgba(19, 31, 48, 0.72)';
  for (const x of [250, 500, 750]) {
    ctx.beginPath(); ctx.arc(x, 54, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, st.H - 54, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFeltPattern(ctx, st) {
  ctx.save();
  ctx.strokeStyle = 'rgba(230, 255, 246, 0.035)';
  ctx.lineWidth = 1;
  for (let y = 78; y < st.H - 70; y += 34) {
    ctx.beginPath();
    for (let x = 72; x < st.W - 70; x += 26) {
      const yy = y + Math.sin(x * 0.035) * 5;
      if (x === 72) ctx.moveTo(x, yy);
      else ctx.quadraticCurveTo(x - 13, yy - 8, x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx, x, y, id, r) {
  // contact shadow
  ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();

  const base = ballBase(id);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (isStripe(id)) {
    ctx.fillStyle = '#f4f0e6'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.fillStyle = base; ctx.fillRect(x - r, y - r * 0.5, 2 * r, r);
  } else {
    ctx.fillStyle = base; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // spherical shading: bright highlight top-left, shadow bottom-right
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();

  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  if (id !== 0) {
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(r * 0.78)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id), x, y + 0.5);
  }
}

function drawCueStick(ctx, cue, aim, power, r) {
  const l = Math.hypot(aim.dx, aim.dy) || 1, ux = aim.dx / l, uy = aim.dy / l;
  const gap = r + 6 + power * 0.9;             // pulled back further at higher power
  const tip = { x: cue.x - ux * gap, y: cue.y - uy * gap };
  const butt = { x: tip.x - ux * 280, y: tip.y - uy * 280 };
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a5320'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(butt.x, butt.y); ctx.stroke();
  ctx.strokeStyle = '#d8b27a'; ctx.lineWidth = 7;                 // pale forearm
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - ux * 90, tip.y - uy * 90); ctx.stroke();
  ctx.strokeStyle = '#1f6fd0'; ctx.lineWidth = 7;                 // blue tip
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - ux * 9, tip.y - uy * 9); ctx.stroke();
  ctx.restore();
}

function pointAlong(a, b, maxLen) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const dist = Math.min(maxLen, len);
  return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist };
}

function predictionAllowedForHit(st, seat, ball) {
  if (!ball) return false;
  if (st.mode !== 'eightball' && st.mode !== 'blitz') return true;
  const myGroup = st.groups?.[seat];
  if (!myGroup) return ball.group === 'solid' || ball.group === 'stripe';
  const cleared = !st.balls.some((b) => b.group === myGroup);
  return cleared ? ball.group === 'eight' : ball.group === myGroup;
}

function drawPrediction(ctx, pred, r, showObjectLine = true) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([9, 7]);
  const start = pred.path[0];
  const end = pred.path[1] ? pointAlong(start, pred.path[1], PREDICT_CUE_LEN) : start;
  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
  ctx.stroke(); ctx.setLineDash([]);
  if (pred.hit) {
    const { ghost, ball, objDir } = pred.hit;
    if (showObjectLine) {
      ctx.beginPath(); ctx.arc(ghost.x, ghost.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + objDir.x * PREDICT_OBJECT_LEN, ball.y + objDir.y * PREDICT_OBJECT_LEN);
      ctx.strokeStyle = 'rgba(255,228,120,0.95)'; ctx.lineWidth = 2.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ghost.x, ghost.y, r * 0.75, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,93,108,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  ctx.restore();
}

function PoolPowerStick({ power, disabled, cuePullFrom, onPreview, onFire }) {
  const stickRef = useRef(null);
  const pullRef = useRef(null);

  const powerFrom = (event) => {
    const startY = pullRef.current?.startY;
    if (startY == null) return 0;
    const rect = stickRef.current.getBoundingClientRect();
    const dy = Math.max(0, Math.min(rect.height - 34, event.clientY - startY));
    const vector = { dx: 0, dy };
    const shot = cuePullFrom(vector);
    const pw = shot.power;
    pullRef.current.power = pw;
    onPreview(pw);
    return pw;
  };

  const releasePowerStick = () => {
    const pw = pullRef.current?.power || 0;
    pullRef.current = null;
    onPreview(0);
    if (!disabled && pw >= MIN_FIRE) onFire(pw);
  };

  const cancelPowerStick = () => {
    pullRef.current = null;
    onPreview(0);
  };

  const down = (event) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = stickRef.current.getBoundingClientRect();
    pullRef.current = { startY: Math.min(event.clientY, rect.top + 18), power: 0 };
  };

  return (
    <div
      ref={stickRef}
      className={`pool-power-stick${disabled ? ' disabled' : ''}`}
      role="slider"
      aria-label="Shot power"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={power}
      aria-disabled={disabled}
      style={{ '--power': `${power}%` }}
      onPointerDown={down}
      onPointerMove={(event) => { if (pullRef.current) powerFrom(event); }}
      onPointerUp={releasePowerStick}
      onPointerCancel={cancelPowerStick}
    >
      <span className="pool-power-fill" />
      <span className="pool-power-grip" />
    </div>
  );
}

// Click/drag the cue-ball widget to set english (where the tip strikes the ball).
function SpinPad({ spin, onChange }) {
  const ref = useRef(null);
  const set = (e) => {
    const b = ref.current.getBoundingClientRect();
    let nx = (e.clientX - (b.left + b.width / 2)) / (b.width / 2);
    let ny = (e.clientY - (b.top + b.height / 2)) / (b.height / 2);
    const m = Math.hypot(nx, ny); if (m > 1) { nx /= m; ny /= m; }
    onChange({ along: -ny, side: nx }); // up = follow (topspin), down = draw
  };
  const label = spin.along === 0 && spin.side === 0
    ? 'centre'
    : `${spin.along > 0.15 ? 'follow' : spin.along < -0.15 ? 'draw' : ''}${Math.abs(spin.side) > 0.15 ? (spin.along ? ' + ' : '') + (spin.side > 0 ? 'right' : 'left') : ''}` || 'centre';
  return (
    <div className="pool-spin-wrap">
      <div
        className="pool-spin"
        ref={ref}
        title="Spin (english): click where the cue tip strikes the ball"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={(e) => { if (e.buttons) set(e); }}
      >
        <span className="pool-spin-cross" />
        <span className="pool-spin-dot" style={{ left: `${50 + spin.side * 42}%`, top: `${50 - spin.along * 42}%` }} />
      </div>
      <span className="pool-spin-label">{label}</span>
    </div>
  );
}
