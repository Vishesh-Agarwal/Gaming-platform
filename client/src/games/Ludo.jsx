// Ludo board UI. Renders authoritative server state and emits {action:'roll'} /
// {action:'move',token}. Seats map to colors via state.colors; board geometry from board.js.
import { LOOP_CELLS, HOME_COLUMN, BASE_SLOTS, cellFor } from './ludo/board.js';

const COLORS = ['#e4453a', '#3fae5a', '#e8c33b', '#4488d8']; // 0 red, 1 green, 2 yellow, 3 blue
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
const START_INDEX = { 0: 0, 13: 1, 26: 2, 39: 3 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const key = (r, c) => `${r},${c}`;

// Precomputed cell-role lookups (module-level, computed once).
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
    if (idx in START_INDEX) return { type: 'start', color: START_INDEX[idx] };
    return { type: 'track', safe: SAFE.has(idx) };
  }
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { type: 'center' };
  const q = baseQuadrant(r, c);
  if (q >= 0) return { type: 'base', color: q };
  return { type: 'void' };
}

const CELLS = [];
for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) CELLS.push({ r, c, role: cellRole(r, c) });

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Card artwork for the lobby games grid.
export function Thumbnail() {
  const sq = (x, y, fill) => <rect x={x} y={y} width="34" height="34" rx="5" fill={fill} />;
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <rect width="120" height="120" fill="#1b2236" />
      {sq(12, 12, '#e4453a')}{sq(74, 12, '#3fae5a')}
      {sq(12, 74, '#4488d8')}{sq(74, 74, '#e8c33b')}
      <rect x="52" y="12" width="16" height="96" fill="#2b3350" />
      <rect x="12" y="52" width="96" height="16" fill="#2b3350" />
      <circle cx="60" cy="60" r="9" fill="#cdd6f0" />
    </svg>
  );
}

export default function Ludo({ room, youAreIndex, onMove }) {
  const st = room.state;
  const { players, colors, current, phase, dice, movable = [], finishedOrder = [], lastEvent } = st;
  const myTurn = room.status === 'playing' && current === youAreIndex;
  const mySeat = youAreIndex;
  const myColor = colors[mySeat];

  const nameFor = (seat) => (seat === youAreIndex ? 'You' : (room.players[seat]?.username || COLOR_NAMES[colors[seat]]));

  // Group tokens by grid cell so co-located tokens fan out.
  const placed = []; // { seat, color, token, r, c }
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

  const canMoveToken = (seat, token) => myTurn && phase === 'move' && seat === mySeat && movable.includes(token);

  const status = () => {
    if (room.status === 'over') return 'Game over';
    if (!myTurn) return `Waiting for ${nameFor(current)}…`;
    if (phase === 'roll') return 'Your turn — roll the dice';
    return 'Pick a highlighted token to move';
  };

  const eventText = () => {
    if (!lastEvent) return null;
    const who = nameFor(lastEvent.seat);
    if (lastEvent.type === 'capture') return `${who} captured a token!`;
    if (lastEvent.type === 'home') return `${who} sent a token home!`;
    if (lastEvent.type === 'sixes') return `${who} rolled three 6s — turn skipped`;
    if (lastEvent.type === 'pass') return `${who} had no move`;
    return null;
  };

  return (
    <div className="ludo">
      <div className="ludo-main">
        <div className="ludo-board">
          {CELLS.map(({ r, c, role }) => {
            const cls = ['ludo-cell', `ludo-${role.type}`];
            if (role.safe) cls.push('ludo-safe');
            const style = { gridRow: r + 1, gridColumn: c + 1 };
            if (role.type === 'base') style.background = rgba(COLORS[role.color], 0.28);
            if (role.type === 'home' || role.type === 'start') style.background = rgba(COLORS[role.color], 0.55);
            return <div key={key(r, c)} className={cls.join(' ')} style={style} />;
          })}

          {/* base parking rings */}
          {[0, 1, 2, 3].map((color) =>
            BASE_SLOTS[color].map(([r, c], i) => (
              <div key={`slot-${color}-${i}`} className="ludo-slot"
                style={{ gridRow: r + 1, gridColumn: c + 1, borderColor: COLORS[color] }} />
            )),
          )}

          {/* tokens */}
          {placed.map((t) => {
            const stack = byCell.get(key(t.r, t.c));
            const idx = stack.indexOf(t);
            const n = stack.length;
            const off = n > 1 ? (idx - (n - 1) / 2) * 22 : 0;
            const clickable = canMoveToken(t.seat, t.token);
            return (
              <button
                key={`tok-${t.seat}-${t.token}`}
                className={`ludo-token${clickable ? ' movable' : ''}`}
                style={{
                  gridRow: t.r + 1, gridColumn: t.c + 1,
                  background: COLORS[t.color],
                  transform: `translateX(${off}%)`,
                  zIndex: 10 + idx,
                }}
                disabled={!clickable}
                onClick={() => clickable && onMove({ action: 'move', token: t.token })}
                title={nameFor(t.seat)}
              />
            );
          })}
        </div>

        <aside className="ludo-side">
          <div className="ludo-you">
            You are <b style={{ color: COLORS[myColor] }}>{COLOR_NAMES[myColor]}</b>
          </div>
          <div className="ludo-status">{status()}</div>

          <div className="ludo-dice">
            <div className="ludo-die" style={{ color: dice ? COLORS[colors[current]] : '#8893b0' }}>
              {dice ?? '–'}
            </div>
            {myTurn && phase === 'roll' && (
              <button className="ludo-roll" onClick={() => onMove({ action: 'roll' })}>Roll</button>
            )}
          </div>

          {eventText() && <div className="ludo-event">{eventText()}</div>}

          <div className="ludo-standings">
            <span className="mode-label">Players</span>
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
        </aside>
      </div>
    </div>
  );
}
