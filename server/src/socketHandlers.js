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
import { allowSocketEvent } from './security.js';
import { scheduleForfeit, cancelForfeit } from './reconnect.js';
import config from './config.js';
import {
  createInvite,
  acceptInvite,
  declineInvite,
  getInvite,
  makeMove,
  forfeit,
  getRoomPlayerIds,
  getRoomForUser,
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
  isBotTurn,
  makeBotMove,
  requestUndo,
  acceptUndo,
} from './rooms.js';
import { startMatch, stopMatch } from './realtime.js';
import { setProgressionNotifier } from './progression.js';
import { armTurnClock, setBotNudge, stopTurnClock } from './turnclock.js';
import {
  createLobby,
  quickPlay,
  joinLobby,
  leaveLobby,
  setReady,
  setMemberTeam,
  setLobbyOptions,
  startLobby,
  getLobbyForUser,
  publicLobby,
  listPublicLobbies,
} from './lobbies.js';

// Allow-list of in-game reaction emojis (keeps the relay from carrying arbitrary text).
const GAME_EMOTES = ['👍', '😂', '😮', '😢', '🔥', '🎉', '😎', '💀', '❤️', '🤝'];
const botTimers = new Set();

// Human user ids in a (public) room other than `meId` — the opponents to notify
// about a disconnect/reconnect. Bots and the player themself are excluded.
function otherHumans(room, meId) {
  if (!room) return [];
  return room.players.filter((p) => !p.bot && p.id !== meId).map((p) => p.id);
}

function emitRoomState(io, result, roomId) {
  for (const pid of result.players) {
    emitToUser(io, pid, 'game:state', { room: result.rooms?.get(pid) || result.room });
  }
  if (result.room.status === 'over') {
    stopTurnClock(roomId);
    for (const pid of result.players) {
      emitToUser(io, pid, 'game:over', { room: result.rooms?.get(pid) || result.room });
    }
  } else if (hasTurnClock(roomId)) {
    armTurnClock(io, roomId);
  }
}

function scheduleBotTurn(io, roomId) {
  if (!roomId || botTimers.has(roomId) || !isBotTurn(roomId)) return;
  botTimers.add(roomId);
  setTimeout(() => {
    botTimers.delete(roomId);
    const result = makeBotMove(roomId);
    if (!result) return;
    emitRoomState(io, result, roomId);
    if (result.room.status !== 'over') scheduleBotTurn(io, roomId);
  }, 650);
}

// After a boot-time rehydrate, nudge any room whose current turn belongs to a
// bot so play resumes without waiting for the turn clock to expire.
export function resumeBots(io, roomIds) {
  for (const id of roomIds || []) {
    if (isBotTurn(id)) scheduleBotTurn(io, id);
  }
}

