import { useMemo } from 'react';

const idx = (r, c) => r * 8 + c;
const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

function legalMoves(board, seat) {
  const opp = seat === 0 ? 1 : 0;
  const out = [];
  for (let pos = 0; pos < 64; pos += 1) {
    if (board[pos] !== null) continue;
    const r0 = Math.floor(pos / 8);
    const c0 = pos % 8;
    let ok = false;
    for (const [dr, dc] of dirs) {
      let r = r0 + dr;
      let c = c0 + dc;
      let seen = false;
      while (inside(r, c) && board[idx(r, c)] === opp) {
        seen = true;
        r += dr;
        c += dc;
      }
      if (seen && inside(r, c) && board[idx(r, c)] === seat) ok = true;
    }
    if (ok) out.push(pos);
  }
  return out;
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || 'Opponent';
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#173725" />
      <rect x="18" y="18" width="84" height="84" rx="8" fill="#2c8a57" />
      <g stroke="#185334" strokeWidth="1">{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${28 + i * 10.5} 18V102M18 ${28 + i * 10.5}H102`} />)}</g>
      <circle cx="49" cy="49" r="8" fill="#f1ece5" />
      <circle cx="70" cy="49" r="8" fill="#18151c" />
      <circle cx="49" cy="70" r="8" fill="#18151c" />
      <circle cx="70" cy="70" r="8" fill="#f1ece5" />
    </svg>
  );
}

export default function Reversi({ room, youAreIndex, onMove }) {
  const state = room.state;
  const myTurn = room.status === 'playing' && state.turn === youAreIndex;
  const moves = useMemo(() => legalMoves(state.board, youAreIndex), [state.board, youAreIndex]);
  const opponent = youAreIndex === 0 ? 1 : 0;
  const canPass = myTurn && moves.length === 0;

  return (
    <div className="rev">
      <div className="rev-head">
        <span className={`rev-turn${myTurn ? ' active' : ''}`}>
          {room.status === 'over' ? 'Game over' : myTurn ? 'Your move' : `${playerName(room, opponent, youAreIndex)} to play`}
        </span>
        <span className="rev-score">
          You <b>{state.scores?.[youAreIndex] || 0}</b> · {playerName(room, opponent, youAreIndex)} <b>{state.scores?.[opponent] || 0}</b>
        </span>
        <button className="ghost" disabled={!canPass} onClick={() => onMove({ pass: true })}>Pass</button>
      </div>
      <div className="move-tray">
        <span>Legal moves <b>{moves.length}</b></span>
        <span>Last: {state.lastMove?.pass ? 'pass' : state.lastMove?.pos != null ? `cell ${state.lastMove.pos}` : 'none'}</span>
        <span>Flipped <b>{state.lastMove?.flips?.length || 0}</b></span>
      </div>
      <div className="history-strip">
        {(state.history || []).slice(-6).map((m, i) => (
          <span key={`${m.pos ?? 'p'}-${i}`}>{m.seat === youAreIndex ? 'You' : playerName(room, m.seat, youAreIndex)} {m.pass ? 'passed' : `cell ${m.pos} +${m.flips}`}</span>
        ))}
      </div>
      <div className="rev-board">
        {state.board.map((cell, pos) => {
          const legal = myTurn && moves.includes(pos);
          return (
            <button key={pos} type="button" className={`rev-cell${legal ? ' legal' : ''}${state.lastMove?.pos === pos ? ' last' : ''}`} disabled={!legal} onClick={() => onMove({ pos })}>
              {cell !== null && <span className={`rev-disc ${cell === youAreIndex ? 'mine' : 'theirs'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
