// Ludo board UI — realistic boxed-board look. Renders authoritative server state
// and emits {action:'roll'} / {action:'move',token}. Solid color trays with a
// classic white "yard" of 4 symmetric coin wells, starred safe cells, pawn tokens,
// and per-player dice boxes with a rolling animation. Geometry from board.js.
import { useEffect, useRef, useState } from 'react';
import { LOOP_CELLS, HOME_COLUMN, BASE_SLOTS, cellFor } from './ludo/board.js';

const COLORS = ['#e63946', '#2a9d4a', '#f1b40a', '#2877c9']; // 0 red, 1 green, 2 yellow, 3 blue
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
const CORNER = { 0: 'tl', 1: 'tr', 2: 'br', 3: 'bl' };
const START_INDEX = { 0: 0, 13: 1, 26: 2, 39: 3 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const key = (r, c) => `${r},${c}`;

// 6x6 colored quadrant spans (grid-line based), and the inner 3x3 white "yard".
const QUAD = {
  0: { r: '1 / 7', c: '1 / 7' }, 1: { r: '1 / 7', c: '10 / 16' },
  2: { r: '10 / 16', c: '10 / 16' }, 3: { r: '10 / 16', c: '1 / 7' },
};
const YARD = {
  0: { r: '2 / 5', c: '2 / 5' }, 1: { r: '2 / 5', c: '12 / 15' },
  2: { r: '12 / 15', c: '12 / 15' }, 3: { r: '12 / 15', c: '2 / 5' },
};

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

function Pawn({ color }) {
  return (
    <svg className="ludo-pawn" viewBox="0 0 40 52" aria-hidden="true">
      <ellipse cx="20" cy="48.5" rx="12" ry="3.4" fill="rgba(0,0,0,0.35)" />
      <path
        d="M20 4 a9 9 0 0 1 9 9 c0 4 -3 6.5 -6 8.5 l3.6 7 q6 5 6.4 17 l-26 0 q0.4 -12 6.4 -17 l3.6 -7 c-3 -2 -6 -4.5 -6 -8.5 a9 9 0 0 1 9 -9 z"
        fill={color} stroke="rgba(0,0,0,0.32)" strokeWidth="1.5"
      />
      <ellipse cx="16.4" cy="11" rx="3.1" ry="4.3" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

// Card artwork for the lobby games grid.
export function Thumbnail() {
  const sq = (x, y, fill) => <rect x={x} y={y} width="34" height="34" rx="6" fill={fill} />;
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <rect width="120" height="120" rx="10" fill="#c89456" />
      <rect x="8" y="8" width="104" height="104" rx="6" fill="#fbf6e9" />
      {sq(14, 14, '#e63946')}{sq(72, 14, '#2a9d4a')}
      {sq(14, 72, '#2877c9')}{sq(72, 72, '#f1b40a')}
      <rect x="52" y="14" width="16" height="92" fill="#fff" />
      <rect x="14" y="52" width="92" height="16" fill="#fff" />
      <circle cx="60" cy="60" r="10" fill="#9fb0d8" />
    </svg>
  );
}

export default function Ludo({ room, youAreIndex, onMove }) {
  const st = room.state;
  const { players, colors, current, phase, dice, movable = [], finishedOrder = [], lastEvent } = st;
  const myTurn = room.status === 'playing' && current === youAreIndex;
  const myColor = colors[youAreIndex];

  const [rollFace, setRollFace] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    clearInterval(timer.current);
    if (dice == null) { setRollFace(null); return undefined; }
    let ticks = 0;
    setRollFace(1 + Math.floor(Math.random() * 6));
    timer.current = setInterval(() => {
      ticks += 1;
      if (ticks >= 8) { clearInterval(timer.current); setRollFace(null); }
      else setRollFace(1 + Math.floor(Math.random() * 6));
    }, 70);
    return () => clearInterval(timer.current);
  }, [dice, current]);
  const rolling = rollFace != null;

  const nameFor = (seat) => (seat === youAreIndex ? 'You' : (room.players[seat]?.username || COLOR_NAMES[colors[seat]]));

  const placed = [];
  players.forEach((p, seat) => {
    p.tokens.forEach((progress, token) => {
      const cell = progress <= 0 ? BASE_SLOTS[p.color][token] : cellFor(p.color, progress);
      if (cell) placed.push({ seat, color: p.color, token, r: cell[0], c: cell[1] });
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
    return null;
  };

  return (
    <div className="ludo">
      <div className="ludo-table">
        <div className="ludo-board">
          {/* cells: solid color trays (no inner grid), white track tiles, safe stars */}
          {CELLS.map(({ r, c, role }) => {
            const cls = ['ludo-cell', `ludo-${role.type}`];
            const style = { gridRow: r + 1, gridColumn: c + 1 };
            if (role.type === 'base') style.background = COLORS[role.color];
            if (role.type === 'home' || role.type === 'start') style.background = COLORS[role.color];
            return (
              <div key={key(r, c)} className={cls.join(' ')} style={style}>
                {role.safe && <Star onColor={role.type === 'start'} />}
              </div>
            );
          })}

          {/* glossy highlight over each colored quadrant */}
          {[0, 1, 2, 3].map((color) => (
            <div key={`q-${color}`} className="ludo-quadrant" style={{ gridRow: QUAD[color].r, gridColumn: QUAD[color].c }} />
          ))}

          {/* classic white "yard" panel per quadrant */}
          {[0, 1, 2, 3].map((color) => (
            <div key={`yard-${color}`} className="ludo-yard" style={{ gridRow: YARD[color].r, gridColumn: YARD[color].c }} />
          ))}

          {/* four symmetric coin wells per yard */}
          {[0, 1, 2, 3].map((color) =>
            BASE_SLOTS[color].map(([r, c], i) => (
              <div key={`slot-${color}-${i}`} className="ludo-slot"
                style={{ gridRow: r + 1, gridColumn: c + 1, '--pc': COLORS[color] }} />
            )),
          )}

          {/* center goal — four triangles meeting in the middle */}
          <svg className="ludo-goal" viewBox="0 0 40 40" preserveAspectRatio="none"
            style={{ gridRow: '7 / 10', gridColumn: '7 / 10' }}>
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
            return (
              <button
                key={`tok-${t.seat}-${t.token}`}
                className={`ludo-token${clickable ? ' movable' : ''}`}
                style={{ gridRow: t.r + 1, gridColumn: t.c + 1, transform: `translateX(${off}%)`, zIndex: 20 + idx }}
                disabled={!clickable}
                onClick={() => clickable && onMove({ action: 'move', token: t.token })}
                title={nameFor(t.seat)}
              >
                <Pawn color={COLORS[t.color]} />
              </button>
            );
          })}
        </div>

        {/* per-player dice boxes, one at each player's corner */}
        {players.map((p, seat) => {
          const active = seat === current && room.status === 'playing';
          const isMe = seat === youAreIndex;
          const showRoll = isMe && active && phase === 'roll';
          const faceVal = active ? (rolling ? rollFace : dice) : null;
          return (
            <div
              key={`box-${seat}`}
              className={`ludo-dicebox corner-${CORNER[p.color]}${active ? ' active' : ''}`}
              style={{ '--pc': COLORS[p.color] }}
            >
              <div className="ludo-dice-name">{nameFor(seat)}</div>
              <div className={`ludo-die${rolling && active ? ' rolling' : ''}`}>
                {faceVal ? <DieFace value={faceVal} /> : <span className="ludo-die-empty">{active ? '?' : ''}</span>}
              </div>
              {showRoll && <button className="ludo-roll" onClick={() => onMove({ action: 'roll' })}>Roll</button>}
              {active && isMe && phase === 'move' && <div className="ludo-hint">Move a piece</div>}
              {active && !isMe && <div className="ludo-hint">Rolling…</div>}
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
            return (
              <div key={seat} className={`ludo-rank${seat === current ? ' active' : ''}`}>
                <span className="ludo-swatch" style={{ background: COLORS[p.color] }} />
                <span className="ludo-pname">{nameFor(seat)}</span>
                {rank >= 0 ? <b className="ludo-place">#{rank + 1}</b> : <span className="ludo-home">{home}/4</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
