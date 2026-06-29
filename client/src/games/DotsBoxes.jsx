const edgeKey = (dir, r, c) => `${dir}:${r}:${c}`;

function boxEdges(r, c) {
  return [edgeKey('h', r, c), edgeKey('h', r + 1, c), edgeKey('v', r, c), edgeKey('v', r, c + 1)];
}

function wouldComplete(edges, state, dir, r, c) {
  const next = new Set(edges);
  next.add(edgeKey(dir, r, c));
  let count = 0;
  for (let br = 0; br < state.boxes; br += 1) {
    for (let bc = 0; bc < state.boxes; bc += 1) {
      const i = br * state.boxes + bc;
      if (state.owners?.[i] != null) continue;
      if (boxEdges(br, bc).every((k) => next.has(k))) count += 1;
    }
  }
  return count;
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || 'Opponent';
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#211d27" />
      <g transform="translate(24 24)">
        {Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) => <rect key={`${r}-${c}`} x={c * 18 + 3} y={r * 18 + 3} width="12" height="12" rx="2" fill={(r + c) % 2 ? '#3fc7ad' : '#f2b049'} opacity="0.6" />)
        )}
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => <circle key={`${r}-${c}`} cx={c * 18} cy={r * 18} r="3.5" fill="#f1ece5" />)
        )}
      </g>
    </svg>
  );
}

export default function DotsBoxes({ room, youAreIndex, onMove }) {
  const state = room.state;
  const edges = new Set(state.edges || []);
  const myTurn = room.status === 'playing' && state.turn === youAreIndex;
  const opponent = youAreIndex === 0 ? 1 : 0;
  const preview = myTurn ? Array.from({ length: state.dots }, (_, r) => Array.from({ length: state.dots }, (_, c) => ({
    h: c < state.boxes ? wouldComplete(edges, state, 'h', r, c) : 0,
    v: r < state.boxes ? wouldComplete(edges, state, 'v', r, c) : 0,
  }))) : [];
  const modeLabel = state.mode === 'race' ? `Race to ${state.targetScore}` : state.mode === 'sudden' ? 'First box wins' : 'Full board';

  return (
    <div className="dbx">
      <div className="dbx-head">
        <span className={`dbx-turn${myTurn ? ' active' : ''}`}>
          {room.status === 'over' ? 'Game over' : myTurn ? 'Your edge' : `${playerName(room, opponent, youAreIndex)} to draw`}
        </span>
        <span className="dbx-score">You <b>{state.scores?.[youAreIndex] || 0}</b> · {playerName(room, opponent, youAreIndex)} <b>{state.scores?.[opponent] || 0}</b></span>
        <span className="dbx-mode">{modeLabel}</span>
      </div>
      <div className="history-strip">
        {(state.history || []).slice(-6).map((m, i) => (
          <span key={`${m.dir}-${m.r}-${m.c}-${i}`}>{m.by === youAreIndex ? 'You' : playerName(room, m.by, youAreIndex)} {m.dir}{m.r},{m.c}{m.boxes ? ` +${m.boxes}` : ''}</span>
        ))}
      </div>
      <div className="dbx-board" style={{ '--dbx-boxes': state.boxes }}>
        {Array.from({ length: state.dots }, (_, r) => (
          <div key={`row-${r}`} className="dbx-dot-row">
            {Array.from({ length: state.dots }, (_, c) => (
              <div key={`${r}-${c}`} className="dbx-dot-cell">
                <span className="dbx-dot" />
                {c < state.boxes && (
                  <button
                    type="button"
                    className={`dbx-edge h ${edges.has(edgeKey('h', r, c)) ? 'taken' : ''}${preview[r]?.[c]?.h ? ' completes' : ''}`}
                    disabled={!myTurn || edges.has(edgeKey('h', r, c))}
                    onClick={() => onMove({ dir: 'h', r, c })}
                    aria-label={`Horizontal edge ${r},${c}`}
                  />
                )}
                {r < state.boxes && (
                  <button
                    type="button"
                    className={`dbx-edge v ${edges.has(edgeKey('v', r, c)) ? 'taken' : ''}${preview[r]?.[c]?.v ? ' completes' : ''}`}
                    disabled={!myTurn || edges.has(edgeKey('v', r, c))}
                    onClick={() => onMove({ dir: 'v', r, c })}
                    aria-label={`Vertical edge ${r},${c}`}
                  />
                )}
                {r < state.boxes && c < state.boxes && (
                  <span className={`dbx-box ${state.owners?.[r * state.boxes + c] === youAreIndex ? 'mine' : state.owners?.[r * state.boxes + c] != null ? 'theirs' : ''}`} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
