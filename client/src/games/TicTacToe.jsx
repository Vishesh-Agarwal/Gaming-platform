// Tic-Tac-Toe board UI. Renders authoritative server state and emits moves.
// Player index 0 = X, 1 = O.
const SYMBOLS = ['X', 'O'];

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
