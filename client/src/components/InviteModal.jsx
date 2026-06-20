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
  const online = friends.filter((f) => onlineIds.has(f.id));
  const offline = friends.filter((f) => !onlineIds.has(f.id));

  const invite = (friendId) => {
    onInvite(friendId, game.id);
    onClose();
  };

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
