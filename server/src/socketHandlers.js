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
  isRealtimeRoom,
  setInput,
  getRoomIdForUser,
  createRoom,
  dropFromRealtime,
  hasTurnClock,
  acceptRematch,
  clearRematch,
  cancelRematchForUser,
} from './rooms.js';
import { startMatch, stopMatch } from './realtime.js';
import { armTurnClock, stopTurnClock } from './turnclock.js';
import {
  createLobby,
  joinLobby,
  leaveLobby,
  setReady,
  setMemberTeam,
  setLobbyOptions,
  startLobby,
  getLobbyForUser,
  publicLobby,
} from './lobbies.js';

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

      const { invite, error } = createInvite(me.id, toUserId, gameId, payload?.options);
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
      // Kick off the server tick loop for realtime games.
      if (isRealtimeRoom(room.id)) startMatch(io, room.id);
      else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
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

    // ---- Multiplayer lobby (N-player games, e.g. Smash Karts) ----
    const broadcastLobby = (lobby) => {
      if (!lobby) return;
      const data = publicLobby(lobby);
      for (const m of lobby.members) emitToUser(io, m.id, 'lobby:update', { lobby: data });
    };

    socket.on('lobby:create', (payload, ack) => {
      if (getRoomIdForUser(me.id)) return ack?.({ error: 'Finish your current game first.' });
      const { lobby, error } = createLobby(me, String(payload?.gameId || ''), payload?.options);
      if (error) return ack?.({ error });
      ack?.({ ok: true, lobby: publicLobby(lobby) });
    });

    socket.on('lobby:join', (payload, ack) => {
      if (getRoomIdForUser(me.id)) return ack?.({ error: 'Finish your current game first.' });
      const { lobby, error } = joinLobby(payload?.lobbyId || payload?.code, me);
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true, lobby: publicLobby(lobby) });
    });

    socket.on('lobby:invite', (payload, ack) => {
      const toUserId = Number(payload?.toUserId);
      const lobby = getLobbyForUser(me.id);
      if (!lobby) return ack?.({ error: 'You are not in a lobby.' });
      if (!isOnline(toUserId)) return ack?.({ error: 'That friend is offline.' });
      emitToUser(io, toUserId, 'lobby:invited', {
        lobbyId: lobby.id,
        code: lobby.code,
        gameName: lobby.gameName,
        from: { id: me.id, username: me.username },
      });
      ack?.({ ok: true });
    });

    socket.on('lobby:ready', (payload, ack) => {
      const { lobby, error } = setReady(me.id, payload?.ready);
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true });
    });

    socket.on('lobby:options', (payload, ack) => {
      const { lobby, error } = setLobbyOptions(me.id, payload?.options);
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true });
    });

    socket.on('lobby:team', (payload, ack) => {
      const { lobby, error } = setMemberTeam(me.id, Number(payload?.team));
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true });
    });

    socket.on('lobby:leave', (_payload, ack) => {
      const res = leaveLobby(me.id);
      if (!res.closed) broadcastLobby(res.lobby);
      ack?.({ ok: true });
    });

    socket.on('lobby:start', (_payload, ack) => {
      const res = startLobby(me.id);
      if (res.error) return ack?.({ error: res.error });
      const { room, error } = createRoom(res.gameId, res.options, res.userIds);
      if (error) return ack?.({ error });
      for (const p of room.players) {
        emitToUser(io, p.id, 'game:start', { room, youAreIndex: p.index });
      }
      if (isRealtimeRoom(room.id)) startMatch(io, room.id);
      else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
      ack?.({ ok: true, roomId: room.id });
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
        stopTurnClock(roomId);
        for (const pid of result.players) {
          emitToUser(io, pid, 'game:over', { room: result.room });
        }
      } else if (hasTurnClock(roomId)) {
        armTurnClock(io, roomId); // reset the timer for the next turn
      }
      ack?.({ ok: true });
    });

    // ---- Realtime gameplay (Ghost Rider) ----
    // Relay this player's car position to the opponent (no server-side physics).
    socket.on('game:rt:state', (payload) => {
      const oppId = getOpponentId(payload?.roomId, me.id);
      if (oppId) emitToUser(io, oppId, 'game:rt:ghost', { from: me.id, s: payload?.s });
    });

    // Server-authoritative realtime (Smash Karts): buffer the player's input.
    socket.on('game:rt:input', (payload) => {
      const roomId = payload?.roomId || getRoomIdForUser(me.id);
      if (roomId) setInput(roomId, me.id, payload?.input);
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

    // ---- Rematch ----
    // Either player can ask to run it back. Once everyone still online has agreed,
    // rebuild the room with the same game + settings + seats and start it.
    socket.on('game:rematch', (payload, ack) => {
      const offerId = String(payload?.roomId || '');
      if (getRoomIdForUser(me.id)) return ack?.({ error: 'Finish your current game first.' });
      const { offer, error } = acceptRematch(offerId, me.id);
      if (error) return ack?.({ error });

      const eligible = offer.userIds.filter((id) => isOnline(id));
      const ready = eligible.length >= 2 && eligible.every((id) => offer.accepted.has(id));
      if (ready) {
        clearRematch(offerId);
        const { room, error: createErr } = createRoom(offer.gameId, offer.options, eligible);
        if (createErr) return ack?.({ error: createErr });
        for (const p of room.players) {
          emitToUser(io, p.id, 'game:start', { room, youAreIndex: p.index });
        }
        if (isRealtimeRoom(room.id)) startMatch(io, room.id);
        else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
        return ack?.({ ok: true, roomId: room.id });
      }

      // still waiting on others — tell everyone who has agreed so far
      const status = {
        roomId: offerId,
        accepted: [...offer.accepted],
        waitingOn: eligible.filter((id) => !offer.accepted.has(id)),
        by: me.username,
      };
      for (const id of offer.userIds) emitToUser(io, id, 'game:rematch:status', status);
      ack?.({ ok: true, waiting: true });
    });

    // Leaving a game: realtime N-player drops out; turn-based/1v1 forfeits.
    socket.on('game:leave', () => handleLeave(io, me.id));

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const lob = leaveLobby(me.id);
      if (!lob.closed && lob.lobby) broadcastLobby(lob.lobby);
      const nowOffline = offline(me.id);
      if (nowOffline) {
        handleLeave(io, me.id);
        broadcastPresence(io, me.id, 'offline');
      }
    });
  });
}

// Realtime N-player rooms: dropping out marks the kart gone (match continues, or
// ends if <2 remain). Other games forfeit to the opponent.
function handleLeave(io, userId) {
  // If they were lingering on a post-game rematch offer, cancel it and tell the rest.
  for (const { offerId, others } of cancelRematchForUser(userId)) {
    for (const id of others) emitToUser(io, id, 'game:rematch:cancelled', { roomId: offerId });
  }
  const rid = getRoomIdForUser(userId);
  if (rid && isRealtimeRoom(rid)) {
    const res = dropFromRealtime(userId);
    if (res.ended) {
      stopMatch(res.roomId);
      for (const pid of res.players) emitToUser(io, pid, 'game:over', { room: res.room });
    }
    return;
  }
  endGameByForfeit(io, userId);
}

function endGameByForfeit(io, userId) {
  const roomId = getRoomIdForUser(userId);
  const res = forfeit(userId);
  if (!res) return;
  if (roomId) { stopMatch(roomId); stopTurnClock(roomId); } // halt any timers
  for (const pid of res.players) {
    emitToUser(io, pid, 'game:over', { room: res.room });
  }
}
