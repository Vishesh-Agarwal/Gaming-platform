// Narrow right-hand panel: pick a friend at the top, chat with them below.
import ChatPanel from './ChatPanel.jsx';

export default function FriendsChat({
  friends,
  onlineIds,
  unread,
  selectedFriendId,
  onSelectFriend,
  conversations,
  currentUser,
  onSendChat,
}) {
  const selectedFriend = friends.find((f) => f.id === selectedFriendId) || null;

  return (
    <div className="friends-chat">
      <div className="side-friends">
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
            </div>
          );
        })}
      </div>

      <ChatPanel
        friend={selectedFriend}
        messages={conversations[selectedFriendId] || []}
        currentUserId={currentUser.id}
        onSend={onSendChat}
      />
    </div>
  );
}
