// Hosts the active game's component (from the client registry) and the
// game-over overlay. Server is authoritative; this only renders + emits.
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '../games/registry.js';
import { rulesForGame } from '../games/gameMeta.js';
import { getGameMuted, playGameSound, setGameMuted } from '../gameAudio.js';

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

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function scoreFor(room, seat) {
  return room.result?.scores?.[seat] ?? room.state?.scores?.[seat] ?? null;
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || `Player ${Number(seat) + 1}`;
}

function moveLabel(room, move, youAreIndex) {
  if (!move) return '';
  const seat = move.seat ?? move.by;
  const who = playerName(room, seat, youAreIndex);
  if (move.pass) return `${who} passed`;
  if (move.piece) return `${who}: ${move.piece} ${move.from}->${move.to}${move.captured ? ' x' : ''}`;
  if (move.from != null && move.to != null) return `${who}: ${move.from}->${move.to}${move.captured ? ' x' : ''}`;
  if (move.pos != null) return `${who}: cell ${move.pos}${move.flips ? `, ${move.flips} flips` : ''}`;
  if (move.dir) return `${who}: ${move.dir}${move.r},${move.c}${move.boxes ? `, +${move.boxes}` : ''}`;
  return '';
}

export default function Game({ room, youAreIndex, onMove, onLeave, onRematch, rematch, onEmote, onUndoRequest, onUndoAccept, emotes = [], error }) {
  const def = getGame(room.gameId);
  const opponent = room.players.find((p) => p.index !== youAreIndex);
  const myId = room.players.find((p) => p.index === youAreIndex)?.id;
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMuted] = useState(getGameMuted);
  const [now, setNow] = useState(Date.now());
  const [stagePulse, setStagePulse] = useState(false);
  const previousMoveSig = useRef(null);
  const previousStatus = useRef(room.status);
  const previousError = useRef('');
  const previousEmoteCount = useRef(emotes.length);
  const previousSecond = useRef(null);

  // Let the final play/animation finish before the result overlay appears.
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    if (room.status !== 'over') { setShowResult(false); return; }
    const t = setTimeout(() => setShowResult(true), 2000);
    return () => clearTimeout(t);
  }, [room.status]);

  useEffect(() => {
    if (!room.turnEndsAt || room.status !== 'playing') return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [room.turnEndsAt, room.status]);

  const moveSig = useMemo(() => JSON.stringify({
    status: room.status,
    turn: room.state?.turn,
    phase: room.state?.phase,
    round: room.state?.round,
    seq: room.state?.seq,
    lastMove: room.state?.lastMove,
    lastPlay: room.state?.lastPlay,
    lastDrop: room.state?.lastDrop,
    lastShot: room.state?.lastShot,
    result: room.result,
  }), [room.status, room.state, room.result]);

  useEffect(() => {
    if (previousMoveSig.current && previousMoveSig.current !== moveSig && room.status === 'playing') {
      playGameSound('move');
      setStagePulse(true);
      const t = setTimeout(() => setStagePulse(false), 260);
      previousMoveSig.current = moveSig;
      return () => clearTimeout(t);
    }
    previousMoveSig.current = moveSig;
    return undefined;
  }, [moveSig, room.status]);

  useEffect(() => {
    if (previousStatus.current !== room.status && room.status === 'over') {
      const r = room.result;
      if (r?.draw) playGameSound('draw');
      else if (r?.mode === 'teams') {
        const myTeam = room.state?.teams?.[youAreIndex] ?? 0;
        playGameSound(r.winner === myTeam ? 'win' : 'lose');
      } else {
        playGameSound(r?.winner === youAreIndex ? 'win' : 'lose');
      }
    }
    previousStatus.current = room.status;
  }, [room.status, room.result, room.state?.teams, youAreIndex]);

  useEffect(() => {
    if (error && error !== previousError.current) playGameSound('error');
    previousError.current = error || '';
  }, [error]);

  useEffect(() => {
    if (emotes.length > previousEmoteCount.current) playGameSound('emote');
    previousEmoteCount.current = emotes.length;
  }, [emotes.length]);

  const secondsLeft = room.turnEndsAt && room.status === 'playing'
    ? Math.max(0, Math.ceil((room.turnEndsAt - now) / 1000))
    : null;

  useEffect(() => {
    if (secondsLeft != null && secondsLeft > 0 && secondsLeft <= 5 && previousSecond.current !== secondsLeft) {
      playGameSound('tick');
    }
    previousSecond.current = secondsLeft;
  }, [secondsLeft]);

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
  const rules = rulesForGame(def);
  const activeSeat = room.state?.turn;
  const outcomeClass = room.result?.draw
    ? 'draw'
    : room.result?.mode === 'teams'
      ? ((room.result.winner === (room.state?.teams?.[youAreIndex] ?? 0)) ? 'win' : 'loss')
      : (room.result?.winner === youAreIndex ? 'win' : 'loss');
  const rankedScores = room.result?.scores
    ? room.players
        .map((p) => ({ idx: p.index, name: p.index === youAreIndex ? 'You' : p.username, s: room.result.scores[p.index] ?? 0 }))
        .sort((a, b) => b.s - a.s)
    : null;
  const timeline = Array.isArray(room.state?.history)
    ? room.state.history.map((m) => moveLabel(room, m, youAreIndex)).filter(Boolean).slice(-6)
    : [];
  const toggleSound = () => {
    const next = !muted;
    setGameMuted(next);
    setMuted(next);
    if (!next) playGameSound('move');
  };

  return (
    <div className="game-page">
      <header className="game-header">
        <div className="game-title-block">
          <span className="game-label">Playing now</span>
          <h2>{def.name}</h2>
        </div>
        <div className="game-header-actions">
          {secondsLeft != null && (
            <span className={`game-clock${secondsLeft <= 5 ? ' low' : ''}`}>
              {secondsLeft}s
            </span>
          )}
          <div className="rules-wrap">
            <button
              className="rules-toggle ghost"
              onClick={() => setRulesOpen((open) => !open)}
              aria-expanded={rulesOpen}
            >
              Rules
            </button>
            {rulesOpen && (
              <div className="rules-popover">
                <div className="rules-popover-head">
                  <b>{rules.title}</b>
                  <span>{rules.playerCount}</span>
                </div>
                {rules.summary && <p>{rules.summary}</p>}
                {rules.modes.length > 0 && (
                  <div className="rules-section">
                    <span>Modes</span>
                    {rules.modes.map((mode) => (
                      <div key={mode.name} className="rules-row">
                        <b>{mode.name}</b>
                        {mode.hint && <small>{mode.hint}</small>}
                      </div>
                    ))}
                  </div>
                )}
                {rules.options.length > 0 && (
                  <div className="rules-section">
                    <span>Options</span>
                    {rules.options.map((option) => (
                      <div key={option.label} className="rules-row">
                        <b>{option.label}</b>
                        {option.value !== '' && <small>Default: {option.value}</small>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="sound-toggle ghost" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
            {muted ? 'Muted' : 'Sound'}
          </button>
          {room.status === 'playing' && room.undo && (
            room.undo.requestedBy && room.undo.requestedBy !== myId ? (
              <button className="ghost" onClick={onUndoAccept}>Accept undo</button>
            ) : (
              <button className="ghost" disabled={room.undo.requestedBy === myId} onClick={onUndoRequest}>
                {room.undo.requestedBy === myId ? 'Undo sent' : 'Undo'}
              </button>
            )
          )}
          <button className="ghost" onClick={onLeave}>
            {room.status === 'over' ? 'Back to lobby' : 'Leave'}
          </button>
        </div>
      </header>

      <div className="player-rail" style={{ '--player-count': room.players.length }}>
        {room.players.map((p) => {
          const score = scoreFor(room, p.index);
          const active = activeSeat === p.index && room.status === 'playing';
          return (
            <div key={p.id} className={`player-chip${p.index === youAreIndex ? ' you' : ''}${active ? ' active' : ''}`}>
              <span className="player-avatar">{initial(p.index === youAreIndex ? 'You' : p.username)}</span>
              <span className="player-main">
                <b>{p.index === youAreIndex ? 'You' : p.username}</b>
                <small>{active ? 'Turn' : p.index === youAreIndex ? 'Seat you' : `Seat ${p.index + 1}`}</small>
              </span>
              {score != null && <span className="player-score">{score}</span>}
            </div>
          );
        })}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <main className={`game-stage${stagePulse ? ' pulse' : ''}`}>
        <GameErrorBoundary onLeave={onLeave}>
          <Suspense fallback={<div className="game-loading">Loading arena…</div>}>
            <Component room={room} youAreIndex={youAreIndex} onMove={onMove} />
          </Suspense>
        </GameErrorBoundary>
      </main>

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
          <div className={`overlay-card ${outcomeClass}`}>
            <span className="overlay-badge">{room.result?.draw ? 'Draw' : outcomeClass === 'win' ? 'Victory' : 'Result'}</span>
            <h3>{resultMessage()}</h3>
            {room.result?.mode === 'teams' && room.result.teams && (
              <p className="overlay-scores">
                Team A: <b>{room.result.teams[0]}</b> · Team B: <b>{room.result.teams[1]}</b>
              </p>
            )}
            {rankedScores && (
              <div className="overlay-standings">
                {rankedScores.map((row, i) => (
                  <div key={row.idx} className={`overlay-rank ${row.idx === youAreIndex ? 'you' : ''}`}>
                    <span>{i + 1}. {row.name}</span>
                    <b>{row.s}</b>
                  </div>
                ))}
              </div>
            )}
            {timeline.length > 0 && (
              <div className="overlay-timeline">
                <span className="overlay-section-label">Last moves</span>
                {timeline.map((item, i) => (
                  <span key={`${item}-${i}`}>{item}</span>
                ))}
              </div>
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
