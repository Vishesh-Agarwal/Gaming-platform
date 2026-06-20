// Authed orchestrator: owns the socket connection and all live state, then
// renders either the Lobby or the active Game.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { connectSocket, disconnectSocket, getSocket, emitAck } from '../socket.js';
import Lobby from './Lobby.jsx';
import Game from './Game.jsx';

export default function Home() {
  const { user, token, logout } = useAuth();

  const [friends, setFriends] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [requests, setRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  const [notice, setNotice] = useState('');

  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [conversations, setConversations] = useState({});
  const [unread, setUnread] = useState({});

  const [activeRoom, setActiveRoom] = useState(null);
  const [youAreIndex, setYouAreIndex] = useState(null);
  const [gameError, setGameError] = useState('');

  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current = selectedFriendId;
  }, [selectedFriendId]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const loadFriends = async () => {
    const [f, r] = await Promise.all([api.getFriends(token), api.getRequests(token)]);
    setFriends(f.friends);
    setRequests(r.requests);
  };

  const syncPresence = async () => {
    const ids = await emitAck('presence:sync', {});
    if (Array.isArray(ids)) setOnlineIds(new Set(ids));
  };

  // Reload friends/requests and refresh who's online (after social changes).
  const refreshSocial = async () => {
    await loadFriends();
    await syncPresence();
  };

  // Connect socket + wire listeners once per session.
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    loadFriends().catch((e) => flash(e.message));

    socket.on('presence:init', ({ online }) => setOnlineIds(new Set(online)));
    socket.on('presence:update', ({ userId, status }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev);
        status === 'online' ? next.add(userId) : next.delete(userId);
        return next;
      })
    );

    socket.on('chat:message', (msg) => {
      const fid = msg.senderId;
      setConversations((prev) =>
        prev[fid] ? { ...prev, [fid]: [...prev[fid], msg] } : prev
      );
      if (selectedRef.current !== fid) {
        setUnread((prev) => ({ ...prev, [fid]: (prev[fid] || 0) + 1 }));
      }
    });

    // Friend request arrived / was accepted — refresh lists + presence live.
    socket.on('friend:request', () => refreshSocial());
    socket.on('friend:accepted', () => refreshSocial());

    socket.on('game:invited', (inv) =>
      setInvites((prev) => [...prev.filter((i) => i.inviteId !== inv.inviteId), inv])
    );
    socket.on('game:invite:declined', ({ by }) => flash(`${by} declined your invite.`));
    socket.on('game:start', ({ room, youAreIndex }) => {
      setInvites([]);
      setGameError('');
      setYouAreIndex(youAreIndex);
      setActiveRoom(room);
    });
    socket.on('game:state', ({ room }) => setActiveRoom(room));
    socket.on('game:over', ({ room }) => setActiveRoom(room));

    return () => disconnectSocket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---- Friend actions ----
  const onAddFriend = async (username) => {
    try {
      await api.sendFriendRequest(token, username);
      flash(`Friend request sent to ${username}.`);
    } catch (e) {
      flash(e.message);
    }
  };
  const onAccept = async (requestId) => {
    try {
      await api.acceptFriendRequest(token, requestId);
      await refreshSocial();
    } catch (e) {
      flash(e.message);
    }
  };

  // ---- Chat ----
  const onSelectFriend = async (id) => {
    setSelectedFriendId(id);
    setUnread((prev) => ({ ...prev, [id]: 0 }));
    try {
      const { messages } = await api.getConversation(token, id);
      setConversations((prev) => ({ ...prev, [id]: messages }));
    } catch (e) {
      flash(e.message);
    }
  };
  const onSendChat = async (body) => {
    const to = selectedFriendId;
    const res = await emitAck('chat:send', { to, body });
    if (res.error) return flash(res.error);
    setConversations((prev) => ({
      ...prev,
      [to]: [...(prev[to] || []), res.message],
    }));
  };

  // ---- Game invites + play ----
  const onInvite = async (friendId, gameId) => {
    const res = await emitAck('game:invite', { toUserId: friendId, gameId });
    flash(res.error ? res.error : 'Invite sent!');
  };
  const onAcceptInvite = async (inviteId) => {
    const res = await emitAck('game:invite:accept', { inviteId });
    setInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
    if (res.error) flash(res.error);
  };
  const onDeclineInvite = async (inviteId) => {
    setInvites((prev) => prev.filter((i) => i.inviteId !== inviteId));
    await emitAck('game:invite:decline', { inviteId });
  };
  const onMove = async (move) => {
    const res = await emitAck('game:move', { roomId: activeRoom.id, move });
    setGameError(res.error || '');
  };
  const onLeave = () => {
    getSocket()?.emit('game:leave');
    setActiveRoom(null);
    setYouAreIndex(null);
    setGameError('');
  };

  const onLogout = () => {
    disconnectSocket();
    logout();
  };

  if (activeRoom) {
    return (
      <Game
        room={activeRoom}
        youAreIndex={youAreIndex}
        onMove={onMove}
        onLeave={onLeave}
        error={gameError}
      />
    );
  }

  return (
    <Lobby
      friends={friends}
      onlineIds={onlineIds}
      requests={requests}
      invites={invites}
      selectedFriendId={selectedFriendId}
      conversations={conversations}
      unread={unread}
      currentUser={user}
      notice={notice}
      onAddFriend={onAddFriend}
      onAccept={onAccept}
      onInvite={onInvite}
      onAcceptInvite={onAcceptInvite}
      onDeclineInvite={onDeclineInvite}
      onSelectFriend={onSelectFriend}
      onSendChat={onSendChat}
      onLogout={onLogout}
    />
  );
}
