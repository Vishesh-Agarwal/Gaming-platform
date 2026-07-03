// Carrom — 2-player board game. Server simulates each flick; this renders the
// board, takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { predictShot } from './aimPredict.js';
import { createCarromAudio, clamp01 } from './poolAudio.js';
import PowerBar from './PowerBar.jsx';
import ShotClock from './ShotClock.jsx';

const VIEW = 620;          // on-screen canvas size (square); logical board is 900
const COLORS = { white: '#f4f0e6', black: '#2a2a2a', queen: '#e4453a', striker: '#5b8cff' };
const PULL_MAX = 240;      // logical drag length that maps to full power
const MIN_FIRE = 8;        // a pull below this just sets aim, doesn't fire
const BLITZ_MS = 20000;
const SINK_FRAMES = 10;    // replay frames a pocketed coin takes to sink

export function Thumbnail() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <rect x="6" y="6" width="88" height="88" rx="6" fill="#3a2a18" />
      <rect x="12" y="12" width="76" height="76" rx="3" fill="#caa46a" />
      {[[18, 18], [82, 18], [18, 82], [82, 82]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="6" fill="#1c140b" />
      ))}
      <circle cx="50" cy="50" r="16" fill="none" stroke="#9c7b46" strokeWidth="2" />
      <circle cx="50" cy="50" r="5" fill="#e4453a" />
      <circle cx="42" cy="50" r="4" fill="#f4f0e6" />
      <circle cx="58" cy="50" r="4" fill="#2a2a2a" />
    </svg>
  );
}

