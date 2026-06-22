// Hosts the active game's component (from the client registry) and the
// game-over overlay. Server is authoritative; this only renders + emits.
import { useEffect, useState } from 'react';
import { getGame } from '../games/registry.js';

export default function Game({ room, youAreIndex, onMove, onLeave, error }) {
  const def = getGame(room.gameId);
  const opponent = room.players.find((p) => p.index !== youAreIndex);

  // Let the final play/animation finish before the result overlay appears.
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (room.status !== 'over') { setShowResult(false); return; }
    const t = setTimeout(() => setShowResult(true), 2000);
    return () => clearTimeout(t);
  }, [room.status]);

  if (!def) {
    return (
      <div className="game-page">
        <p>Unknown game: {room.gameId}</p>
        <button onClick={onLeave}>Back to lobby</button>
      </div>
    );
  }

  const resultMessage = () => {
    const r = room.result;
    if (!r) return '';
    if (r.draw) return "It's a draw!";
    if (r.winner === youAreIndex) {
      return r.forfeit ? 'Opponent left — you win!' : 'You won! 🎉';
    }
    return r.forfeit ? 'You forfeited.' : 'You lost.';
  };

  const Component = def.Component;

  return (
    <div className="game-page">
      <header className="game-header">
        <h2>{def.name}</h2>
        <span className="vs">vs {opponent?.username || 'opponent'}</span>
        <button className="ghost" onClick={onLeave}>
          {room.status === 'over' ? 'Back to lobby' : 'Leave (forfeit)'}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />

      {room.status === 'over' && showResult && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>{resultMessage()}</h3>
            {room.result?.scores && (
              <p className="overlay-scores">
                Your score: <b>{room.result.scores[youAreIndex]}</b> ·{' '}
                {opponent?.username || 'Opponent'}: <b>{room.result.scores[opponent?.index]}</b>
              </p>
            )}
            <button onClick={onLeave}>Back to lobby</button>
          </div>
        </div>
      )}
    </div>
  );
}
