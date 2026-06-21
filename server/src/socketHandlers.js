// Socket wiring domain: the integration layer. Connects authenticated sockets to
// presence, chat, game invites, and moves. socket.user is set by socketAuth.
import {
  userRoom,
  emitToUser,
  online,
  offline,
  isOnline,
  onlineFriendIds,
  broadcastPresence,
} from './presence.js';
import { areFriends, saveMessage } from './db.js';
import {
  createInvite,
  acceptInvite,
  declineInvite,
  getInvite,
  makeMove,
  forfeit,
  getOpponentId,
  recordFinish,
} from './rooms.js';

export function initSockets(io) {
  io.on('connection', (socket) => {
    const me = socket.user; // { id, username }
    socket.join(userRoom(me.id));

    // Mark online; tell friends; send this client the currently-online friends.
    const firstConnection = online(me.id);
    if (firstConnection) broadcastPresence(io, me.id, 'online');
    socket.emit('presence:init', { online: onlineFriendIds(me.id) });

    // Client can re-pull online friends (e.g. right after a new friendship forms).
    socket.on('presence:sync', (_payload, ack) => ack?.(onlineFriendIds(me.id)));

    // ---- Chat ----
    socket.on('chat:send', (payload, ack) => {
      const to = Number(payload?.to);
      const body = String(payload?.body || '').trim().slice(0, 2000);
      if (!body) return ack?.({ error: 'Empty message.' });
      if (!areFriends(me.id, to)) return ack?.({ error: 'Not friends.' });

      const saved = saveMessage(me.id, to, body);
      const message = {
        id: saved.id,
        senderId: me.id,
        recipientId: to,
        body: saved.body,
        created_at: saved.created_at,
      };
      emitToUser(io, to, 'chat:message', message); // live deliver if online
      ack?.({ ok: true, message });
    });

    // ---- Game invites ----
    socket.on('game:invite', (payload, ack) => {
      const toUserId = Number(payload?.toUserId);
      const gameId = String(payload?.gameId || '');
      if (!isOnline(toUserId)) return ack?.({ error: 'That friend is offline.' });

      const { invite, error } = createInvite(me.id, toUserId, gameId);
      if (error) return ack?.({ error });
      emitToUser(io, toUserId, 'game:invited', {
        inviteId: invite.id,
        gameId: invite.gameId,
        gameName: invite.gameName,
        from: invite.from,
      });
      ack?.({ ok: true, inviteId: invite.id });
    });

    socket.on('game:invite:accept', (payload, ack) => {
      const inviteId = String(payload?.inviteId || '');
      const invite = getInvite(inviteId);
      const { room, error } = acceptInvite(inviteId, me.id);
      if (error) return ack?.({ error });
      // Tell both players the game has started.
      for (const p of room.players) {
        emitToUser(io, p.id, 'game:start', { room, youAreIndex: p.index });
      }
      // Let the inviter know their invite was accepted (clears pending UI).
      if (invite) emitToUser(io, invite.from.id, 'game:invite:resolved', { inviteId });
      ack?.({ ok: true, roomId: room.id });
    });

    socket.on('game:invite:decline', (payload, ack) => {
      const inviteId = String(payload?.inviteId || '');
      const { invite, error } = declineInvite(inviteId, me.id);
      if (error) return ack?.({ error });
      emitToUser(io, invite.from.id, 'game:invite:declined', {
        inviteId,
        by: me.username,
      });
      ack?.({ ok: true });
    });

    // ---- Gameplay ----
    socket.on('game:move', (payload, ack) => {
      const roomId = String(payload?.roomId || '');
      const result = makeMove(roomId, me.id, payload?.move);
      if (result.error) return ack?.({ error: result.error });
      for (const pid of result.players) {
        emitToUser(io, pid, 'game:state', { room: result.room });
      }
      if (result.room.status === 'over') {
        for (const pid of result.players) {
          emitToUser(io, pid, 'game:over', { room: result.room });
        }
      }
      ack?.({ ok: true });
    });

    // ---- Realtime gameplay (Ghost Rider) ----
    // Relay this player's car position to the opponent (no server-side physics).
    socket.on('game:rt:state', (payload) => {
      const oppId = getOpponentId(payload?.roomId, me.id);
      if (oppId) emitToUser(io, oppId, 'game:rt:ghost', { from: me.id, s: payload?.s });
    });

    // First to report finishing wins; reuse the normal game:over flow.
    socket.on('game:rt:finish', (payload, ack) => {
      const res = recordFinish(payload?.roomId, me.id);
      if (res.error) return ack?.({ error: res.error });
      if (res.already) return ack?.({ ok: true, late: true });
      for (const pid of res.players) {
        emitToUser(io, pid, 'game:over', { room: res.room });
      }
      ack?.({ ok: true });
    });

    // Leaving a game forfeits it.
    socket.on('game:leave', () => endGameByForfeit(io, me.id));

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const nowOffline = offline(me.id);
      if (nowOffline) {
        endGameByForfeit(io, me.id);
        broadcastPresence(io, me.id, 'offline');
      }
    });
  });
}

function endGameByForfeit(io, userId) {
  const res = forfeit(userId);
  if (!res) return;
  for (const pid of res.players) {
    emitToUser(io, pid, 'game:over', { room: res.room });
  }
}