export default function Carrom({ room, youAreIndex, onMove }) {
  const st = room.state;
  const scale = VIEW / st.W;
  const canvasRef = useRef(null);
  const myTurn = st.turn === youAreIndex && room.status === 'playing';
  const flip = youAreIndex === 1; // player 2 views the board rotated 180° (plays from the bottom)

  // aim input state — the striker rests on the current shooter's baseline (the
  // server launches from baselineY(seat): bottom rail for seat 0, top for seat 1).
  const baselineY = useMemo(
    () => (st.turn === 0 ? st.H - 72 - st.strikerR - 14 : 72 + st.strikerR + 14),
    [st.H, st.strikerR, st.turn]
  );
  const bounds = useMemo(() => ({ loX: 72, hiX: st.W - 72, loY: 72, hiY: st.H - 72 }), [st.W, st.H]);
  const aimCoins = useMemo(() => st.coins.map((c) => ({ ...c, r: st.coinR })), [st.coins, st.coinR]);
  const [slotX, setSlotX] = useState(st.striker.x);
  const [aim, setAim] = useState(null);   // { dx, dy } pointing into the board
  const [power, setPower] = useState(55);
  const [locked, setLocked] = useState(false);    // click to freeze the aim
  const [dragging, setDragging] = useState(null); // 'striker' | 'slide' | 'aim' | null
  const gestureRef = useRef(null);                // live pull-back gesture details

  // A coin overlapping the striker's slot blocks the shot (matches the server rule).
  const strikerBlocked = useMemo(
    () => st.coins.some((c) => Math.hypot(c.x - slotX, c.y - baselineY) < st.coinR + st.strikerR),
    [st.coins, slotX, baselineY, st.coinR, st.strikerR]
  );

  // replay state
  const [frameIdx, setFrameIdx] = useState(null); // null = show resting state
  const [banner, setBanner] = useState(null);
  const lastSeq = useRef(st.seq);
  const rafRef = useRef(0);
  const lastPosRef = useRef(new Map());  // id -> {x, y, color} seen last frame
  const seenFrameRef = useRef(-1);
  const sinksRef = useRef([]);           // cosmetic pocket-sink animations
  const audioRef = useRef(null);
  useEffect(() => {
    audioRef.current = createCarromAudio();
    return () => audioRef.current?.dispose();
  }, []);

  // transient banner on turn change / foul
  useEffect(() => {
    if (room.status !== 'playing') return;
    const foul = st.lastShot?.foul;
    const msg = foul
      ? (foul === 'timeout' ? '⏱ Time out!' : foul === 'striker' ? 'Foul — striker pocketed' : 'Foul!')
      : (myTurn ? 'Your shot' : null);
    if (!msg) return;
    setBanner({ msg, foul: !!foul, key: st.seq });
    const id = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(id);
  }, [st.seq, myTurn, room.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a new shot arrives, play its frames.
  useEffect(() => {
    if (st.seq === lastSeq.current) return;
    lastSeq.current = st.seq;
    setSlotX(st.striker.x);
    setAim(null);
    setLocked(false);
    lastPosRef.current = new Map();
    seenFrameRef.current = -1;
    sinksRef.current = [];
    const frames = st.lastShot?.frames;
    if (!frames || frames.length === 0) { setFrameIdx(null); return; }
    let i = 0;
    setFrameIdx(0);
    const tick = () => {
      i += 1;
      if (i >= frames.length) { setFrameIdx(null); return; }
      setFrameIdx(i);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [st.seq]);

  // ---- drawing ----
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    ctx.scale(scale, scale);
    if (flip) { ctx.translate(st.W, st.H); ctx.rotate(Math.PI); } // rotate 180° for player 2
    drawBoard(ctx, st);

    const playing = frameIdx != null && st.lastShot?.frames;
    if (playing) {
      if (seenFrameRef.current !== frameIdx) {
        seenFrameRef.current = frameIdx;
        // event sounds + pocket-sink queueing, synced to this frame
        for (const e of st.lastShot.events || []) {
          if (e.f !== frameIdx) continue;
          audioRef.current?.play(e.type, clamp01(e.speed / 12));
          if (e.type === 'pocket') {
            const from = lastPosRef.current.get(e.id);
            if (from) {
              const pocket = st.pockets.reduce((best, p) =>
                (Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? p : best));
              sinksRef.current.push({ color: from.color, from, pocket, startF: frameIdx });
            }
          }
        }
        for (const d of st.lastShot.frames[frameIdx]) {
          lastPosRef.current.set(d.id, { x: d.x, y: d.y, color: d.color });
        }
      }
      for (const d of st.lastShot.frames[frameIdx]) drawDisc(ctx, d.x, d.y, d.color, st);
      // cosmetic sinks: pocketed coins ease into the pocket, shrinking and fading
      for (const s of sinksRef.current) {
        const p = (frameIdx - s.startF) / SINK_FRAMES;
        if (p < 0 || p >= 1) continue;
        const ease = 1 - (1 - p) * (1 - p);
        const sx = s.from.x + (s.pocket.x - s.from.x) * ease;
        const sy = s.from.y + (s.pocket.y - s.from.y) * ease;
        ctx.save();
        ctx.globalAlpha = 1 - p * 0.7;
        ctx.translate(sx, sy);
        ctx.scale(1 - p * 0.7, 1 - p * 0.7);
        drawDisc(ctx, 0, 0, s.color, st);
        ctx.restore();
      }
    } else {
      if (myTurn) drawBaseline(ctx, st, baselineY, slotX);
      for (const c of st.coins) drawDisc(ctx, c.x, c.y, c.color, st);
      // resting striker (and aim preview on your turn)
      drawDisc(ctx, slotX, baselineY, 'striker', st);
      if (myTurn && strikerBlocked) {
        ctx.beginPath(); ctx.arc(slotX, baselineY, st.strikerR + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,70,70,0.95)'; ctx.lineWidth = 4; ctx.stroke();
      } else if (myTurn && aim && (aim.dx || aim.dy)) {
        const pred = predictShot({ x: slotX, y: baselineY }, { x: aim.dx, y: aim.dy }, aimCoins, st.strikerR, bounds, 0);
        drawAim(ctx, pred, st);
        drawPull(ctx, slotX, baselineY, aim, power, st); // slingshot indicator behind the striker
      }
    }
    ctx.restore();
  }, [st, frameIdx, slotX, aim, power, myTurn, baselineY, scale, aimCoins, bounds, flip, strikerBlocked]);

  // ---- pointer input ----
  // Map a pointer event to logical board coords (robust to CSS scaling + the flip).
  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    let x = (e.clientX - r.left) * (st.W / r.width);
    let y = (e.clientY - r.top) * (st.H / r.height);
    if (flip) { x = st.W - x; y = st.H - y; }
    return { x, y };
  };
  const onDown = (e) => {
    if (!myTurn || frameIdx != null) return;
    // capture can throw (e.g. pointer already released) — aim must still work
    try { canvasRef.current.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    const p = toLogical(e);
    if (Math.hypot(p.x - slotX, p.y - baselineY) < st.strikerR * 1.8) {
      // grab the striker: drag sideways to slide, or pull back to aim+power
      gestureRef.current = { sx: p.x, sy: p.y, mode: null, shot: null };
      setDragging('striker');
      return;
    }
    updateAim(p);
    setLocked((l) => !l); // click empty board to lock the aim; click again to re-aim
  };
  const onMoveP = (e) => {
    if (!myTurn || frameIdx != null) return;
    const p = toLogical(e);
    const g = gestureRef.current;
    if (g) {
      if (!g.mode) {
        const dx = p.x - g.sx, dy = p.y - g.sy;
        if (Math.hypot(dx, dy) < 6) return;
        // mostly horizontal near the rail => slide; otherwise => pull-back aim
        g.mode = Math.abs(dy) < Math.abs(dx) * 0.45 ? 'slide' : 'aim';
        setDragging(g.mode);
      }
      if (g.mode === 'slide') {
        const lo = st.coinR + st.strikerR, hi = st.W - st.coinR - st.strikerR;
        setSlotX(Math.max(lo, Math.min(hi, p.x)));
        return;
      }
      // pull-back: shot fires opposite the pull; distance sets power
      const pdx = p.x - slotX, pdy = p.y - baselineY;
      const dist = Math.hypot(pdx, pdy);
      const pw = Math.max(5, Math.min(100, Math.round((dist / PULL_MAX) * 100)));
      const a = forceIntoBoard(-pdx, -pdy);
      g.shot = { aim: a, power: pw };
      setAim(a); setPower(pw); setLocked(true);
      return;
    }
    if (!locked) updateAim(p);
  };
  const onUp = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    setDragging(null);
    if (g?.mode === 'aim' && g.shot && g.shot.power >= MIN_FIRE && !strikerBlocked) {
      doFire(g.shot.aim, g.shot.power); // pull-and-release shoots
    }
  };
  const forceIntoBoard = (dx, dy) => {
    if (youAreIndex === 0 && dy >= 0) dy = -Math.max(1, Math.abs(dy));
    if (youAreIndex === 1 && dy <= 0) dy = Math.max(1, Math.abs(dy));
    return { dx, dy };
  };
  const updateAim = (p) => setAim(forceIntoBoard(p.x - slotX, p.y - baselineY));

  const doFire = (a, pw) => {
    if (!myTurn || !a || strikerBlocked) return;
    audioRef.current?.play('cue', pw / 100); // flick tap
    onMove({ x: Math.round(slotX), dx: a.dx, dy: a.dy, power: pw });
    setAim(null);
  };
  const fire = () => doFire(aim, power);

  const oppIdx = 1 - youAreIndex;
  const blitz = st.mode === 'blitz';

  return (
    <div className="carrom">
      <Scoreboard st={st} room={room} you={youAreIndex} opp={oppIdx} myTurn={myTurn} blitz={blitz} />

      <div className="board-wrap">
        <canvas
          ref={canvasRef}
          width={VIEW}
          height={VIEW}
          className="carrom-canvas"
          onPointerDown={onDown}
          onPointerMove={onMoveP}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {banner && <div key={banner.key} className={`game-banner ${banner.foul ? 'foul' : 'turn'}`}>{banner.msg}</div>}
      </div>

      {myTurn && frameIdx == null && (
        <div className="carrom-controls">
          <PowerBar value={power} onChange={setPower} />
          <button className="carrom-fire" disabled={!aim || strikerBlocked} onClick={fire}>Fire</button>
          <span className="carrom-hint muted">
            {strikerBlocked
              ? '⛔ A coin is blocking the striker — slide it to a clear spot.'
              : (<>Pull back the striker and release to flick. Drag sideways to reposition.</>)}
          </span>
        </div>
      )}
    </div>
  );
}

// Two-player panel: name, color, score progress, captured tray, queen badge.
function Scoreboard({ st, room, you, opp, myTurn, blitz }) {
  const name = (i) => room.players?.find((p) => p.index === i)?.username || (i === you ? 'You' : 'Opponent');
  const points = st.mode === 'points';

  const Panel = ({ i, mine }) => {
    const color = st.colors?.[i];
    const active = st.turn === i && room.status === 'playing';
    const potted = points ? st.scores[i] : (color ? st.pocketedByColor[color] : 0);
    const queen = st.queenCoveredBy === i;
    return (
      <div className={`sb-panel ${active ? 'active' : ''}`}>
        <div className="sb-top">
          {!points && <span className="sb-swatch" style={{ background: color ? COLORS[color] : '#666' }} />}
          <span className="sb-name">{mine ? 'You' : name(i)}</span>
          {queen && <span className="sb-queen" title="Queen covered">👑</span>}
        </div>
        <div className="sb-meta">
          {points
            ? <>Score <b>{st.scores[i]}</b> / {st.target}</>
            : <>{color ? <span className="sb-cap">{color}</span> : 'open'} · <b>{potted}</b>/{st.coinsPerColor}</>}
        </div>
        {!points && color && (
          <div className="sb-tray">
            {Array.from({ length: st.coinsPerColor }).map((_, k) => (
              <span key={k} className={`sb-coin ${k < potted ? 'on' : ''}`} style={{ background: k < potted ? COLORS[color] : 'transparent' }} />
            ))}
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
        <span className="sb-vs">vs</span>
      </div>
      <Panel i={opp} />
    </div>
  );
}

function drawBoard(ctx, st) {
  const W = st.W, H = st.H, ins = 72, RED = '#9c2b1b';
  // wooden frame
  const frame = ctx.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, '#5a3a1c'); frame.addColorStop(1, '#3a2410');
  ctx.fillStyle = frame; ctx.fillRect(0, 0, W, H);
  // playing surface (light plywood)
  const surf = ctx.createLinearGradient(0, 0, 0, H);
  surf.addColorStop(0, '#e7c885'); surf.addColorStop(1, '#d9b676');
  const pad = ins - 18;
  ctx.fillStyle = surf; ctx.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);

  // plywood grain: faint wavering horizontal strokes across the surface
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 80, 30, 0.07)';
  ctx.lineWidth = 1;
  for (let y0 = pad + 12; y0 < H - pad - 8; y0 += 22) {
    ctx.beginPath();
    for (let x = pad + 8; x < W - pad - 8; x += 30) {
      const yy = y0 + Math.sin(x * 0.021 + y0 * 0.6) * 3;
      if (x === pad + 8) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // overhead lamp: warm pool of light in the middle, darker toward the frame,
  // plus a corner vignette so the board sits under a single light
  const lamp = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.68);
  lamp.addColorStop(0, 'rgba(255, 246, 214, 0.20)');
  lamp.addColorStop(0.5, 'rgba(255, 246, 214, 0.04)');
  lamp.addColorStop(1, 'rgba(60, 30, 5, 0.26)');
  ctx.fillStyle = lamp; ctx.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.52, W / 2, H / 2, W * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(20, 10, 0, 0.28)');
  ctx.fillStyle = vignette; ctx.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);

  // inner frame shadow so the surface reads as recessed
  ctx.strokeStyle = 'rgba(30, 16, 4, 0.35)'; ctx.lineWidth = 10;
  ctx.strokeRect(pad + 5, pad + 5, W - 2 * pad - 10, H - 2 * pad - 10);
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 4;
  ctx.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);

  // corner pockets: brass ring, dark cavity, inner depth gradient
  for (const p of st.pockets) {
    ctx.beginPath(); ctx.arc(p.x, p.y, st.pocketR, 0, Math.PI * 2); ctx.fillStyle = '#140d06'; ctx.fill();
    const depth = ctx.createRadialGradient(p.x, p.y - st.pocketR * 0.3, st.pocketR * 0.15, p.x, p.y, st.pocketR);
    depth.addColorStop(0, 'rgba(70, 52, 30, 0.55)');
    depth.addColorStop(0.6, 'rgba(16, 10, 4, 0.3)');
    depth.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
    ctx.beginPath(); ctx.arc(p.x, p.y, st.pocketR, 0, Math.PI * 2); ctx.fillStyle = depth; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#b9893f'; ctx.stroke();
  }

  // red double base lines + end circles on all four sides
  const a = 150, b = W - 150, off = 96, gap = 12;
  ctx.strokeStyle = RED; ctx.lineWidth = 3;
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  line(a, off, b, off); line(a, off + gap, b, off + gap);                 // top
  line(a, H - off, b, H - off); line(a, H - off - gap, b, H - off - gap); // bottom
  line(off, a, off, b); line(off + gap, a, off + gap, b);                 // left
  line(W - off, a, W - off, b); line(W - off - gap, a, W - off - gap, b); // right
  const g2 = gap / 2;
  const ring = (x, y) => {
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
  };
  for (const [x, y] of [[a, off + g2], [b, off + g2], [a, H - off - g2], [b, H - off - g2],
    [off + g2, a], [off + g2, b], [W - off - g2, a], [W - off - g2, b]]) ring(x, y);

  // diagonal corner arrows pointing toward the centre
  const d = Math.SQRT1_2;
  const arrow = (px, py, dx, dy) => {
    const ex = px + dx * 110, ey = py + dy * 110;
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    for (const s of [0.5, -0.5]) {
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - (dx * Math.cos(s) - dy * Math.sin(s)) * 14, ey - (dx * Math.sin(s) + dy * Math.cos(s)) * 14);
      ctx.stroke();
    }
  };
  arrow(ins + 34, ins + 34, d, d);
  arrow(W - ins - 34, ins + 34, -d, d);
  arrow(ins + 34, H - ins - 34, d, -d);
  arrow(W - ins - 34, H - ins - 34, -d, -d);

  // centre medallion
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 95, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,90,42,0.7)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const ang = i * Math.PI / 3;
    ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 16, cy + Math.sin(ang) * 16, 16, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
}

