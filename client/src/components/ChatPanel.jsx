// Chat conversation with the selected friend.
import { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ friend, messages, currentUserId, onSend }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, friend]);

  if (!friend) {
    return (
      <div className="chat-panel empty">
        <p>Select a friend to chat.</p>
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    onSend(body);
    setText('');
  };

  return (
    <div className="chat-panel">
      <header className="chat-header">Chat with {friend.username}</header>
      <div className="chat-messages">
        {messages.length === 0 && <p className="muted">No messages yet. Say hi!</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.senderId === currentUserId ? 'mine' : 'theirs'}`}
          >
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${friend.username}…`}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
