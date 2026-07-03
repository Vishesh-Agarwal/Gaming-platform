// Pool — 2-player cue sports. Server simulates each shot; this renders the table,
// takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { predictShot } from './aimPredict.js';
import { createRollState, advanceRoll, rollFor } from './poolRoll.js';
import { createPoolAudio, clamp01 } from './poolAudio.js';
import ShotClock from './ShotClock.jsx';

const VIEW_W = 900;                 // on-screen width; logical table is 1000x500 (2:1)
const PALETTE = ['#e7b416', '#2f6fd0', '#d8453a', '#7d3cc0', '#e07b2c', '#2f9e54', '#8a3324'];
const PULL_MAX = 320;               // logical drag length that maps to full power
const MIN_FIRE = 8;
const BLITZ_MS = 20000;
const PREDICT_CUE_LEN = 190;
const PREDICT_OBJECT_LEN = 70;
const SINK_FRAMES = 10;             // replay frames a potted ball takes to sink
const STRIKE_MS = 130;              // cue thrust animation before the replay

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
  const rollRef = useRef(createRollState()); // per-ball roll during the replay
  const rollFrameRef = useRef(-1);
  const sinksRef = useRef([]);               // cosmetic pocket-sink animations
  const lastFireRef = useRef(null);          // { aim, power } captured when WE fire
  const [strike, setStrike] = useState(null); // { t: 0..1 } cue thrust phase
  const strikeRafRef = useRef(0);
  const audioRef = useRef(null);
  useEffect(() => {
    audioRef.current = createPoolAudio();
    return () => audioRef.current?.dispose();
  }, []);

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
    rollRef.current = createRollState();
    rollFrameRef.current = -1;
    sinksRef.current = [];
    const frames = st.lastShot?.frames;
    if (!frames || frames.length === 0) { setFrameIdx(null); return; }

    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= frames.length) { setFrameIdx(null); return; }
      setFrameIdx(i);
      rafRef.current = requestAnimationFrame(tick);
    };
    const startReplay = () => {
      setStrike(null);
      setFrameIdx(0);
      rafRef.current = requestAnimationFrame(tick);
    };

    // Our own shot: thrust the cue into the ball first, then roll the replay.
    const fire = lastFireRef.current;
    lastFireRef.current = null;
    if (st.lastShot?.by === youAreIndex && fire) {
      const t0 = performance.now();
      const strikeTick = (now) => {
        const t = Math.min(1, (now - t0) / STRIKE_MS);
        setStrike({ t, ...fire });
        if (t < 1) strikeRafRef.current = requestAnimationFrame(strikeTick);
        else startReplay();
      };
      setStrike({ t: 0, ...fire });
      strikeRafRef.current = requestAnimationFrame(strikeTick);
    } else {
      startReplay();
    }
    return () => { cancelAnimationFrame(rafRef.current); cancelAnimationFrame(strikeRafRef.current); };
  }, [st.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // draw
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    ctx.scale(scale, scale);
    if (flip) { ctx.translate(st.W, st.H); ctx.rotate(Math.PI); } // rotate 180° for player 2
    drawTable(ctx, st);
    if (strike && st.lastShot?.frames?.length) {
      // Cue-thrust phase: pre-shot positions with the stick closing its gap.
      for (const d of st.lastShot.frames[0]) {
        if (d.id !== 0) drawBall(ctx, d.x, d.y, d.id, st.ballR);
      }
      const cue0 = st.lastShot.frames[0].find((d) => d.id === 0);
      if (cue0) {
        drawBall(ctx, cue0.x, cue0.y, 0, st.ballR);
        drawCueStick(ctx, cue0, strike.aim, strike.power * (1 - strike.t), st.ballR);
      }
      ctx.restore();
      return;
    }
    const playing = frameIdx != null && st.lastShot?.frames;
    if (playing) {
      if (rollFrameRef.current !== frameIdx) {
        advanceRoll(rollRef.current, st.lastShot.frames[frameIdx], st.ballR);
        rollFrameRef.current = frameIdx;
        // fire event sounds + queue pocket sinks the moment their frame arrives
        for (const e of st.lastShot.events || []) {
          if (e.f !== frameIdx) continue;
          audioRef.current?.play(e.type, clamp01(e.speed / 12));
          if (e.type === 'pocket') {
            const last = rollRef.current.get(e.id);
            const from = last ? { x: last.x, y: last.y } : null;
            if (from) {
              const pocket = st.pockets.reduce((best, p) =>
                (Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? p : best));
              sinksRef.current.push({ id: e.id, from, pocket, startF: frameIdx });
            }
          }
        }
      }
      for (const d of st.lastShot.frames[frameIdx]) {
        drawBall(ctx, d.x, d.y, d.id, st.ballR, rollFor(rollRef.current, d.id));
      }
      // cosmetic sinks: potted balls ease into the pocket, shrinking and fading
      for (const s of sinksRef.current) {
        const p = (frameIdx - s.startF) / SINK_FRAMES;
        if (p < 0 || p >= 1) continue;
        const ease = 1 - (1 - p) * (1 - p);
        const sx = s.from.x + (s.pocket.x - s.from.x) * ease;
        const sy = s.from.y + (s.pocket.y - s.from.y) * ease;
        ctx.save();
        ctx.globalAlpha = 1 - p * 0.7;
        drawBall(ctx, sx, sy, s.id, st.ballR * (1 - p * 0.75));
        ctx.restore();
      }
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
  }, [st, frameIdx, aim, power, baseCue, myTurn, canPlace, scale, objectBalls, bounds, flip, strike]);

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
    lastFireRef.current = { aim: { ...a }, power: pw }; // drives the strike animation
    audioRef.current?.play('cue', pw / 100);
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
  // surround (floor beneath the table edge)
  ctx.fillStyle = '#0b0f1c';
  ctx.fillRect(0, 0, st.W, st.H);

  // wooden outer frame with grain + inner gloss edge
  drawRailWood(ctx, st);

  // cushion band (rubber) between wood and cloth
  ctx.fillStyle = '#124b34';
  ctx.fillRect(34, 34, st.W - 68, st.H - 68);
  ctx.fillStyle = '#0e3d2a';
  ctx.fillRect(36, 36, st.W - 72, st.H - 72);

  // felt: deep green under an overhead lamp — bright pool of light in the
  // middle fading to darker edges, plus a corner vignette.
  ctx.fillStyle = '#1a6f4e';
  ctx.fillRect(46, 46, st.W - 92, st.H - 92);
  const lamp = ctx.createRadialGradient(st.W / 2, st.H * 0.42, 40, st.W / 2, st.H / 2, st.W * 0.62);
  lamp.addColorStop(0, 'rgba(255,250,220,0.14)');
  lamp.addColorStop(0.45, 'rgba(255,250,220,0.03)');
  lamp.addColorStop(1, 'rgba(2,12,8,0.38)');
  ctx.fillStyle = lamp;
  ctx.fillRect(46, 46, st.W - 92, st.H - 92);
  // corner vignette so the cloth reads as fabric under a single light
  const vignette = ctx.createRadialGradient(st.W / 2, st.H / 2, st.H * 0.55, st.W / 2, st.H / 2, st.W * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(46, 46, st.W - 92, st.H - 92);
  drawFeltPattern(ctx, st);

  // pockets with jaw depth
  for (const p of st.pockets) drawPocket(ctx, p);

  // head string (kitchen line) + foot spot
  ctx.strokeStyle = 'rgba(232,255,250,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(st.W / 4, 48); ctx.lineTo(st.W / 4, st.H - 48); ctx.stroke();
  ctx.beginPath(); ctx.arc(st.W * 0.75, st.H / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,255,250,0.25)'; ctx.fill();
}