export function initSockets(io) {
  // Push per-player progression summaries (XP, level, achievements, challenge
  // progress) to their sockets right after a match records.
  setProgressionNotifier((userId, summary) => {
    emitToUser(io, userId, 'progression:update', summary);
  });

  // A turn that expires into a bot's turn should start the bot right away.
  setBotNudge((roomId) => scheduleBotTurn(io, roomId));

  io.on('connection', (socket) => {
    const me = socket.user; // { id, username }
    socket.join(userRoom(me.id));

    // Mark online; tell friends; send this client the currently-online friends.
    const firstConnection = online(me.id);
    if (firstConnection) broadcastPresence(io, me.id, 'online');
    socket.emit('presence:init', { online: onlineFriendIds(me.id) });

    // Reconnection: cancel a pending grace-forfeit, tell opponents the player is
    // back, and resume them straight into their active game.
    if (cancelForfeit(me.id)) {
      const backRid = getRoomIdForUser(me.id);
      const backRoom = backRid ? getRoomForUser(backRid, me.id) : null;
      for (const pid of otherHumans(backRoom, me.id)) {
        emitToUser(io, pid, 'game:peer', { roomId: backRid, userId: me.id, username: me.username, status: 'back' });
      }
    }
    const resumeRid = getRoomIdForUser(me.id);
    if (resumeRid) {
      const resumeRoom = getRoomForUser(resumeRid, me.id);
      if (resumeRoom?.status === 'playing') {
        const seat = resumeRoom.players.find((p) => p.id === me.id)?.index;
        socket.emit('game:start', { room: resumeRoom, youAreIndex: seat });
      } else if (resumeRoom?.status === 'over') {
        socket.emit('game:over', { room: resumeRoom });
      }
    }

    // Client can re-pull online friends (e.g. right after a new friendship forms).
    socket.on('presence:sync', (_payload, ack) => ack?.(onlineFriendIds(me.id)));

    // ---- Chat ----
    socket.on('chat:send', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'chat:send')) return ack?.({ error: 'Slow down.' });
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
      if (!allowSocketEvent(me.id, 'game:invite')) return ack?.({ error: 'Slow down.' });
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
        emitToUser(io, p.id, 'game:start', { room: getRoomForUser(room.id, p.id) || room, youAreIndex: p.index });
      }
      // Let the inviter know their invite was accepted (clears pending UI).
      if (invite) emitToUser(io, invite.from.id, 'game:invite:resolved', { inviteId });
      // Kick off the server tick loop for realtime games.
      if (isRealtimeRoom(room.id)) startMatch(io, room.id);
      else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
      scheduleBotTurn(io, room.id);
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
      if (!allowSocketEvent(me.id, 'lobby:create')) return ack?.({ error: 'Slow down.' });
      if (getRoomIdForUser(me.id)) return ack?.({ error: 'Finish your current game first.' });
      const { lobby, error } = createLobby(me, String(payload?.gameId || ''), payload?.options);
      if (error) return ack?.({ error });
      ack?.({ ok: true, lobby: publicLobby(lobby) });
    });

    socket.on('lobby:quick', (payload, ack) => {
      if (getRoomIdForUser(me.id)) return ack?.({ error: 'Finish your current game first.' });
      const { lobby, joined, error } = quickPlay(me, String(payload?.gameId || ''));
      if (error) return ack?.({ error });
      if (joined) broadcastLobby(lobby); // tell the others someone joined
      ack?.({ ok: true, lobby: publicLobby(lobby), joined });
    });

    socket.on('lobby:list', (_payload, ack) => {
      ack?.({ lobbies: listPublicLobbies() });
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
        emitToUser(io, p.id, 'game:start', { room: getRoomForUser(room.id, p.id) || room, youAreIndex: p.index });
      }
      if (isRealtimeRoom(room.id)) startMatch(io, room.id);
      else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
      scheduleBotTurn(io, room.id);
      ack?.({ ok: true, roomId: room.id });
    });

    // ---- Gameplay ----
    socket.on('game:move', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'game:move')) return ack?.({ error: 'Slow down.' });
      const roomId = String(payload?.roomId || '');
      const result = makeMove(roomId, me.id, payload?.move);
      if (result.error) return ack?.({ error: result.error });
      emitRoomState(io, result, roomId);
      if (result.room.status !== 'over') scheduleBotTurn(io, roomId);
      ack?.({ ok: true });
    });

    socket.on('game:undo:request', (payload, ack) => {
      const roomId = String(payload?.roomId || '');
      const result = requestUndo(roomId, me.id);
      if (result.error) return ack?.({ error: result.error });
      emitRoomState(io, result, roomId);
      ack?.({ ok: true });
    });

    socket.on('game:undo:accept', (payload, ack) => {
      const roomId = String(payload?.roomId || '');
      const result = acceptUndo(roomId, me.id);
      if (result.error) return ack?.({ error: result.error });
      emitRoomState(io, result, roomId);
      ack?.({ ok: true });
    });

    // ---- Realtime gameplay (Ghost Rider) ----
    // Relay this player's car position to every other racer (no server-side
    // physics). Broadcasting to all (not just one opponent) supports N-player races.
    socket.on('game:rt:state', (payload) => {
      const roomId = payload?.roomId || getRoomIdForUser(me.id);
      for (const pid of getRoomPlayerIds(roomId)) {
        if (pid !== me.id) emitToUser(io, pid, 'game:rt:ghost', { from: me.id, s: payload?.s });
      }
    });

    // Server-authoritative realtime (Smash Karts): buffer the player's input.
    socket.on('game:rt:input', (payload) => {
      if (!allowSocketEvent(me.id, 'game:rt:input')) return;
      const roomId = payload?.roomId || getRoomIdForUser(me.id);
      if (roomId) setInput(roomId, me.id, payload?.input);
    });

    // First to report finishing wins; reuse the normal game:over flow.
    socket.on('game:rt:finish', (payload, ack) => {
      const res = recordFinish(payload?.roomId, me.id);
      if (res.error) return ack?.({ error: res.error });
      if (res.already) return ack?.({ ok: true, late: true });
      for (const pid of res.players) {
        emitToUser(io, pid, 'game:over', { room: res.rooms?.get(pid) || res.room });
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
      const minReady = Number(offer.options?.bots || 0) > 0 ? 1 : 2;
      const ready = eligible.length >= minReady && eligible.every((id) => offer.accepted.has(id));
      if (ready) {
        clearRematch(offerId);
        const { room, error: createErr } = createRoom(offer.gameId, offer.options, eligible);
        if (createErr) return ack?.({ error: createErr });
        for (const p of room.players) {
          emitToUser(io, p.id, 'game:start', { room: getRoomForUser(room.id, p.id) || room, youAreIndex: p.index });
        }
        if (isRealtimeRoom(room.id)) startMatch(io, room.id);
        else if (hasTurnClock(room.id)) armTurnClock(io, room.id);
        scheduleBotTurn(io, room.id);
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

    // ---- In-game emotes (all games) ----
    // A player taps a reaction; relay it to everyone in their room (allow-list only).
    socket.on('game:emote', (payload) => {
      const roomId = String(payload?.roomId || '') || getRoomIdForUser(me.id);
      const emote = String(payload?.emote || '');
      if (!roomId || !GAME_EMOTES.includes(emote)) return;
      const ids = getRoomPlayerIds(roomId);
      if (!ids.includes(me.id)) return;
      for (const id of ids) emitToUser(io, id, 'game:emote', { from: me.id, name: me.username, emote });
    });

    // Leaving a game: realtime N-player drops out; turn-based/1v1 forfeits.
    socket.on('game:leave', () => handleLeave(io, me.id));

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const lob = leaveLobby(me.id);
      if (!lob.closed && lob.lobby) broadcastLobby(lob.lobby);
      const nowOffline = offline(me.id);
      if (!nowOffline) return; // other tabs still connected — nothing to do
      broadcastPresence(io, me.id, 'offline');

      const rid = getRoomIdForUser(me.id);
      if (rid && !isRealtimeRoom(rid)) {
        // Turn-based game: hold a grace window instead of forfeiting now.
        const room = getRoomForUser(rid, me.id);
        for (const pid of otherHumans(room, me.id)) {
          emitToUser(io, pid, 'game:peer', {
            roomId: rid, userId: me.id, username: me.username,
            status: 'left', graceMs: config.reconnectGraceMs,
          });
        }
        scheduleForfeit(me.id, config.reconnectGraceMs, () => handleLeave(io, me.id));
      } else {
        // Realtime room (immediate drop) or no active game (e.g. a lingering
        // rematch offer) — today's behavior.
        handleLeave(io, me.id);
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
      for (const pid of res.players) emitToUser(io, pid, 'game:over', { room: res.rooms?.get(pid) || res.room });
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
    emitToUser(io, pid, 'game:over', { room: res.rooms?.get(pid) || res.room });
  }
}
