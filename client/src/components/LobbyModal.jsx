// Multiplayer lobby panel: shows the room code, members + ready state, lets you
// invite online friends, ready up, and (host) start once everyone's ready.
import { useState } from 'react';
import Modal from './Modal.jsx';

export default function LobbyModal({ lobby, currentUser, friends, onlineIds, onInvite, onReady, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const isHost = lobby.hostId === currentUser.id;
  const me = lobby.members.find((m) => m.id === currentUser.id);
  const memberIds = new Set(lobby.members.map((m) => m.id));
  const invitable = friends.filter((f) => onlineIds.has(f.id) && !memberIds.has(f.id));
  const allReady = lobby.members.length >= 2 && lobby.members.every((m) => m.ready);

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
          <button onClick={onStart} disabled={!allReady} title={allReady ? '' : 'Need ≥2 players, all ready'}>
            Start match
          </button>
        )}
        <button className="ghost" onClick={close}>Leave</button>
      </div>
      {isHost && !allReady && (
        <p className="lb-note muted">Start unlocks when there are at least 2 players and everyone is ready.</p>
      )}
    </Modal>
  );
}
