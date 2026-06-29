import { useMemo, useState } from 'react';

const idx = (r, c) => r * 8 + c;
const rc = (i) => ({ r: Math.floor(i / 8), c: i % 8 });

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || 'Opponent';
}

function pieceClass(piece, youAreIndex) {
  if (!piece) return '';
  return piece.owner === youAreIndex ? 'mine' : 'theirs';
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#211d27" />
      <g transform="translate(16 16)">
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * 11}
              y={r * 11}
              width="11"
              height="11"
              fill={(r + c) % 2 ? '#2d6fe8' : '#f1ece5'}
              opacity={(r + c) % 2 ? 0.9 : 0.18}
            />
          ))
        )}
        {[0, 2, 4].map((x) => <circle key={`a${x}`} cx={16 + x * 11} cy="16" r="4.5" fill="#e8806a" />)}
        {[1, 3, 5].map((x) => <circle key={`b${x}`} cx={16 + x * 11} cy="71" r="4.5" fill="#3fc7ad" />)}
      </g>
    </svg>
  );
}

function legalTargets(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const { r, c } = rc(from);
  const dirs = piece.king
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : piece.owner === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  const out = [];
  for (const [dr, dc] of dirs) {
    const step = idx(r + dr, c + dc);
    const jump = idx(r + dr * 2, c + dc * 2);
    const stepInside = r + dr >= 0 && r + dr < 8 && c + dc >= 0 && c + dc < 8;
    const jumpInside = r + dr * 2 >= 0 && r + dr * 2 < 8 && c + dc * 2 >= 0 && c + dc * 2 < 8;
    if (stepInside && !board[step]) out.push(step);
    if (jumpInside && board[step] && board[step].owner !== piece.owner && !board[jump]) out.push(jump);
  }
  return out;
}

export default function Checkers({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [selected, setSelected] = useState(null);
  const myTurn = room.status === 'playing' && state.turn === youAreIndex;
  const targets = useMemo(() => (selected == null ? [] : legalTargets(state.board, selected)), [state.board, selected]);
  const opponent = youAreIndex === 0 ? 1 : 0;

  const clickCell = (i) => {
    const piece = state.board[i];
    if (!myTurn) return;
    if (piece?.owner === youAreIndex && (state.mustFrom == null || state.mustFrom === i)) {
      setSelected(i);
      return;
    }
    if (selected != null && targets.includes(i)) {
      onMove({ from: selected, to: i });
      setSelected(null);
    }
  };

  const status = () => {
    if (room.status === 'over') return 'Game over';
    if (state.mustFrom === selected) return 'Continue the jump';
    return myTurn ? 'Your move' : `${playerName(room, opponent, youAreIndex)} is thinking`;
  };

  return (
    <div className="chk">
      <div className="chk-head">
        <span className={`chk-turn${myTurn ? ' active' : ''}`}>{status()}</span>
        <span className="chk-score">
          Captures: You <b>{state.captured?.[youAreIndex] || 0}</b> · {playerName(room, opponent, youAreIndex)} <b>{state.captured?.[opponent] || 0}</b>
        </span>
      </div>
      <div className="move-tray">
        <span>Last: {state.lastMove ? `${state.lastMove.from} -> ${state.lastMove.to}` : 'none'}</span>
        <span>You captured <b>{state.captured?.[youAreIndex] || 0}</b></span>
        <span>{playerName(room, opponent, youAreIndex)} captured <b>{state.captured?.[opponent] || 0}</b></span>
      </div>
      <div className="history-strip">
        {(state.history || []).slice(-6).map((m, i) => (
          <span key={`${m.from}-${m.to}-${i}`}>{m.by === youAreIndex ? 'You' : playerName(room, m.by, youAreIndex)} {`${m.from}->${m.to}`}{m.captured ? ' x' : ''}</span>
        ))}
      </div>
      <div className="chk-board">
        {state.board.map((piece, i) => {
          const { r, c } = rc(i);
          const dark = (r + c) % 2 === 1;
          const cls = ['chk-cell', dark ? 'dark' : 'light'];
          if (selected === i) cls.push('selected');
          if (targets.includes(i)) cls.push('target');
          return (
            <button key={i} type="button" className={cls.join(' ')} onClick={() => clickCell(i)} disabled={!myTurn && !piece}>
              {piece && (
                <span className={`chk-piece ${pieceClass(piece, youAreIndex)}`}>
                  {piece.king && <b>★</b>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
