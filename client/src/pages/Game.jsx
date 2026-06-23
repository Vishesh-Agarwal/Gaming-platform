// Hosts the active game's component (from the client registry) and the
// game-over overlay. Server is authoritative; this only renders + emits.
import { Suspense, useEffect, useState } from 'react';
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
        <span className="vs">
          {room.players.length > 2 ? `${room.players.length} players` : `vs ${opponent?.username || 'opponent'}`}
        </span>
        <button className="ghost" onClick={onLeave}>
          {room.status === 'over' ? 'Back to lobby' : 'Leave (forfeit)'}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <Suspense fallback={<div className="game-loading">Loading arena…</div>}>
        <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />
      </Suspense>

      {room.status === 'over' && showResult && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>{resultMessage()}</h3>
            {room.result?.scores && (
              room.players.length > 2 ? (
                <div className="overlay-standings">
                  {room.players
                    .map((p) => ({ idx: p.index, name: p.index === youAreIndex ? 'You' : p.username, s: room.result.scores[p.index] ?? 0 }))
                    .sort((a, b) => b.s - a.s)
                    .map((row, i) => (
                      <div key={row.idx} className={`overlay-rank ${row.idx === youAreIndex ? 'you' : ''}`}>
                        <span>{i + 1}. {row.name}</span>
                        <b>{row.s}</b>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="overlay-scores">
                  Your score: <b>{room.result.scores[youAreIndex]}</b> ·{' '}
                  {opponent?.username || 'Opponent'}: <b>{room.result.scores[opponent?.index]}</b>
                </p>
              )
            )}
            <button onClick={onLeave}>Back to lobby</button>
          </div>
        </div>
      )}
    </div>
  );
}
