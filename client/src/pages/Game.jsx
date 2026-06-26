// Hosts the active game's component (from the client registry) and the
// game-over overlay. Server is authoritative; this only renders + emits.
import { Component, Suspense, useEffect, useState } from 'react';
import { getGame } from '../games/registry.js';

// Contains chunk-load failures (e.g. a stale lazy chunk 404 after redeploy)
// or render errors from the game component to the game pane, instead of
// letting them unwind to the app root and blank the whole app.
class GameErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err) {
    console.error('[game] failed to load', err);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="game-loading">
          <p>Couldn't load this game.</p>
          <button onClick={this.props.onLeave}>Back to lobby</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EMOTES = ['👍', '😂', '😮', '😢', '🔥', '🎉', '😎', '💀', '❤️', '🤝'];

export default function Game({ room, youAreIndex, onMove, onLeave, onRematch, rematch, onEmote, emotes = [], error }) {
  const def = getGame(room.gameId);
  const opponent = room.players.find((p) => p.index !== youAreIndex);
  const myId = room.players.find((p) => p.index === youAreIndex)?.id;
  const [emoteOpen, setEmoteOpen] = useState(false);

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
    if (r.mode === 'teams') {
      if (r.draw) return "It's a draw!";
      const myTeam = room.state?.teams?.[youAreIndex] ?? 0;
      return r.winner === myTeam ? 'Your team wins! 🎉' : 'Your team lost.';
    }
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

      <GameErrorBoundary onLeave={onLeave}>
        <Suspense fallback={<div className="game-loading">Loading arena…</div>}>
          <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />
        </Suspense>
      </GameErrorBoundary>

      {/* floating reaction bubbles from any player */}
      {emotes.length > 0 && (
        <div className="emote-bubbles">
          {emotes.map((e) => (
            <div key={e.id} className="emote-bubble">
              <span className="emote-glyph">{e.emote}</span>
              <span className="emote-who">{e.from === myId ? 'You' : e.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* emote tray — available in every game */}
      {onEmote && (
        <div className={`emote-bar${emoteOpen ? ' open' : ''}`}>
          {emoteOpen && (
            <div className="emote-tray">
              {EMOTES.map((em) => (
                <button key={em} className="emote-pick" onClick={() => { onEmote(em); setEmoteOpen(false); }}>{em}</button>
              ))}
            </div>
          )}
          <button className="emote-toggle ghost" onClick={() => setEmoteOpen((o) => !o)} aria-label="Send a reaction">
            {emoteOpen ? '✕' : '😀'}
          </button>
        </div>
      )}

      {room.status === 'over' && showResult && (
        <div className="overlay">
          <div className="overlay-card">
            <h3>{resultMessage()}</h3>
            {room.result?.mode === 'teams' && room.result.teams && (
              <p className="overlay-scores">
                Team A: <b>{room.result.teams[0]}</b> · Team B: <b>{room.result.teams[1]}</b>
              </p>
            )}
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
            <div className="overlay-actions">
              {onRematch && !room.result?.forfeit && (() => {
                const accepted = rematch?.accepted || [];
                const iAccepted = myId != null && accepted.includes(myId);
                const someoneElse = accepted.some((id) => id !== myId);
                if (iAccepted) {
                  return <button disabled className="ghost">Waiting for {room.players.length > 2 ? 'players' : 'opponent'}…</button>;
                }
                return (
                  <button onClick={onRematch}>
                    {someoneElse ? 'Accept rematch 🔁' : 'Rematch 🔁'}
                  </button>
                );
              })()}
              <button className="ghost" onClick={onLeave}>Back to lobby</button>
            </div>
            {rematch?.accepted?.some((id) => id !== myId) && !rematch.accepted.includes(myId) && (
              <p className="overlay-rematch-hint">{room.players.length > 2 ? 'Someone wants' : 'Opponent wants'} a rematch!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
