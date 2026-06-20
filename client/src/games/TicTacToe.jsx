// Tic-Tac-Toe board UI. Renders authoritative server state and emits moves.
// Player index 0 = X, 1 = O.
const SYMBOLS = ['X', 'O'];

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

export default function TicTacToe({ room, youAreIndex, onMove }) {
  const { board, turn } = room.state;
  const myTurn = room.status === 'playing' && turn === youAreIndex;

  const handleClick = (cell) => {
    if (!myTurn || board[cell] !== null) return;
    onMove({ cell });
  };

  return (
    <div className="ttt">
      <div className="ttt-turn">
        You are <b>{SYMBOLS[youAreIndex]}</b> ·{' '}
        {room.status === 'over'
          ? 'Game over'
          : myTurn
          ? 'Your move'
          : "Opponent's move"}
      </div>
      <div className="ttt-board">
        {board.map((v, i) => (
          <button
            key={i}
            className={`ttt-cell ${v !== null ? 'filled' : ''} ${
              myTurn && v === null ? 'playable' : ''
            }`}
            onClick={() => handleClick(i)}
            disabled={v !== null || !myTurn}
          >
            {v === null ? '' : SYMBOLS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}
