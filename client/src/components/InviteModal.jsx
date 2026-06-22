// Opens when a game is clicked: invite an online friend, or add a new friend.
import { useState } from 'react';
import Modal from './Modal.jsx';

export default function InviteModal({
  game,
  friends,
  onlineIds,
  onInvite,
  onAddFriend,
  onClose,
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState(game.modes?.[0]?.id || null);
  const [opts, setOpts] = useState(() =>
    Object.fromEntries((game.options || []).map((o) => [o.key, o.default]))
  );
  const online = friends.filter((f) => onlineIds.has(f.id));
  const offline = friends.filter((f) => !onlineIds.has(f.id));

  const setOpt = (key, min, max, delta) =>
    setOpts((o) => ({ ...o, [key]: Math.max(min, Math.min(max, o[key] + delta)) }));

  const invite = (friendId) => {
    const payload = { ...(mode ? { mode } : {}), ...opts };
    onInvite(friendId, game.id, Object.keys(payload).length ? payload : undefined);
    onClose();
  };

  const selectedMode = game.modes?.find((m) => m.id === mode);

  const submitAdd = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onAddFriend(n);
    setName('');
  };

  return (
    <Modal title={`Play ${game.name}`} onClose={onClose}>
      <p className="muted">Invite a friend to play with you.</p>

      {game.modes?.length > 1 && (
        <div className="mode-picker">
          <span className="mode-label">Mode</span>
          <div className="mode-options">
            {game.modes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mode-chip ${mode === m.id ? 'active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          {selectedMode?.hint && <p className="mode-hint muted">{selectedMode.hint}</p>}
        </div>
      )}

      {(game.options || []).map((o) => (
        <div key={o.key} className="opt-stepper">
          <span className="mode-label">{o.label}</span>
          <div className="stepper">
            <button type="button" onClick={() => setOpt(o.key, o.min, o.max, -1)} disabled={opts[o.key] <= o.min}>−</button>
            <span className="stepper-val">{opts[o.key]}</span>
            <button type="button" onClick={() => setOpt(o.key, o.min, o.max, 1)} disabled={opts[o.key] >= o.max}>+</button>
          </div>
        </div>
      ))}

      {friends.length === 0 && (
        <p className="muted">You have no friends yet — add one below to get started.</p>
      )}

      {online.length > 0 && (
        <div className="invite-list">
          {online.map((f) => (
            <div key={f.id} className="invite-row">
              <span className="dot online" />
              <span className="friend-name">{f.username}</span>
              <button onClick={() => invite(f.id)}>Invite</button>
            </div>
          ))}
        </div>
      )}

      {offline.length > 0 && (
        <div className="invite-list">
          {offline.map((f) => (
            <div key={f.id} className="invite-row dim">
              <span className="dot offline" />
              <span className="friend-name">{f.username}</span>
              <span className="muted">offline</span>
            </div>
          ))}
        </div>
      )}

      <form className="add-friend modal-add" onSubmit={submitAdd}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a friend by username"
        />
        <button type="submit">Add</button>
      </form>
    </Modal>
  );
}
