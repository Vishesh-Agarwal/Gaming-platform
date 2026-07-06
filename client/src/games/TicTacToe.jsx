// Tic-Tac-Toe board UI. Renders authoritative server state and emits moves.
// Player index 0 = X, 1 = O. Two modes: 'classic' and 'shifting' (Three Men's
// Morris — place 3, then slide a piece to a connected empty cell).
import { useState, useEffect, useMemo } from 'react';

const SYMBOLS = ['X', 'O'];

// Marks draw themselves in as pen strokes (pathLength normalizes the dash).
function Mark({ owner }) {
  return owner === 0 ? (
    <svg className="ttt-mark" viewBox="0 0 40 40" aria-hidden>
      <path className="ttt-stroke s1" d="M9 9 L31 31" pathLength="100" />
      <path className="ttt-stroke s2" d="M31 9 L9 31" pathLength="100" />
    </svg>
  ) : (
    <svg className="ttt-mark" viewBox="0 0 40 40" aria-hidden>
      <circle className="ttt-stroke o" cx="20" cy="20" r="12" pathLength="100" />
    </svg>
  );
}

// Laser sweep across the centers of the winning cells (3x3 board only).
function WinLine({ cells }) {
  if (!cells || cells.length < 2) return null;
  const at = (i) => ({ x: (i % 3) * 33.33 + 16.67, y: Math.floor(i / 3) * 33.33 + 16.67 });
  const a = at(cells[0]);
  const b = at(cells[cells.length - 1]);
  return (
    <svg className="ttt-winline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength="100" />
    </svg>
  );
}
const PIECES_PER_PLAYER = 3;

// Mirror of the server adjacency map (for highlighting valid slide targets).
const ADJ = {
  0: [1, 3, 4], 1: [0, 2, 4], 2: [1, 5, 4],
  3: [0, 6, 4], 4: [0, 1, 2, 3, 5, 6, 7, 8], 5: [2, 8, 4],
  6: [3, 7, 4], 7: [6, 8, 4], 8: [5, 7, 4],
};

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const winningCells = (board) => {
  for (const ln of LINES) {
    const [a, b, c] = ln;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return ln;
  }
  return [];
};

// Blitz move clock — a depleting bar driven by the room's server deadline.
// The full turn length is captured once per turn so the bar animates smoothly
// instead of jittering as we re-tick. Goes red in the final few seconds.
function TurnClock({ room }) {
  const turnEndsAt = (room.status === 'playing' && room.turnEndsAt) || null;
  const [, tick] = useState(0);
  const turnMs = useMemo(() => (turnEndsAt ? Math.max(0, turnEndsAt - Date.now()) : 0), [turnEndsAt]);
  useEffect(() => {
    if (!turnEndsAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [turnEndsAt]);
  if (!turnEndsAt) return null;
  const left = Math.max(0, turnEndsAt - Date.now());
  const pct = turnMs > 0 ? Math.max(0, Math.min(100, (left / turnMs) * 100)) : 0;
  const seconds = Math.ceil(left / 1000);
  const low = seconds <= 5;
  return (
    <div className={`ttt-clock${low ? ' low' : ''}`}>
      <div className="ttt-clock-bar" style={{ width: `${pct}%` }} />
      <span className="ttt-clock-num">{seconds}s</span>
    </div>
  );
}

// Card artwork for the lobby games grid.
export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ttt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2b3350" />
          <stop offset="100%" stopColor="#1b2236" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#ttt-bg)" />
      <g stroke="#5b6b8c" strokeWidth="4" strokeLinecap="round">
        <line x1="44" y1="20" x2="44" y2="100" />
        <line x1="76" y1="20" x2="76" y2="100" />
        <line x1="20" y1="44" x2="100" y2="44" />
        <line x1="20" y1="76" x2="100" y2="76" />
      </g>
      {/* X in top-left */}
      <g stroke="#5b8cff" strokeWidth="6" strokeLinecap="round">
        <line x1="26" y1="26" x2="38" y2="38" />
        <line x1="38" y1="26" x2="26" y2="38" />
      </g>
      {/* O in center */}
      <circle cx="60" cy="60" r="9" fill="none" stroke="#ff7eb6" strokeWidth="6" />
      {/* X in bottom-right */}
      <g stroke="#5b8cff" strokeWidth="6" strokeLinecap="round">
        <line x1="82" y1="82" x2="94" y2="94" />
        <line x1="94" y1="82" x2="82" y2="94" />
      </g>
    </svg>
  );
}

// Mode dispatcher — Ultimate has its own state shape + layout, so it's a
// separate component (keeps hook usage unconditional in each).
export default function TicTacToe(props) {
  if (props.room.state.mode === 'ultimate') return <UltimateTTT {...props} />;
  return <ClassicTTT {...props} />;
}

