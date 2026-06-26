// Ludo board UI — realistic boxed-board look. Renders authoritative server state
// and emits {action:'roll'} / {action:'move',token}. Solid color trays with a
// classic white "yard" of 4 symmetric coin wells, starred safe cells, pawn tokens,
// and per-player dice boxes with a rolling animation. Geometry from board.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LOOP_CELLS, HOME_COLUMN, BASE_SLOTS, cellFor } from './ludo/board.js';

const STEP_MS = 150; // per-cell hop duration when a token advances

const COLORS = ['#e63946', '#2a9d4a', '#f1b40a', '#2877c9']; // 0 red, 1 green, 2 yellow, 3 blue
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
const CORNER_IDX = ['tl', 'tr', 'br', 'bl']; // screen corners, clockwise from top-left
const START_INDEX = { 0: 0, 13: 1, 26: 2, 39: 3 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const key = (r, c) => `${r},${c}`;

// 6x6 colored quadrant blocks and inner 3x3 "yard", as inclusive [r0,c0,r1,c1] cells.
const QUAD = { 0: [0, 0, 5, 5], 1: [0, 9, 5, 14], 2: [9, 9, 14, 14], 3: [9, 0, 14, 5] };
const YARD = { 1: [1, 11, 3, 13], 0: [1, 1, 3, 3], 2: [11, 11, 13, 13], 3: [11, 1, 13, 3] };

// Rotate a 15x15 cell (indices 0..14) by k quarter-turns clockwise. Used to draw the
// board from each viewer's perspective so their own color quadrant sits at the bottom.
function rotCell(k, r, c) {
  let R = r, C = c;
  for (let i = 0; i < k; i++) { const nr = C, nc = 14 - R; R = nr; C = nc; }
  return [R, C];
}
// Rotate an inclusive cell block; returns grid-line span strings.
function rotBlock(k, [r0, c0, r1, c1]) {
  const a = rotCell(k, r0, c0), b = rotCell(k, r1, c1);
  const rs = Math.min(a[0], b[0]), re = Math.max(a[0], b[0]);
  const cs = Math.min(a[1], b[1]), ce = Math.max(a[1], b[1]);
  return { gridRow: `${rs + 1} / ${re + 2}`, gridColumn: `${cs + 1} / ${ce + 2}` };
}

const loopAt = new Map(LOOP_CELLS.map(([r, c], i) => [key(r, c), i]));
const homeAt = new Map();
for (const color of [0, 1, 2, 3]) for (const [r, c] of HOME_COLUMN[color]) homeAt.set(key(r, c), color);

function baseQuadrant(r, c) {
  if (r <= 5 && c <= 5) return 0;
  if (r <= 5 && c >= 9) return 1;
  if (r >= 9 && c >= 9) return 2;
  if (r >= 9 && c <= 5) return 3;
  return -1;
}

function cellRole(r, c) {
  const k = key(r, c);
  if (homeAt.has(k)) return { type: 'home', color: homeAt.get(k) };
  if (loopAt.has(k)) {
    const idx = loopAt.get(k);
    if (idx in START_INDEX) return { type: 'start', color: START_INDEX[idx], safe: true };
    return { type: 'track', safe: SAFE.has(idx) };
  }
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { type: 'center' };
  const q = baseQuadrant(r, c);
  if (q >= 0) return { type: 'base', color: q };
  return { type: 'void' };
}

const CELLS = [];
for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) CELLS.push({ r, c, role: cellRole(r, c) });

