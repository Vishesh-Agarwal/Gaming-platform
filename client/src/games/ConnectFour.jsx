const PLAYER_COLORS = ['#f2b049', '#3fc7ad'];

function ownerClass(owner, youAreIndex) {
  if (owner === null || owner === undefined) return 'empty';
  return owner === youAreIndex ? 'mine' : 'theirs';
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="c4-thumb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24283a" />
          <stop offset="100%" stopColor="#171b28" />
        </linearGradient>
        <linearGradient id="c4-thumb-board" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2d6fe8" />
          <stop offset="100%" stopColor="#18489e" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#c4-thumb-bg)" />
      <rect x="13" y="22" width="94" height="78" rx="10" fill="url(#c4-thumb-board)" />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 7 }, (_, c) => {
          const filled = (r === 5 && c < 4) || (r === 4 && c > 0 && c < 4) || (r === 3 && c === 3);
          const color = (r + c) % 2 === 0 ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
          return (
            <circle
              key={`${r}-${c}`}
              cx={24 + c * 12}
              cy={32 + r * 11}
              r="4.3"
              fill={filled ? color : '#111827'}
              opacity={filled ? 1 : 0.9}
            />
          );
        })
      )}
    </svg>
  );
}

export default function ConnectFour({ room, youAreIndex, onMove }) {
  const state = room.state;
  const myTurn = room.status === 'playing' && state.turn === youAreIndex;
  const meColor = PLAYER_COLORS[youAreIndex] || PLAYER_COLORS[0];
  const themColor = PLAYER_COLORS[youAreIndex === 0 ? 1 : 0] || PLAYER_COLORS[1];
  const isPopOut = state.mode === 'popout';
  const modeLabel = state.mode === 'five' ? 'Five-in-a-Row' : state.mode === 'popout' ? 'PopOut' : 'Classic';
  const winningCells = new Set((room.result?.line || []).map((cell) => `${cell.col}:${cell.row}`));

  const status = () => {
    if (room.status === 'over') return 'Game over';
    return myTurn ? 'Your drop' : "Opponent's drop";
  };

  return (
    <div className="c4" style={{ '--c4-me': meColor, '--c4-them': themColor }}>
      <div className="c4-hud">
        <span className={`c4-turn${myTurn ? ' active' : ''}`}>{status()}</span>
        <span className="c4-mode">{modeLabel} · connect {state.target || 4}</span>
        <span className="c4-chip-label">
          You are <i className="c4-chip mine" /> {youAreIndex === 0 ? 'gold' : 'teal'}
        </span>
      </div>

      <div className="c4-board" style={{ '--cols': state.cols }}>
        {state.board.map((stack, col) => {
          const full = stack.length >= state.rows;
          return (
            <div key={col} className="c4-col-wrap">
              <button
                type="button"
                className="c4-col"
                aria-label={`Drop in column ${col + 1}`}
                disabled={!myTurn || full}
                onClick={() => onMove({ col })}
              >
                {Array.from({ length: state.rows }, (_, topRow) => {
                  const row = state.rows - 1 - topRow;
                  const owner = row < stack.length ? stack[row] : null;
                  const last = state.lastDrop?.col === col && state.lastDrop?.row === row;
                  const win = winningCells.has(`${col}:${row}`);
                  return (
                    <span
                      key={row}
                      className={`c4-cell ${ownerClass(owner, youAreIndex)}${last ? ' last' : ''}${win ? ' win' : ''}`}
                    >
                      {owner !== null ? <span className="c4-disc" /> : null}
                    </span>
                  );
                })}
              </button>
              {isPopOut && (
                <button
                  type="button"
                  className="c4-pop"
                  disabled={!myTurn || stack[0] !== youAreIndex}
                  onClick={() => onMove({ col, action: 'pop' })}
                  aria-label={`Pop from column ${col + 1}`}
                >
                  Pop
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
