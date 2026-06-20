// Main page: top bar, games grid (center), narrow chat (right).
// Clicking a game opens the invite/add-friend modal.
import { useEffect, useState } from 'react';
import { availableGames } from '../games/registry.js';
import { APP_NAME } from '../config.js';
import GameCard from '../components/GameCard.jsx';
import InviteModal from '../components/InviteModal.jsx';
import FriendsChat from '../components/FriendsChat.jsx';
import Modal from '../components/Modal.jsx';

// Chat panel width: default bumped +10% again (352 -> 387), user-resizable + persisted.
const CHAT_WIDTH_KEY = 'gp-chat-width-v2';
const DEFAULT_CHAT_WIDTH = 387;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 680;

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
  onBack,
  onSendChat,
  onLogout,
}) {
  const [pickedGame, setPickedGame] = useState(null); // game chosen to invite into
  const [showAdd, setShowAdd] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [addName, setAddName] = useState('');

  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem(CHAT_WIDTH_KEY));
    return saved >= MIN_CHAT_WIDTH && saved <= MAX_CHAT_WIDTH ? saved : DEFAULT_CHAT_WIDTH;
  });
  useEffect(() => {
    localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth));
  }, [chatWidth]);

  // Drag the divider to resize the chat panel (it's anchored to the right edge).
  const startResize = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const next = window.innerWidth - ev.clientX;
      setChatWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const submitAdd = (e) => {
    e.preventDefault();
    const n = addName.trim();
    if (!n) return;
    onAddFriend(n);
    setAddName('');
    setShowAdd(false);
  };

  return (
    <div className="app">
      {/* Incoming game invites — float on top, hard to miss */}
      {invites.length > 0 && (
        <div className="invite-banner">
          {invites.map((inv) => (
            <div key={inv.inviteId} className="invite-card">
              <span>
                <b>{inv.from.username}</b> invited you to <b>{inv.gameName}</b>
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

      <header className="topbar">
        <span className="brand">🎮 {APP_NAME}</span>
        <span className="spacer" />
        <button className="ghost" onClick={() => setShowAdd(true)}>
          + Add friend
        </button>
        <button className="ghost requests-btn" onClick={() => setShowRequests(true)}>
          Requests
          {requests.length > 0 && <span className="badge">{requests.length}</span>}
        </button>
        <span className="username">{currentUser.username}</span>
        <button className="link" onClick={onLogout}>
          Log out
        </button>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <div className="app-body" style={{ '--chat-w': `${chatWidth}px` }}>
        <main className="games-area">
          <h2>Games</h2>
          <p className="muted">Pick a game, then invite a friend to play.</p>
          <div className="games-grid">
            {availableGames.map((g) => (
              <GameCard key={g.id} game={g} onClick={setPickedGame} />
            ))}
          </div>
        </main>

        <div
          className="resizer"
          onMouseDown={startResize}
          title="Drag to resize chat"
          role="separator"
          aria-orientation="vertical"
        />

        <aside className="chat-side">
          <FriendsChat
            friends={friends}
            onlineIds={onlineIds}
            unread={unread}
            selectedFriendId={selectedFriendId}
            onSelectFriend={onSelectFriend}
            onBack={onBack}
            conversations={conversations}
            currentUser={currentUser}
            onSendChat={onSendChat}
          />
        </aside>
      </div>

      {pickedGame && (
        <InviteModal
          game={pickedGame}
          friends={friends}
          onlineIds={onlineIds}
          onInvite={onInvite}
          onAddFriend={onAddFriend}
          onClose={() => setPickedGame(null)}
        />
      )}

      {showAdd && (
        <Modal title="Add a friend" onClose={() => setShowAdd(false)}>
          <form className="add-friend modal-add" onSubmit={submitAdd}>
            <input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Friend's username"
            />
            <button type="submit">Send request</button>
          </form>
        </Modal>
      )}

      {showRequests && (
        <Modal title="Friend requests" onClose={() => setShowRequests(false)}>
          {requests.length === 0 && <p className="muted">No pending requests.</p>}
          {requests.map((r) => (
            <div key={r.requestId} className="invite-row">
              <span className="friend-name">{r.fromUsername}</span>
              <button onClick={() => onAccept(r.requestId)}>Accept</button>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
