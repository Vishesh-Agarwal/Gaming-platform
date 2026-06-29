import { useEffect, useState } from 'react';

const SIZE = 4;

function neighbors(pos) {
  const r = Math.floor(pos / SIZE);
  const c = pos % SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push(nr * SIZE + nc);
    }
  }
  return out;
}

function pathFor(grid, word) {
  const letters = word.toUpperCase().split('');
  if (!letters.length) return [];
  function dfs(pos, i, used, path) {
    if (grid[pos] !== letters[i]) return null;
    const nextPath = [...path, pos];
    if (i === letters.length - 1) return nextPath;
    used.add(pos);
    for (const n of neighbors(pos)) {
      if (!used.has(n)) {
        const found = dfs(n, i + 1, new Set(used), nextPath);
        if (found) return found;
      }
    }
    return null;
  }
  for (let pos = 0; pos < grid.length; pos += 1) {
    const found = dfs(pos, 0, new Set(), []);
    if (found) return found;
  }
  return [];
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || `Player ${seat + 1}`;
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#1d1a24" />
      <g transform="translate(22 22)">
        {'WORDGAMEPLAYRACE'.split('').slice(0, 16).map((ch, i) => (
          <g key={i} transform={`translate(${(i % 4) * 19}, ${Math.floor(i / 4) * 19})`}>
            <rect width="16" height="16" rx="4" fill={i % 3 ? '#f1ece5' : '#3fc7ad'} />
            <text x="8" y="12" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fontWeight="800" fill="#18151c">{ch}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function Boggle({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [word, setWord] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!room.turnEndsAt || room.status !== 'playing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [room.turnEndsAt, room.status]);
  const seconds = room.turnEndsAt ? Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000)) : 0;
  const previewPath = pathFor(state.grid, word);
  const missed = (state.possibleWords || []).filter((w) => !(state.found?.[youAreIndex] || []).includes(w)).slice(0, 12);

  const submit = (event) => {
    event.preventDefault();
    if (!word.trim() || room.status !== 'playing') return;
    onMove({ word });
    setWord('');
  };

  return (
    <div className="bog">
      <div className="bog-head">
        <span className={`bog-timer${seconds <= 10 ? ' low' : ''}`}>{seconds}s</span>
        <span className="bog-title">Find words on the grid</span>
      </div>
      <div className="bog-layout">
        <div className="bog-board">
          {state.grid.map((letter, i) => <span key={i} className={`bog-tile${previewPath.includes(i) ? ' traced' : ''}`}>{letter}</span>)}
        </div>
        <aside className="bog-side">
          <div className="bog-scores">
            {room.players.map((p) => (
              <div key={p.id} className={p.index === youAreIndex ? 'you' : ''}>
                <span>{playerName(room, p.index, youAreIndex)}</span>
                <b>{state.scores?.[p.index] || 0}</b>
              </div>
            ))}
          </div>
          <form className="bog-entry" onSubmit={submit}>
            <input value={word} onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} disabled={room.status !== 'playing'} placeholder="WORD" />
            <button disabled={!word.trim() || room.status !== 'playing'}>Submit</button>
          </form>
          <div className="bog-found">
            {(state.submissions?.[youAreIndex] || []).slice().reverse().map((row, i) => (
              <span key={`${row.word}-${i}`}>{row.word} <b>+{row.points}</b></span>
            ))}
          </div>
          {room.status === 'over' && missed.length > 0 && (
            <div className="bog-missed">
              <b>Missed words</b>
              {missed.map((w) => <span key={w}>{w}</span>)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