// Wooden rails: warm base, along-rail grain strokes, a gloss highlight on the
// inner edge, and brass diamond sights at the standard rail positions.
function drawRailWood(ctx, st) {
  ctx.save();
  ctx.fillStyle = '#4a2c16';
  ctx.fillRect(14, 14, st.W - 28, st.H - 28);
  const woodLight = ctx.createLinearGradient(0, 14, 0, st.H - 14);
  woodLight.addColorStop(0, 'rgba(255,205,150,0.16)');
  woodLight.addColorStop(0.5, 'rgba(0,0,0,0.05)');
  woodLight.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = woodLight;
  ctx.fillRect(14, 14, st.W - 28, st.H - 28);
  // grain: long wavering strokes on the horizontal rails, short on verticals
  ctx.strokeStyle = 'rgba(30,14,4,0.35)';
  ctx.lineWidth = 1;
  for (const y0 of [20, 26, st.H - 27, st.H - 21]) {
    ctx.beginPath();
    for (let x = 20; x < st.W - 20; x += 24) {
      const yy = y0 + Math.sin(x * 0.05 + y0) * 1.6;
      if (x === 20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (const x0 of [20, 26, st.W - 27, st.W - 21]) {
    ctx.beginPath();
    for (let y = 20; y < st.H - 20; y += 24) {
      const xx = x0 + Math.sin(y * 0.05 + x0) * 1.6;
      if (y === 20) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  // gloss highlight along the inner wooden edge
  ctx.strokeStyle = 'rgba(255,232,190,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(33, 33, st.W - 66, st.H - 66);

  // brass diamond sights (3 per half-rail on the long rails, 1 mid short rail)
  ctx.fillStyle = '#d9b25c';
  const diamond = (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  };
  for (const x of [171, 296, 421, 579, 704, 829]) { diamond(x, 24); diamond(x, st.H - 24); }
  for (const y of [150, 250, 350]) { diamond(24, y); diamond(st.W - 24, y); }
  ctx.restore();
}

// A pocket that reads as a hole: leather-dark rim ring, black cavity, and an
// inner radial shadow for depth.
function drawPocket(ctx, p) {
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, Math.PI * 2);
  ctx.fillStyle = '#2b1409'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#120a05'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = '#020404'; ctx.fill();
  const depth = ctx.createRadialGradient(p.x, p.y - p.r * 0.35, p.r * 0.15, p.x, p.y, p.r);
  depth.addColorStop(0, 'rgba(40,48,46,0.5)');
  depth.addColorStop(0.6, 'rgba(6,10,9,0.2)');
  depth.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fillStyle = depth; ctx.fill();
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

// Draw a ball; `roll` ({angle, dirX, dirY} or null) slides the stripe band and
// number cap across the face so a moving ball visibly rolls (2.5D illusion —
// the light/shading stays fixed).
function drawBall(ctx, x, y, id, r, roll = null) {
  // contact shadow
  ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();

  const base = ballBase(id);
  const phase = roll ? Math.sin(roll.angle) : 0;        // -1..1 across the face
  const facing = roll ? Math.cos(roll.angle) : 1;       // 1 = cap dead centre
  const offX = roll ? roll.dirX * phase * r * 0.62 : 0;
  const offY = roll ? roll.dirY * phase * r * 0.62 : 0;

  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (isStripe(id)) {
    ctx.fillStyle = '#f4f0e6'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    // the stripe band slides with the vertical roll component and its
    // thickness breathes with the horizontal one, so it reads as rotating
    const th = roll ? r * (0.55 + 0.45 * Math.abs(facing)) : r;
    ctx.fillStyle = base;
    ctx.fillRect(x - r, y - th / 2 + offY, 2 * r, th);
  } else {
    ctx.fillStyle = base; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // number cap slides across the face and foreshortens toward the limb
  if (id !== 0 && (!roll || facing > -0.15)) {
    const capR = r * 0.5 * (roll ? Math.max(0.2, Math.sqrt(Math.max(0, 1 - (phase * 0.62) ** 2))) : 1);
    ctx.beginPath(); ctx.arc(x + offX, y + offY, capR, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    if (!roll || facing > 0.35) {
      ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(capR * 1.5)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id), x + offX, y + offY + 0.5);
    }
  }
  // spherical shading: bright highlight top-left, shadow bottom-right (fixed light)
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();

  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
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
