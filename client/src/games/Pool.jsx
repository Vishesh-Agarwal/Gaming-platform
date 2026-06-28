// Pool — 2-player cue sports. Server simulates each shot; this renders the table,
// takes aim input, replays the shot frames, then settles to state.
import { useEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 660;                 // on-screen width; logical table is 1000x500 (2:1)
const PALETTE = ['#e7b416', '#2f6fd0', '#d8453a', '#7d3cc0', '#e07b2c', '#2f9e54', '#8a3324'];

// A pool ball's id IS its number, so color + stripe derive straight from the id.
function ballBase(id) {
  if (id === 0) return '#f4f0e6';        // cue
  if (id === 8) return '#222';           // 8 ball
  if (id < 8) return PALETTE[id - 1];    // solids 1-7
  return PALETTE[id - 9];                // stripes 9-15 share the solid colors
}
const isStripe = (id) => id >= 9;

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

  const [aim, setAim] = useState(null);          // { dx, dy } pointing from the cue
  const [power, setPower] = useState(55);
  const [cuePlace, setCuePlace] = useState(null); // local cue placement when ball-in-hand/break
  const [dragging, setDragging] = useState(null); // 'cue' | 'aim' | null
  const baseCue = useMemo(() => cuePlace || st.cue, [cuePlace, st.cue, st.seq]);

  // replay
  const [frameIdx, setFrameIdx] = useState(null);
  const lastSeq = useRef(st.seq);
  const rafRef = useRef(0);
  useEffect(() => {
    if (st.seq === lastSeq.current) return;
    lastSeq.current = st.seq;
    setAim(null); setCuePlace(null);
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
    ctx.save();
    ctx.scale(scale, scale);
    drawTable(ctx, st);
    const playing = frameIdx != null && st.lastShot?.frames;
    if (playing) {
      for (const d of st.lastShot.frames[frameIdx]) drawBall(ctx, d.x, d.y, d.id, st.ballR);
    } else {
      for (const b of st.balls) if (b.id !== 0) drawBall(ctx, b.x, b.y, b.id, st.ballR);
      drawBall(ctx, baseCue.x, baseCue.y, 0, st.ballR);
      if (myTurn && aim) drawAim(ctx, baseCue, aim, power);
    }
    ctx.restore();
  }, [st, frameIdx, aim, power, baseCue, myTurn, scale]);

  const toLogical = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const onDown = (e) => {
    if (!myTurn || frameIdx != null) return;
    const p = toLogical(e);
    if (canPlace && Math.hypot(p.x - baseCue.x, p.y - baseCue.y) < st.ballR * 2.2) setDragging('cue');
    else { setDragging('aim'); setAim({ dx: p.x - baseCue.x, dy: p.y - baseCue.y }); }
  };
  const onMoveP = (e) => {
    if (!dragging) return;
    const p = toLogical(e);
    if (dragging === 'cue') {
      const m = st.ballR + 4;
      const hiX = st.onBreak ? st.W / 2 - st.ballR : st.W - m;
      setCuePlace({ x: Math.max(m, Math.min(hiX, p.x)), y: Math.max(m, Math.min(st.H - m, p.y)) });
    } else setAim({ dx: p.x - baseCue.x, dy: p.y - baseCue.y });
  };
  const onUp = () => setDragging(null);

  const shoot = () => {
    if (!myTurn || !aim || (aim.dx === 0 && aim.dy === 0)) return;
    onMove({ dx: aim.dx, dy: aim.dy, power, ...(cuePlace ? { cue: cuePlace } : {}) });
    setAim(null);
  };

  const myGroup = st.groups?.[youAreIndex];
  const oppIdx = 1 - youAreIndex;
  const lowest = st.mode === 'nineball'
    ? Math.min(...st.balls.filter((b) => b.id !== 0).map((b) => b.n).concat(99))
    : null;

  return (
    <div className="pool">
      <div className="pool-hud">
        <span className={`pool-turn ${myTurn ? 'mine' : ''}`}>{myTurn ? 'Your shot' : "Opponent's shot"}</span>
        {st.mode === 'practice' && <span className="pool-score">You {st.scores[youAreIndex]} · Opp {st.scores[oppIdx]}</span>}
        {st.mode === 'nineball' && <span className="pool-score">Lowest ball: {lowest <= 9 ? lowest : '—'}</span>}
        {(st.mode === 'eightball' || st.mode === 'blitz') && (
          <span className="pool-score">{myGroup ? `You: ${myGroup}s` : 'Open table'}</span>
        )}
        {canPlace && <span className="pool-bih">{st.onBreak ? 'Place cue in the kitchen' : 'Ball in hand'}</span>}
        {st.lastShot?.foul && <span className="pool-foul">{st.lastShot.foul === 'timeout' ? '⏱ timed out' : 'Foul!'}</span>}
      </div>

      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={viewH}
        className="pool-canvas"
        onPointerDown={onDown}
        onPointerMove={onMoveP}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />

      {myTurn && frameIdx == null && (
        <div className="pool-controls">
          <label className="pool-power">
            Power
            <input type="range" min="5" max="100" value={power} onChange={(e) => setPower(Number(e.target.value))} />
            <span>{power}%</span>
          </label>
          <button className="pool-shoot" disabled={!aim} onClick={shoot}>Shoot</button>
          <span className="pool-hint muted">{canPlace ? 'Drag the cue ball to place it, then drag to aim.' : 'Drag from the cue ball to aim.'}</span>
        </div>
      )}
    </div>
  );
}

function drawTable(ctx, st) {
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(0, 0, st.W, st.H);
  ctx.fillStyle = '#1f7a4d';
  ctx.fillRect(36, 36, st.W - 72, st.H - 72);
  ctx.fillStyle = '#0c1f16';
  for (const p of st.pockets) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  // head string (kitchen line)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(st.W / 4, 46); ctx.lineTo(st.W / 4, st.H - 46); ctx.stroke();
}

function drawBall(ctx, x, y, id, r) {
  const base = ballBase(id);
  ctx.save();
  if (isStripe(id)) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#f4f0e6'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = base; ctx.fillRect(x - r, y - r * 0.5, r * 2, r); ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
  }
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  if (id !== 0) {
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id), x, y + 0.5);
  }
  ctx.restore();
}

function drawAim(ctx, cue, aim, power) {
  const len = Math.hypot(aim.dx, aim.dy) || 1;
  const reach = 70 + power * 2.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(cue.x, cue.y);
  ctx.lineTo(cue.x + (aim.dx / len) * reach, cue.y + (aim.dy / len) * reach);
  ctx.stroke();
  ctx.setLineDash([]);
}
