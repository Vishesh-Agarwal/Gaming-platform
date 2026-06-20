// The hub: friends list (with presence + invite), add-friend, pending requests,
// incoming game invites, and the chat panel.
import { useState } from 'react';
import ChatPanel from '../components/ChatPanel.jsx';
import { availableGames } from '../games/registry.js';

export default function Lobby({
  friends,
  onlineIds,
  requests,
  invites,
  selectedFriendId,
  conversations,
  unread,
  currentUser,
  notice,
  onAddFriend,
  onAccept,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onSelectFriend,
  onSendChat,
  onLogout,
}) {
  const [addName, setAddName] = useState('');
  const selectedFriend = friends.find((f) => f.id === selectedFriendId) || null;
  const defaultGame = availableGames[0];

  const submitAdd = (e) => {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    onAddFriend(name);
    setAddName('');
  };

  return (
    <div className="lobby">
      <aside className="sidebar">
        <div className="me">
          <span>
            Signed in as <b>{currentUser.username}</b>
          </span>
          <button className="link" onClick={onLogout}>
            Log out
          </button>
        </div>

        <form className="add-friend" onSubmit={submitAdd}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Add friend by username"
          />
          <button type="submit">Add</button>
        </form>

        {requests.length > 0 && (
          <section className="requests">
            <h3>Friend requests</h3>
            {requests.map((r) => (
              <div key={r.requestId} className="request-row">
                <span>{r.fromUsername}</span>
                <button onClick={() => onAccept(r.requestId)}>Accept</button>
              </div>
            ))}
          </section>
        )}

        <section className="friends">
          <h3>Friends</h3>
          {friends.length === 0 && <p className="muted">No friends yet.</p>}
          {friends.map((f) => {
            const online = onlineIds.has(f.id);
            const count = unread[f.id] || 0;
            return (
              <div
                key={f.id}
                className={`friend-row ${f.id === selectedFriendId ? 'active' : ''}`}
                onClick={() => onSelectFriend(f.id)}
              >
                <span className={`dot ${online ? 'online' : 'offline'}`} />
                <span className="friend-name">{f.username}</span>
                {count > 0 && <span className="badge">{count}</span>}
                <button
                  className="invite-btn"
                  disabled={!online}
                  title={online ? 'Invite to play' : 'Offline'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvite(f.id, defaultGame.id);
                  }}
                >
                  Play
                </button>
              </div>
            );
          })}
        </section>
      </aside>

      <main className="main">
        {notice && <div className="notice">{notice}</div>}

        {invites.length > 0 && (
          <div className="invites">
            {invites.map((inv) => (
              <div key={inv.inviteId} className="invite-card">
                <span>
                  <b>{inv.from.username}</b> invited you to{' '}
                  <b>{inv.gameName}</b>
                </span>
                <div className="invite-actions">
                  <button onClick={() => onAcceptInvite(inv.inviteId)}>Accept</button>
                  <button className="ghost" onClick={() => onDeclineInvite(inv.inviteId)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ChatPanel
          friend={selectedFriend}
          messages={conversations[selectedFriendId] || []}
          currentUserId={currentUser.id}
          onSend={onSendChat}
        />
      </main>
    </div>
  );
}