function Star({ onColor }) {
  return (
    <svg className={`ludo-star ${onColor ? 'on-color' : 'on-light'}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.4l2.8 6.2 6.8.6-5.1 4.4 1.5 6.6L12 16.8 5.9 20.2l1.5-6.6L2.3 9.2l6.8-.6z" />
    </svg>
  );
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function DieFace({ value }) {
  const on = new Set(PIPS[value] || []);
  return (
    <div className="ludo-pips">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={on.has(i) ? 'pip on' : 'pip'} />)}
    </div>
  );
}

// Lighten (amt>0 toward white) or darken (amt<0 toward black) a #rrggbb color.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt < 0 ? 0 : 255, t = Math.abs(amt);
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Glossy 3D location-pin token (teardrop head + white eye), shaded with a radial
// gradient so it reads as a rounded piece, not a flat disc.
function Pawn({ color, id }) {
  const gid = `pin-${id}`;
  return (
    <svg className="ludo-pawn" viewBox="0 0 40 54" aria-hidden="true">
      <defs>
        <radialGradient id={gid} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor={shade(color, 0.55)} />
          <stop offset="52%" stopColor={color} />
          <stop offset="100%" stopColor={shade(color, -0.38)} />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="50.5" rx="8.5" ry="2.4" fill="rgba(0,0,0,0.32)" />
      <path
        d="M20 3 C29.4 3 37 10.4 37 19.2 C37 31 24 42 20 48.8 C16 42 3 31 3 19.2 C3 10.4 10.6 3 20 3 Z"
        fill={`url(#${gid})`} stroke="rgba(0,0,0,0.28)" strokeWidth="1.1"
      />
      <circle cx="20" cy="18.6" r="7.8" fill="#fff" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      <ellipse cx="14.8" cy="11.5" rx="3.2" ry="4.5" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

// Card artwork for the lobby games grid.
export function Thumbnail() {
  const sq = (x, y, fill) => (
    <rect x={x} y={y} width="34" height="34" rx="8" fill={fill} opacity="0.92"
      style={{ filter: `drop-shadow(0 0 5px ${fill})` }} />
  );
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <rect width="120" height="120" rx="10" fill="#0a0d1c" />
      <rect x="6" y="6" width="108" height="108" rx="9" fill="none" stroke="rgba(120,150,255,0.32)" />
      {sq(14, 14, '#e63946')}{sq(72, 14, '#2a9d4a')}
      {sq(14, 72, '#2877c9')}{sq(72, 72, '#f1b40a')}
      <rect x="52" y="14" width="16" height="92" rx="4" fill="rgba(150,175,235,0.12)" />
      <rect x="14" y="52" width="92" height="16" rx="4" fill="rgba(150,175,235,0.12)" />
      <circle cx="60" cy="60" r="11" fill="#9fb0d8" opacity="0.9"
        style={{ filter: 'drop-shadow(0 0 5px #9fb0d8)' }} />
    </svg>
  );
}

export default function Ludo({ room, youAreIndex, onMove }) {
  const st = room.state;
  const { players, colors, current, phase, dice, movable = [], finishedOrder = [], lastEvent, lastRoll,
    misses = [], out = [] } = st;
  const turnEndsAt = room.turnEndsAt || null;
  const myTurn = room.status === 'playing' && current === youAreIndex;
  const myColor = colors[youAreIndex];
  // Rotate the board so the viewer's own color quadrant lands at bottom-left.
  const rotK = (3 - myColor + 4) % 4;
  const rot = (r, c) => rotCell(rotK, r, c);

  // Animate each new roll (keyed on lastRoll.seq) by tumbling random faces in the
  // roller's dice box, then settle on the real value. The settled value persists
  // (even when the server auto-passed a no-move roll) until the next roll.
  const [anim, setAnim] = useState(null); // { seq, face } while tumbling
  const timer = useRef(null);
  const seq = lastRoll?.seq;
  useEffect(() => {
    clearInterval(timer.current);
    if (seq == null) { setAnim(null); return undefined; }
    let ticks = 0;
    setAnim({ seq, face: 1 + Math.floor(Math.random() * 6) });
    timer.current = setInterval(() => {
      ticks += 1;
      if (ticks >= 8) { clearInterval(timer.current); setAnim(null); }
      else setAnim({ seq, face: 1 + Math.floor(Math.random() * 6) });
    }, 70);
    return () => clearInterval(timer.current);
  }, [seq]);
  const rolling = anim?.seq === seq;

  // Tick once a second so the low-time warning re-renders while a deadline is live.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!turnEndsAt) return undefined;
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [turnEndsAt]);
  const secondsLeft = turnEndsAt ? Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000)) : null;
  // Full turn length captured once per turn so the depleting ring runs smoothly
  // (recomputing every tick would jitter the running CSS animation).
  const turnMs = useMemo(() => (turnEndsAt ? Math.max(0, turnEndsAt - Date.now()) : 0), [turnEndsAt]);

  // --- step-by-step token movement ---
  // The board renders a lagging "display" copy of token positions. When the
  // authoritative state advances exactly one token, we hold everyone in place and
  // animate frame by frame: the mover hops forward to its cell, then anything it
  // captured retreats back along its own path into its yard before we settle.
  const [display, setDisplay] = useState(() => players.map((p) => p.tokens.slice()));
  const [hops, setHops] = useState({}); // `${seat}-${token}` -> { cell:[r,c], back:bool }
  const hopTimer = useRef(null);
  const prevTokensRef = useRef(players.map((p) => p.tokens.slice()));
  useEffect(() => {
    const prev = prevTokensRef.current;
    const next = players.map((p) => p.tokens.slice());
    prevTokensRef.current = next;

    const advanced = [];
    const captured = [];
    for (let s = 0; s < next.length; s++) {
      for (let t = 0; t < 4; t++) {
        const a = prev[s]?.[t] ?? 0;
        const b = next[s][t];
        if (b > a) advanced.push({ seat: s, token: t, from: a, to: b, color: players[s].color });
        else if (a > 0 && b === 0) captured.push({ seat: s, token: t, from: a, color: players[s].color });
      }
    }

    clearInterval(hopTimer.current);
    // Only animate the common single-token advance; auto-played multi-step turns snap.
    if (advanced.length !== 1) { setHops({}); setDisplay(next); return undefined; }

    const mv = advanced[0];
    const mvKey = `${mv.seat}-${mv.token}`;
    const frames = [];

    // Phase 1 — the mover hops forward one cell at a time to its destination.
    for (let p = Math.max(1, mv.from + 1); p <= mv.to; p++) {
      const c = cellFor(mv.color, p);
      if (c) frames.push({ [mvKey]: { cell: c, back: false } });
    }
    if (frames.length === 0) { setHops({}); setDisplay(next); return undefined; }

    // Phase 2 — captured tokens retreat back along their own loop path to their
    // yard (in parallel), while the mover stays parked on the capture cell.
    if (captured.length) {
      const landed = cellFor(mv.color, mv.to);
      const backPaths = captured.map((cap) => {
        const path = [];
        for (let p = cap.from - 1; p >= 1; p--) { const c = cellFor(cap.color, p); if (c) path.push(c); }
        path.push(BASE_SLOTS[cap.color][cap.token]); // finally settle into the yard well
        return path;
      });
      const steps = Math.max(...backPaths.map((p) => p.length));
      for (let i = 0; i < steps; i++) {
        const frame = { [mvKey]: { cell: landed, back: false } };
        captured.forEach((cap, ci) => {
          const path = backPaths[ci];
          frame[`${cap.seat}-${cap.token}`] = { cell: path[Math.min(i, path.length - 1)], back: true };
        });
        frames.push(frame);
      }
    }

    setDisplay(prev); // hold everyone at their previous spots; frames drive the movers
    let i = 0;
    setHops(frames[0]);
    hopTimer.current = setInterval(() => {
      i += 1;
      if (i >= frames.length) { clearInterval(hopTimer.current); setHops({}); setDisplay(next); }
      else setHops(frames[i]);
    }, STEP_MS);
    return () => clearInterval(hopTimer.current);
  }, [players]);

  const nameFor = (seat) => (seat === youAreIndex ? 'You' : (room.players[seat]?.username || COLOR_NAMES[colors[seat]]));

  const placed = [];
  players.forEach((p, seat) => {
    const tokens = display[seat] || p.tokens;
    tokens.forEach((progress, token) => {
      const ov = hops[`${seat}-${token}`];
      const cell = ov ? ov.cell : (progress <= 0 ? BASE_SLOTS[p.color][token] : cellFor(p.color, progress));
      if (cell) placed.push({ seat, color: p.color, token, r: cell[0], c: cell[1], hopping: !!ov, back: ov?.back });
    });
  });
  const byCell = new Map();
  for (const t of placed) {
    const k = key(t.r, t.c);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }
  const canMoveToken = (seat, token) => myTurn && phase === 'move' && seat === youAreIndex && movable.includes(token);

  const eventText = () => {
    if (!lastEvent) return null;
    const who = nameFor(lastEvent.seat);
    if (lastEvent.type === 'capture') return `${who} captured a token!`;
    if (lastEvent.type === 'home') return `${who} brought a token home!`;
    if (lastEvent.type === 'sixes') return `${who} rolled three 6s — turn skipped`;
    if (lastEvent.type === 'pass') return `${who} had no move`;
    if (lastEvent.type === 'timeout') return `${who} ran out of time — turn auto-played`;
    if (lastEvent.type === 'eliminated') return `${who} timed out 5 times — eliminated!`;
    return null;
  };

  return (
    <div className="ludo">
      <div className="ludo-table">
        <div className="ludo-board">
          {/* cells: solid color trays (no inner grid), white track tiles, safe stars */}
          {CELLS.map(({ r, c, role }) => {
            const cls = ['ludo-cell', `ludo-${role.type}`];
            const [dr, dc] = rot(r, c);
            const style = { gridRow: dr + 1, gridColumn: dc + 1 };
            // colored cells take a CSS var so the glass tint + neon glow live in CSS
            if (role.color != null) style['--cc'] = COLORS[role.color];
            return (
              <div key={key(r, c)} className={cls.join(' ')} style={style}>
                {role.safe && <Star onColor={role.type === 'start'} />}
              </div>
            );
          })}

          {/* glossy highlight over each colored quadrant */}
          {[0, 1, 2, 3].map((color) => (
            <div key={`q-${color}`} className="ludo-quadrant"
              style={{ ...rotBlock(rotK, QUAD[color]), '--qc': COLORS[color] }} />
          ))}

          {/* classic white "yard" panel per quadrant */}
          {[0, 1, 2, 3].map((color) => (
            <div key={`yard-${color}`} className="ludo-yard"
              style={{ ...rotBlock(rotK, YARD[color]), '--yc': COLORS[color] }} />
          ))}

          {/* four symmetric coin wells per yard */}
          {[0, 1, 2, 3].map((color) =>
            BASE_SLOTS[color].map(([r, c], i) => {
              const [dr, dc] = rot(r, c);
              return (
                <div key={`slot-${color}-${i}`} className="ludo-slot"
                  style={{ gridRow: dr + 1, gridColumn: dc + 1, '--pc': COLORS[color] }} />
              );
            }),
          )}

          {/* center goal — four triangles meeting in the middle (rotated with the board) */}
          <svg className="ludo-goal" viewBox="0 0 40 40" preserveAspectRatio="none"
            style={{ gridRow: '7 / 10', gridColumn: '7 / 10', transform: `rotate(${rotK * 90}deg)` }}>
            <polygon points="0,0 0,40 20,20" fill={COLORS[0]} />
            <polygon points="0,0 40,0 20,20" fill={COLORS[1]} />
            <polygon points="40,0 40,40 20,20" fill={COLORS[2]} />
            <polygon points="0,40 40,40 20,20" fill={COLORS[3]} />
          </svg>

          {/* tokens */}
          {placed.map((t) => {
            const stack = byCell.get(key(t.r, t.c));
            const idx = stack.indexOf(t);
            const n = stack.length;
            const off = n > 1 ? (idx - (n - 1) / 2) * 30 : 0;
            const clickable = canMoveToken(t.seat, t.token);
            const [dr, dc] = rot(t.r, t.c);
            return (
              <button
                key={`tok-${t.seat}-${t.token}`}
                className={`ludo-token${clickable ? ' movable' : ''}${t.hopping ? ' hopping' : ''}${t.back ? ' captured' : ''}`}
                style={{ gridRow: dr + 1, gridColumn: dc + 1, transform: `translateX(${off}%)`, zIndex: t.hopping ? 60 : 20 + idx, '--tc': COLORS[t.color] }}
                disabled={!clickable}
                onClick={() => clickable && onMove({ action: 'move', token: t.token })}
                title={nameFor(t.seat)}
              >
                <Pawn color={COLORS[t.color]} id={t.color} />
              </button>
            );
          })}
        </div>

        {/* per-player dice boxes, one at each player's corner */}
        {players.map((p, seat) => {
          const active = seat === current && room.status === 'playing';
          const isMe = seat === youAreIndex;
          const eliminated = out.includes(seat);
          const showRoll = isMe && active && phase === 'roll';
          const lowTime = active && secondsLeft != null && secondsLeft <= 5;
          // The roller's box shows the tumbling animation, then the real value; it
          // persists on that seat's box until someone rolls again. The waiting roller
          // (active, hasn't rolled yet) shows a '?'.
          const isRoller = lastRoll && seat === lastRoll.seat;
          const animating = rolling && isRoller;
          const faceVal = animating ? anim.face : (isRoller ? lastRoll.value : null);
          const corner = CORNER_IDX[(p.color + rotK) % 4]; // viewer-relative screen corner
          const name = nameFor(seat);
          return (
            <div
              key={`box-${seat}`}
              className={`ludo-dicebox corner-${corner}${active ? ' active' : ''}${eliminated ? ' out' : ''}`}
              style={{ '--pc': COLORS[p.color] }}
            >
              {/* user profile: avatar with the depleting square timeline tracing it */}
              <div className="ludo-profile">
                <div className="ludo-avatar">
                  {active && turnMs > 0 && (
                    <svg key={turnEndsAt} className={`ludo-timer${lowTime ? ' low' : ''}`} viewBox="0 0 100 100"
                      preserveAspectRatio="none" aria-hidden="true" style={{ '--turn-ms': `${turnMs}ms` }}>
                      <rect className="ludo-timer-track" x="4" y="4" width="92" height="92" rx="16" pathLength="100" />
                      <rect className="ludo-timer-bar" x="4" y="4" width="92" height="92" rx="16" pathLength="100" />
                    </svg>
                  )}
                  <span className="ludo-initial">{(name[0] || '?').toUpperCase()}</span>
                </div>
                <div className="ludo-dice-name">{name}</div>
              </div>

              {/* dice, separate from the profile */}
              <div className="ludo-dieside">
                <div className={`ludo-die${animating ? ' rolling' : ''}`}>
                  {faceVal ? <DieFace value={faceVal} /> : <span className="ludo-die-empty">{active && phase === 'roll' ? '?' : ''}</span>}
                </div>
                {eliminated ? <div className="ludo-hint">Eliminated</div> : <>
                  {showRoll && <button className="ludo-roll" onClick={() => onMove({ action: 'roll' })}>Roll</button>}
                  {active && isMe && phase === 'move' && <div className="ludo-hint">Move a piece</div>}
                  {active && !isMe && <div className="ludo-hint">Rolling…</div>}
                </>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ludo-footer">
        <div className="ludo-you">You are <b style={{ color: COLORS[myColor] }}>{COLOR_NAMES[myColor]}</b></div>
        {eventText() && <div className="ludo-event">{eventText()}</div>}
        <div className="ludo-standings">
          {players.map((p, seat) => {
            const home = p.tokens.filter((t) => t === 57).length;
            const rank = finishedOrder.indexOf(seat);
            const eliminated = out.includes(seat);
            const miss = misses[seat] || 0;
            return (
              <div key={seat} className={`ludo-rank${seat === current ? ' active' : ''}${eliminated ? ' out' : ''}`}>
                <span className="ludo-swatch" style={{ background: COLORS[p.color] }} />
                <span className="ludo-pname">{nameFor(seat)}</span>
                {miss > 0 && !eliminated && <span className="ludo-misses" title="Timed-out turns">⏱{miss}/5</span>}
                {eliminated ? <b className="ludo-place out">OUT</b>
                  : rank >= 0 ? <b className="ludo-place">#{rank + 1}</b>
                  : <span className="ludo-home">{home}/4</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