function ClassicTTT({ room, youAreIndex, onMove }) {
  const { board, turn, mode = 'classic' } = room.state;
  const myTurn = room.status === 'playing' && turn === youAreIndex;

  const placed = board.filter((c) => c !== null).length;
  const myCount = board.filter((c) => c === youAreIndex).length;
  const movePhase = mode === 'shifting' && placed >= 2 * PIECES_PER_PLAYER;

  const [selected, setSelected] = useState(null);
  useEffect(() => setSelected(null), [room.state]); // clear on any state update

  const targets = selected != null ? ADJ[selected].filter((i) => board[i] === null) : [];
  const winCells = room.status === 'over' ? winningCells(board) : [];

  const handleClick = (i) => {
    if (!myTurn) return;
    if (!movePhase) {
      // placement (also the whole of classic)
      if (board[i] !== null) return;
      if (mode === 'shifting' && myCount >= PIECES_PER_PLAYER) return;
      onMove({ cell: i });
      return;
    }
    // shifting move phase
    if (board[i] === youAreIndex) { setSelected(i); return; }
    if (selected != null && board[i] === null && ADJ[selected].includes(i)) {
      onMove({ from: selected, to: i });
      setSelected(null);
    }
  };

  const status = () => {
    if (room.status === 'over') return 'Game over';
    if (!myTurn) return "Opponent's move";
    if (mode !== 'shifting') return 'Your move';
    if (!movePhase) return `Place a piece — ${PIECES_PER_PLAYER - myCount} left`;
    return selected == null ? 'Select a piece to slide' : 'Slide to a linked empty cell';
  };

  const cellClass = (v, i) => {
    const cls = ['ttt-cell'];
    if (v !== null) cls.push('filled', v === 0 ? 'mark-x' : 'mark-o');
    if (winCells.includes(i)) cls.push('win');
    if (!movePhase && myTurn && v === null && !(mode === 'shifting' && myCount >= PIECES_PER_PLAYER)) {
      cls.push('playable');
    }
    if (movePhase && myTurn) {
      if (v === youAreIndex) cls.push('selectable');
      if (i === selected) cls.push('selected');
      if (targets.includes(i)) cls.push('target');
    }
    return cls.join(' ');
  };

  const cellDisabled = (v, i) => {
    if (!myTurn || room.status === 'over') return true;
    if (!movePhase) {
      if (v !== null) return true;
      return mode === 'shifting' && myCount >= PIECES_PER_PLAYER;
    }
    // move phase: only your pieces and valid targets are interactive
    return !(v === youAreIndex || targets.includes(i));
  };

  return (
    <div className="ttt">
      <div className="ttt-turn">
        You are <b>{SYMBOLS[youAreIndex]}</b>
        {mode === 'shifting' && <span className="ttt-mode">Shifting</span>}
        {' · '}
        {status()}
      </div>
      <TurnClock room={room} />
      <div className="ttt-board">
        {board.map((v, i) => (
          <button
            key={i}
            className={cellClass(v, i)}
            onClick={() => handleClick(i)}
            disabled={cellDisabled(v, i)}
          >
            {v === null
              ? (targets.includes(i) ? <span className="ttt-dot" /> : null)
              : <Mark key={`${i}-${v}`} owner={v} />}
          </button>
        ))}
        <WinLine cells={winCells} />
      </div>
    </div>
  );
}

// Ultimate Tic-Tac-Toe: nine small boards in a 3x3 meta-grid. Your cell choice
// sends the opponent to the matching board; win three boards in a line.
function UltimateTTT({ room, youAreIndex, onMove }) {
  const { boards, won, active, turn } = room.state;
  const myTurn = room.status === 'playing' && turn === youAreIndex;
  // meta-win highlight: treat only owned (0/1) boards as marks
  const metaLine = room.status === 'over'
    ? winningCells(won.map((w) => (w === 0 || w === 1 ? w : null)))
    : [];

  const boardOpen = (b) => won[b] === null && (active === null || active === b);
  const canPlay = (b, ci) => myTurn && boardOpen(b) && boards[b][ci] === null;

  const status = () => {
    if (room.status === 'over') return 'Game over';
    if (!myTurn) return "Opponent's move";
    return active === null ? 'Your move — play any board' : 'Your move — play the glowing board';
  };

  return (
    <div className="ttt">
      <div className="ttt-turn">
        You are <b>{SYMBOLS[youAreIndex]}</b>
        <span className="ttt-mode">Ultimate</span>
        {' · '}
        {status()}
      </div>
      <TurnClock room={room} />
      <div className="ttt-ultimate">
        {boards.map((bd, b) => {
          const owner = won[b];
          const cls = ['ttt-mini'];
          if (myTurn && boardOpen(b)) cls.push('active');
          if (owner === 0) cls.push('won-x');
          else if (owner === 1) cls.push('won-o');
          else if (owner === 'draw') cls.push('won-draw');
          if (metaLine.includes(b)) cls.push('meta-win');
          return (
            <div key={b} className={cls.join(' ')}>
              {bd.map((v, ci) => (
                <button
                  key={ci}
                  className={`ttt-minicell${v !== null ? ` filled ${v === 0 ? 'mark-x' : 'mark-o'}` : ''}${canPlay(b, ci) ? ' playable' : ''}`}
                  disabled={!canPlay(b, ci)}
                  onClick={() => canPlay(b, ci) && onMove({ board: b, cell: ci })}
                >
                  {v !== null ? <Mark key={`${ci}-${v}`} owner={v} /> : null}
                </button>
              ))}
              {owner === 0 || owner === 1 ? (
                <span className={`ttt-mini-owner ${owner === 0 ? 'mark-x' : 'mark-o'}`}>{SYMBOLS[owner]}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
