// Carrom — 2-player board game. Server simulates each flick; this renders the
// board, takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { predictShot } from './aimPredict.js';
import PowerBar from './PowerBar.jsx';

const VIEW = 620;          // on-screen canvas size (square); logical board is 900
const COLORS = { white: '#f4f0e6', black: '#2a2a2a', queen: '#e4453a', striker: '#5b8cff' };

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
  const [dragging, setDragging] = useState(null); // 'striker' | null

  // replay state
  const [frameIdx, setFrameIdx] = useState(null); // null = show resting state
  const lastSeq = useRef(st.seq);
  const rafRef = useRef(0);

  // When a new shot arrives, play its frames.
  useEffect(() => {
    if (st.seq === lastSeq.current) return;
    lastSeq.current = st.seq;
    setSlotX(st.striker.x);
    setAim(null);
    setLocked(false);
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
      for (const d of st.lastShot.frames[frameIdx]) drawDisc(ctx, d.x, d.y, d.color, st);
    } else {
      for (const c of st.coins) drawDisc(ctx, c.x, c.y, c.color, st);
      // resting striker (and aim preview on your turn)
      drawDisc(ctx, slotX, baselineY, 'striker', st);
      if (myTurn && aim && (aim.dx || aim.dy)) {
        const pred = predictShot({ x: slotX, y: baselineY }, { x: aim.dx, y: aim.dy }, aimCoins, st.strikerR, bounds, 0);
        drawAim(ctx, pred, st);
      }
    }
    ctx.restore();
  }, [st, frameIdx, slotX, aim, power, myTurn, baselineY, scale, aimCoins, bounds, flip]);

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
    const p = toLogical(e);
    if (Math.hypot(p.x - slotX, p.y - baselineY) < st.strikerR * 1.6) { setDragging('striker'); return; }
    updateAim(p);
    setLocked((l) => !l); // click to lock the aim; click again to re-aim
  };
  // While unlocked, hover moves the aim guideline; pressing the striker slides it.
  const onMoveP = (e) => {
    if (!myTurn || frameIdx != null) return;
    const p = toLogical(e);
    if (dragging === 'striker') {
      const lo = st.coinR + st.strikerR, hi = st.W - st.coinR - st.strikerR;
      setSlotX(Math.max(lo, Math.min(hi, p.x)));
      return;
    }
    if (!locked) updateAim(p);
  };
  const onUp = () => setDragging(null);
  const updateAim = (p) => {
    let dx = p.x - slotX, dy = p.y - baselineY;
    // force the aim to point into the board for your seat
    if (youAreIndex === 0 && dy >= 0) dy = -1;
    if (youAreIndex === 1 && dy <= 0) dy = 1;
    setAim({ dx, dy });
  };

  const fire = () => {
    if (!myTurn || !aim) return;
    onMove({ x: Math.round(slotX), dx: aim.dx, dy: aim.dy, power });
    setAim(null);
  };

  const myColor = st.colors?.[youAreIndex];
  const oppIdx = 1 - youAreIndex;

  return (
    <div className="carrom">
      <div className="carrom-hud">
        <span className={`carrom-turn ${myTurn ? 'mine' : ''}`}>
          {myTurn ? 'Your shot' : "Opponent's shot"}
        </span>
        {st.mode === 'points' ? (
          <span className="carrom-score">You {st.scores[youAreIndex]} · Opp {st.scores[oppIdx]} (to {st.target})</span>
        ) : (
          <span className="carrom-score">
            {myColor ? `You: ${myColor}` : 'Colors open'} · You {st.scores[youAreIndex]}/{st.coinsPerColor}
            {st.queenCoveredBy === youAreIndex ? ' · 👑' : ''}
          </span>
        )}
        {st.lastShot?.foul && <span className="carrom-foul">{st.lastShot.foul === 'timeout' ? '⏱ timed out' : 'Foul!'}</span>}
      </div>

      <canvas
        ref={canvasRef}
        width={VIEW}
        height={VIEW}
        className="carrom-canvas"
        onPointerDown={onDown}
        onPointerMove={onMoveP}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />

      {myTurn && frameIdx == null && (
        <div className="carrom-controls">
          <PowerBar value={power} onChange={setPower} />
          <button className="carrom-fire" disabled={!aim} onClick={fire}>Fire</button>
          <span className="carrom-hint muted">
            Drag the striker to slide it. Move to aim, <b>click to lock</b>, set power, then Fire.
            {locked ? ' (aim locked — click the board to re-aim)' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function drawBoard(ctx, st) {
  const W = st.W, H = st.H, ins = 72, RED = '#9c2b1b';
  // wooden frame
  const frame = ctx.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, '#5a3a1c'); frame.addColorStop(1, '#3a2410');
  ctx.fillStyle = frame; ctx.fillRect(0, 0, W, H);
  // playing surface (light wood)
  const surf = ctx.createLinearGradient(0, 0, 0, H);
  surf.addColorStop(0, '#e7c885'); surf.addColorStop(1, '#d9b676');
  const pad = ins - 18;
  ctx.fillStyle = surf; ctx.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 4; ctx.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);

  // corner pockets with brass rings
  for (const p of st.pockets) {
    ctx.beginPath(); ctx.arc(p.x, p.y, st.pocketR, 0, Math.PI * 2); ctx.fillStyle = '#140d06'; ctx.fill();
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

function drawDisc(ctx, x, y, color, st) {
  const r = color === 'striker' ? st.strikerR : st.coinR;
  // contact shadow
  ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  // body
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = COLORS[color] || '#888'; ctx.fill();
  // spherical shading
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
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
