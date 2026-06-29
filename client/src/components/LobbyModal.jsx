// Multiplayer lobby panel: shows the room code, members + ready state, lets you
// invite online friends, ready up, and (host) start once everyone's ready.
import { useState } from 'react';
import Modal from './Modal.jsx';

export default function LobbyModal({ lobby, currentUser, friends, onlineIds, onInvite, onReady, onStart, onLeave, maps, onSetMap, modes, options, onSetMode, onSetOption, onSetBots, botCap = 0, manualTeams = false, onSetTeam }) {
  const [copied, setCopied] = useState(false);
  const isHost = lobby.hostId === currentUser.id;
  const mode = lobby.options?.mode || 'ffa';
  const me = lobby.members.find((m) => m.id === currentUser.id);
  const memberIds = new Set(lobby.members.map((m) => m.id));
  const invitable = friends.filter((f) => onlineIds.has(f.id) && !memberIds.has(f.id));
  // Bots count toward the 2-player minimum, so a lone host can start vs AI.
  const bots = Math.min(lobby.options?.bots || 0, botCap);
  const minPlayers = Math.max(2, lobby.minPlayers || 2);
  const allReady = lobby.members.length >= 1
    && lobby.members.length + bots >= minPlayers
    && lobby.members.every((m) => m.ready);

  const copyCode = () => {
    navigator.clipboard?.writeText(lobby.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const close = () => onLeave();

  return (
    <Modal title={`${lobby.gameName} lobby`} onClose={close}>
      <div className="lb-code-row">
        <span className="mode-label">Room code</span>
        <button className="lb-code" type="button" onClick={copyCode} title="Click to copy">
          {lobby.code}
        </button>
        <span className="lb-copied">{copied ? 'Copied!' : 'share to invite'}</span>
      </div>

      <div className="lb-members">
        <span className="mode-label">Players {lobby.members.length}/{lobby.maxPlayers}</span>
        {lobby.members.map((m) => (
          <div key={m.id} className="lb-member">
            <span className={`dot ${m.ready ? 'online' : 'offline'}`} />
            <span className="friend-name">
              {m.id === currentUser.id ? 'You' : m.username}
              {m.id === lobby.hostId && <span className="lb-host">host</span>}
            </span>
            <span className={`lb-ready ${m.ready ? 'yes' : ''}`}>{m.ready ? 'Ready' : 'Not ready'}</span>
          </div>
        ))}
      </div>

      {maps && (
        <div className="lb-map">
          <span className="mode-label">Map</span>
          <select
            value={lobby.options?.map || maps[0].id}
            disabled={!isHost}
            onChange={(e) => onSetMap(e.target.value)}
          >
            {maps.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {!isHost && <span className="muted lb-map-hint">host picks the map</span>}
        </div>
      )}

      {modes && (
        <div className="lb-map">
          <span className="mode-label">Mode</span>
          <select value={mode} disabled={!isHost} onChange={(e) => onSetMode(e.target.value)}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {!isHost && <span className="muted lb-map-hint">host picks the mode</span>}
        </div>
      )}

      {options?.length > 0 && (
        <div className="lb-options">
          {options.map((opt) => {
            if (opt.type === 'textList') {
              const raw = lobby.options?.[opt.key];
              const value = Array.isArray(raw) ? raw.join('\n') : String(raw || opt.default || '');
              return (
                <label key={opt.key} className="lb-text-option">
                  <span className="mode-label">{opt.label}</span>
                  <textarea
                    value={value}
                    rows={4}
                    disabled={!isHost}
                    placeholder={opt.placeholder || ''}
                    onChange={(e) => onSetOption?.(opt.key, e.target.value)}
                  />
                  {opt.hint && <span className="muted lb-map-hint">{opt.hint}</span>}
                </label>
              );
            }
            const value = Math.max(opt.min, Math.min(opt.max, Number(lobby.options?.[opt.key] ?? opt.default)));
            return (
              <div key={opt.key} className="lb-stepper">
                <span className="mode-label">{opt.label}</span>
                <div className="stepper">
                  <button type="button" disabled={!isHost || value <= opt.min} onClick={() => onSetOption?.(opt.key, value - 1)}>-</button>
                  <span className="stepper-val">{value}</span>
                  <button type="button" disabled={!isHost || value >= opt.max} onClick={() => onSetOption?.(opt.key, value + 1)}>+</button>
                </div>
              </div>
            );
          })}
          {!isHost && <span className="muted lb-map-hint">host picks the settings</span>}
        </div>
      )}

      {botCap > 0 && (
        <div className="lb-map">
          <span className="mode-label">Bots</span>
          <select
            value={Math.min(lobby.options?.bots || 0, botCap)}
            disabled={!isHost}
            onChange={(e) => onSetBots(Number(e.target.value))}
          >
            {Array.from({ length: botCap + 1 }, (_, n) => (
              <option key={n} value={n}>{n === 0 ? 'None' : `${n} bot${n > 1 ? 's' : ''}`}</option>
            ))}
          </select>
          {!isHost && <span className="muted lb-map-hint">host adds bots</span>}
        </div>
      )}

      {modes && mode === 'teams' && !manualTeams && (
        <p className="lb-note muted">2v2 — partners are seated opposite automatically. Needs exactly 4 players.</p>
      )}

      {modes && mode === 'teams' && manualTeams && (
        <div className="lb-teams">
          {[0, 1].map((t) => (
            <div key={t} className="lb-team">
              <span className="mode-label">{t === 0 ? 'Team A' : 'Team B'}</span>
              {lobby.members.filter((m) => (m.team ?? 0) === t).map((m) => (
                <div key={m.id} className="lb-member">
                  <span className={`dot ${m.ready ? 'online' : 'offline'}`} />
                  <span className="friend-name">{m.id === currentUser.id ? 'You' : m.username}</span>
                </div>
              ))}
              {(me?.team ?? 0) !== t && (
                <button className="ghost" onClick={() => onSetTeam(t)}>Join {t === 0 ? 'A' : 'B'}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {invitable.length > 0 && (
        <div className="lb-invite">
          <span className="mode-label">Invite friends</span>
          {invitable.map((f) => (
            <div key={f.id} className="invite-row">
              <span className="dot online" />
              <span className="friend-name">{f.username}</span>
              <button onClick={() => onInvite(f.id)}>Invite</button>
            </div>
          ))}
        </div>
      )}

      <div className="lb-actions">
        <button className={me?.ready ? 'ghost' : ''} onClick={() => onReady(!me?.ready)}>
          {me?.ready ? 'Unready' : "I'm ready"}
        </button>
        {isHost && (
          <button onClick={onStart} disabled={!allReady} title={allReady ? '' : `Need ${minPlayers} seats filled and all ready`}>
            Start match
          </button>
        )}
        <button className="ghost" onClick={close}>Leave</button>
      </div>
      {isHost && !allReady && (
        <p className="lb-note muted">Start unlocks when there are at least {minPlayers} seats filled and everyone is ready.</p>
      )}
    </Modal>
  );
}
