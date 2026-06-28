// Carrom — 2-player board game. Server simulates each flick; this renders the
// board, takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { predictShot } from './aimPredict.js';

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
  const [dragging, setDragging] = useState(null); // 'striker' | 'aim' | null

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
        const pred = predictShot({ x: slotX, y: baselineY }, { x: aim.dx, y: aim.dy }, aimCoins, st.strikerR, bounds, 2);
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
  };
  // Hover (and drag) move the aim guideline; pressing on the striker slides it.
  const onMoveP = (e) => {
    if (!myTurn || frameIdx != null) return;
    const p = toLogical(e);
    if (dragging === 'striker') {
      const lo = st.coinR + st.strikerR, hi = st.W - st.coinR - st.strikerR;
      setSlotX(Math.max(lo, Math.min(hi, p.x)));
      return;
    }
    updateAim(p);
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
          <label className="carrom-power">
            Power
            <input type="range" min="5" max="100" value={power} onChange={(e) => setPower(Number(e.target.value))} />
            <span>{power}%</span>
          </label>
          <button className="carrom-fire" disabled={!aim} onClick={fire}>Fire</button>
          <span className="carrom-hint muted">Drag the striker to slide it; drag out to aim.</span>
        </div>
      )}
    </div>
  );
}

function drawBoard(ctx, st) {
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(0, 0, st.W, st.H);
  ctx.fillStyle = '#caa46a';
  ctx.fillRect(60, 60, st.W - 120, st.H - 120);
  // pockets
  ctx.fillStyle = '#1c140b';
  for (const p of st.pockets) { ctx.beginPath(); ctx.arc(p.x, p.y, st.pocketR, 0, Math.PI * 2); ctx.fill(); }
  // center rings
  ctx.strokeStyle = '#9c7b46'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(st.W / 2, st.H / 2, 95, 0, Math.PI * 2); ctx.stroke();
  // baselines
  ctx.strokeStyle = 'rgba(120,90,40,0.7)'; ctx.lineWidth = 4;
  for (const seat of [0, 1]) {
    const y = seat === 0 ? st.H - 108 : 108;
    ctx.beginPath(); ctx.moveTo(140, y); ctx.lineTo(st.W - 140, y); ctx.stroke();
  }
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
