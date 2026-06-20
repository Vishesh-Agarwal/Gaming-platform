// Narrow right-hand panel with two views:
//  - default: the full list of friends
//  - after picking a friend: the conversation (with a Back button)
import ChatPanel from './ChatPanel.jsx';

export default function FriendsChat({
  friends,
  onlineIds,
  unread,
  selectedFriendId,
  onSelectFriend,
  onBack,
  conversations,
  currentUser,
  onSendChat,
}) {
  const selectedFriend = friends.find((f) => f.id === selectedFriendId) || null;

  // Conversation view
  if (selectedFriend) {
    return (
      <ChatPanel
        friend={selectedFriend}
        online={onlineIds.has(selectedFriend.id)}
        messages={conversations[selectedFriendId] || []}
        currentUserId={currentUser.id}
        onSend={onSendChat}
        onBack={onBack}
      />
    );
  }

  // Friends list view
  return (
    <div className="chat-list-view">
      <header className="panel-head">
        <span>💬 Messages</span>
      </header>
      <div className="friends-list">
        {friends.length === 0 && (
          <p className="muted empty-hint">
            No friends yet. Use <b>+ Add friend</b> up top to connect.
          </p>
        )}
        {friends.map((f) => {
          const online = onlineIds.has(f.id);
          const count = unread[f.id] || 0;
          return (
            <button
              key={f.id}
              className="friend-row"
              onClick={() => onSelectFriend(f.id)}
            >
              <span className={`dot ${online ? 'online' : 'offline'}`} />
              <span className="friend-name">{f.username}</span>
              {count > 0 && <span className="badge">{count}</span>}
              <span className="chev">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