// The track the striker can slide along, with a highlight under it.
function drawBaseline(ctx, st, baselineY, slotX) {
  const lo = 72 + st.strikerR, hi = st.W - 72 - st.strikerR;
  ctx.save();
  ctx.strokeStyle = 'rgba(91,140,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(lo, baselineY); ctx.lineTo(hi, baselineY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(91,140,255,0.18)';
  ctx.beginPath(); ctx.arc(slotX, baselineY, st.strikerR + 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Carrom men are flat wooden discs, not balls: an edge-thickness rim below the
// face, concentric groove rings on top, and a ring+star inlay on the striker.
function drawDisc(ctx, x, y, color, st) {
  const r = color === 'striker' ? st.strikerR : st.coinR;
  const base = COLORS[color] || '#888';
  // contact shadow
  ctx.beginPath(); ctx.ellipse(x + 1.5, y + 3, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
  // edge rim (the disc's side wall, slightly below the face)
  ctx.beginPath(); ctx.arc(x, y + 1.8, r, 0, Math.PI * 2);
  ctx.fillStyle = shadeRim(color); ctx.fill();
  // face
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
  // top lighting (soft, flat — these are discs, not spheres)
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.38)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // concentric groove rings
  ctx.strokeStyle = color === 'black' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.2;
  for (const k of [0.72, 0.45]) {
    ctx.beginPath(); ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke();
  }
  if (color === 'striker') {
    // striker inlay: inner ring + six-point star
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.28, y + Math.sin(a) * r * 0.28);
      ctx.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

// Darker side-wall tint for the disc's edge rim.
function shadeRim(color) {
  if (color === 'white') return '#b9ac93';
  if (color === 'black') return '#0d0d0d';
  if (color === 'queen') return '#8f271f';
  return '#3956a8'; // striker
}

// Full trajectory guideline: cue path (with rail bounces), a ghost striker at the
// first coin it would strike, and the direction that coin would travel.
function drawAim(ctx, pred, st) {
  ctx.save();
  ctx.strokeStyle = 'rgba(91,140,255,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([10, 7]);
  ctx.beginPath(); ctx.moveTo(pred.path[0].x, pred.path[0].y);
  for (let i = 1; i < pred.path.length; i++) ctx.lineTo(pred.path[i].x, pred.path[i].y);
  ctx.stroke(); ctx.setLineDash([]);
  if (pred.hit) {
    const { ghost, ball, objDir } = pred.hit;
    ctx.beginPath(); ctx.arc(ghost.x, ghost.y, st.strikerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + objDir.x * 130, ball.y + objDir.y * 130);
    ctx.strokeStyle = 'rgba(255,210,90,0.95)'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}

// Slingshot indicator: a band drawn behind the striker, longer/redder with power.
function drawPull(ctx, x, y, aim, power, st) {
  const l = Math.hypot(aim.dx, aim.dy) || 1;
  const ux = aim.dx / l, uy = aim.dy / l;
  const len = st.strikerR + power * 1.4;
  const bx = x - ux * len, by = y - uy * len;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${Math.round(120 + power)}, ${Math.round(180 - power)}, 90, 0.9)`;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - ux * st.strikerR, y - uy * st.strikerR); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();
}
