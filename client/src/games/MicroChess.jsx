import { useMemo, useState } from 'react';

const SIZE = 5;
const idx = (r, c) => r * SIZE + c;
const rc = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });
const labels = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' };

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || 'Opponent';
}

function pathClear(board, from, to, stepR, stepC) {
  const a = rc(from);
  const b = rc(to);
  let r = a.r + stepR;
  let c = a.c + stepC;
  while (r !== b.r || c !== b.c) {
    if (board[idx(r, c)]) return false;
    r += stepR;
    c += stepC;
  }
  return true;
}

function legalTargets(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const out = [];
  const a = rc(from);
  for (let to = 0; to < board.length; to += 1) {
    if (to === from) continue;
    const target = board[to];
    if (target?.owner === piece.owner) continue;
    const b = rc(to);
    const dr = b.r - a.r;
    const dc = b.c - a.c;
    const adr = Math.abs(dr);
    const adc = Math.abs(dc);
    let ok = false;
    if (piece.type === 'king') ok = Math.max(adr, adc) === 1;
    if (piece.type === 'knight') ok = (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
    if (piece.type === 'pawn') {
      const forward = piece.owner === 0 ? -1 : 1;
      ok = (dc === 0 && dr === forward && !target) || (adc === 1 && dr === forward && target);
    }
    if (piece.type === 'rook' && (dr === 0 || dc === 0)) ok = pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
    if (piece.type === 'bishop' && adr === adc) ok = pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
    if (piece.type === 'queen' && (dr === 0 || dc === 0 || adr === adc)) ok = pathClear(board, from, to, Math.sign(dr), Math.sign(dc));
    if (ok) out.push(to);
  }
  return out;
}

export function Thumbnail() {
  const pieces = ['R', 'N', 'B', 'Q', 'K'];
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#1b1720" />
      <g transform="translate(18 18)">
        {Array.from({ length: 25 }, (_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
          return <rect key={i} x={c * 17} y={r * 17} width="17" height="17" fill={(r + c) % 2 ? '#3fc7ad' : '#f1ece5'} opacity={(r + c) % 2 ? 0.75 : 0.18} />;
        })}
        {pieces.map((p, i) => (
          <text key={p} x={8.5 + i * 17} y="15" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fontWeight="900" fill="#f1ece5">{p}</text>
        ))}
        {pieces.map((p, i) => (
          <text key={`b${p}`} x={8.5 + i * 17} y="83" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fontWeight="900" fill="#e85f70">{p}</text>
        ))}
      </g>
    </svg>
  );
}

export default function MicroChess({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [selected, setSelected] = useState(null);
  const myTurn = room.status === 'playing' && state.turn === youAreIndex && state.winner == null;
  const targets = useMemo(() => (selected == null ? [] : legalTargets(state.board, selected)), [state.board, selected]);
  const opponent = youAreIndex === 0 ? 1 : 0;

  const clickCell = (i) => {
    const piece = state.board[i];
    if (!myTurn) return;
    if (piece?.owner === youAreIndex) {
      setSelected(i);
      return;
    }
    if (selected != null && targets.includes(i)) {
      onMove({ from: selected, to: i });
      setSelected(null);
    }
  };

  const status = room.status === 'over'
    ? 'Game over'
    : myTurn ? 'Your move' : `${playerName(room, opponent, youAreIndex)} to move`;

  return (
    <div className="mc">
      <div className="mc-head">
        <span className={`mc-turn${myTurn ? ' active' : ''}`}>{status}</span>
        <span className="mc-score">
          Captures: You <b>{state.captured?.[youAreIndex] || 0}</b> · {playerName(room, opponent, youAreIndex)} <b>{state.captured?.[opponent] || 0}</b>
        </span>
      </div>
      <div className="move-tray">
        <span>Last: {state.lastMove ? `${labels[state.lastMove.captured?.type] || ''} ${state.lastMove.from} -> ${state.lastMove.to}` : 'none'}</span>
        <span>You captured <b>{state.captured?.[youAreIndex] || 0}</b></span>
        <span>{playerName(room, opponent, youAreIndex)} captured <b>{state.captured?.[opponent] || 0}</b></span>
      </div>
      <div className="history-strip">
        {(state.history || []).slice(-6).map((m, i) => (
          <span key={`${m.from}-${m.to}-${i}`}>{m.seat === youAreIndex ? 'You' : playerName(room, m.seat, youAreIndex)} {labels[m.piece]} {`${m.from}->${m.to}`}{m.captured ? ` x${labels[m.captured]}` : ''}</span>
        ))}
      </div>
      <div className="mc-board">
        {state.board.map((piece, i) => {
          const { r, c } = rc(i);
          const cls = ['mc-cell', (r + c) % 2 ? 'dark' : 'light'];
          if (selected === i) cls.push('selected');
          if (targets.includes(i)) cls.push('target');
          return (
            <button key={i} type="button" className={cls.join(' ')} onClick={() => clickCell(i)} disabled={!myTurn && !piece}>
              {piece && (
                <span className={`mc-piece ${piece.owner === youAreIndex ? 'mine' : 'theirs'} ${piece.type}`}>
                  {labels[piece.type]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
