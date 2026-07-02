// Game engine domain: invites + room lifecycle + the turn-based referee.
// State lives in memory (v1: refresh/disconnect = forfeit). Returns plain data;
// socketHandlers does the emitting.
import { nanoid } from 'nanoid';
import { getGame } from './games/registry.js';
import { areFriends, getUserById, publicUser, saveMatchResult } from './db.js';
import { processMatch } from './progression.js';
import { chooseBotMove, supportsRoomBots } from './bots.js';
import { resolveGameOptions } from './gameOptions.js';

const invites = new Map(); // inviteId -> { id, gameId, from, to, createdAt }
const rooms = new Map();   // roomId  -> room
const userRooms = new Map(); // userId -> roomId (a user is in at most one room)

function publicRoom(room, viewerSeat = null) {
  // Strip private game state (e.g. Hangman's secret word) before it leaves the
  // server, so opponents never receive hidden info.
  const state = typeof room.game.publicState === 'function'
    ? room.game.publicState(room.state, viewerSeat, room.players)
    : (() => {
        const { secret, ...rest } = room.state;
        return rest;
      })();
  return {
    id: room.id,
    gameId: room.gameId,
    players: room.players.map((p) => ({ index: p.index, ...publicUser(p.user), bot: !!p.user.bot })),
    state,
    status: room.status, // 'playing' | 'over'
    result: room.result || null,
    undo: room.undo ? { by: room.undo.by, requestedBy: room.undo.requestedBy || null } : null,
    turnEndsAt: room.turnEndsAt || null, // wall-clock deadline for the current turn, if timed
  };
}

function publicRoomForUser(room, userId) {
  const player = room.players.find((p) => p.user.id === userId);
  return publicRoom(room, player?.index ?? null);
}

function playerRooms(room) {
  return new Map(room.players.filter((p) => !p.user.bot).map((p) => [p.user.id, publicRoom(room, p.index)]));
}

function humanIds(room) {
  return room.players.filter((p) => !p.user.bot).map((p) => p.user.id);
}

function botUser(roomId, n) {
  const names = ['Nova', 'Pixel', 'Blitz', 'Orbit', 'Quest'];
  return { id: -Math.abs(Number.parseInt(roomId.replace(/\D/g, '').slice(0, 5), 10) || Date.now()) - n - 1, username: `Bot ${names[n % names.length]}`, bot: true };
}

function recordIfDone(room) {
  if (room.status === 'over' && room.result) {
    const matchId = saveMatchResult({
      roomId: room.id,
      gameId: room.gameId,
      gameName: room.game.name,
      players: room.players,
      result: room.result,
    });
    // Progression is best-effort: a failure here must never break match
    // recording or the game:over flow.
    if (matchId) {
      try {
        processMatch({
          matchId,
          gameId: room.gameId,
          playerCount: room.players.length,
          players: room.players,
          result: room.result,
        });
      } catch (err) {
        console.error('[progression] failed (match still recorded):', err);
      }
    }
  }
}

// Stamp the current-turn deadline on a room when its game uses turn timeouts and
// play is ongoing; clear it otherwise. Called right before snapshotting so the
// deadline rides along in the broadcast state.
function armTurnDeadline(room) {
  // turnTimeoutMs may be a fixed number (TTT, Ludo) or a function of state for
  // mode-specific clocks (Carrom Blitz only). A null/0 result means no clock.
  const t = room.game.turnTimeoutMs;
  const ms = typeof t === 'function' ? t(room.state) : t;
  room.turnEndsAt = room.status === 'playing' && ms ? Date.now() + ms : null;
}

// Create an invite from one user to a friend. Returns { invite } or { error }.
// options may carry a game mode (validated against the game's declared modes).
export function createInvite(fromUserId, toUserId, gameId, options) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  if ((game.minPlayers || 2) > 2) return { error: `${game.name} needs a lobby.` };
  if (fromUserId === toUserId) return { error: "You can't invite yourself." };
  if (!areFriends(fromUserId, toUserId)) return { error: 'You are not friends.' };
  if (userRooms.has(fromUserId)) return { error: 'You are already in a game.' };
  if (userRooms.has(toUserId)) return { error: 'That player is already in a game.' };

  const { options: resolved, labels } = resolveGameOptions(game, options, { includeLabels: true });

  const invite = {
    id: nanoid(10),
    gameId,
    gameName: labels.length ? `${game.name} · ${labels.join(' · ')}` : game.name,
    options: resolved,
    from: publicUser(getUserById(fromUserId)),
    to: toUserId,
    createdAt: Date.now(),
  };
  invites.set(invite.id, invite);
  return { invite };
}

export function getInvite(inviteId) {
  return invites.get(inviteId);
}

export function declineInvite(inviteId, byUserId) {
  const invite = invites.get(inviteId);
  if (!invite || invite.to !== byUserId) return { error: 'Invite not found.' };
  invites.delete(inviteId);
  return { invite };
}

// Accept an invite -> create a room. Returns { room } or { error }.
export function acceptInvite(inviteId, acceptingUserId) {
  const invite = invites.get(inviteId);
  if (!invite || invite.to !== acceptingUserId) return { error: 'Invite not found.' };
  invites.delete(inviteId);

  const game = getGame(invite.gameId);
  if (!game) return { error: 'Unknown game.' };
  if (userRooms.has(invite.from.id) || userRooms.has(acceptingUserId)) {
    return { error: 'A player is already in a game.' };
  }

  const room = {
    id: nanoid(10),
    gameId: invite.gameId,
    game,
    players: [
      { index: 0, user: getUserById(invite.from.id) },
      { index: 1, user: getUserById(acceptingUserId) },
    ],
    state: game.createInitialState(invite.options || undefined, 2),
    options: invite.options || null, // kept so a rematch can reuse the same settings
    status: 'playing',
    result: null,
  };
  // server-authoritative realtime games carry a live sim + per-player input buffer
  if (typeof game.createSim === 'function') {
    room.sim = game.createSim(room.players, Date.now(), invite.options || undefined);
    room.inputs = {};
  }
  armTurnDeadline(room);
  rooms.set(room.id, room);
  for (const p of room.players) userRooms.set(p.user.id, room.id);
  return { room: publicRoom(room) };
}

// Generic N-player room creation (used by the multiplayer lobby). userIds in
// seat order. Returns { room } or { error }.
export function createRoom(gameId, options, userIds) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  for (const uid of userIds) {
    if (userRooms.has(uid)) return { error: 'A player is already in a game.' };
  }
  const resolvedOptions = resolveGameOptions(game, options);
  const botSeats = supportsRoomBots(gameId)
    ? Math.max(0, Math.min(Math.floor(Number(resolvedOptions?.bots) || 0), (game.maxPlayers || userIds.length) - userIds.length))
    : 0;
  const roomId = nanoid(10);
  const players = [
    ...userIds.map((uid, i) => ({ index: i, user: getUserById(uid) })),
    ...Array.from({ length: botSeats }, (_, i) => ({ index: userIds.length + i, user: botUser(roomId, i) })),
  ];
  const min = game.minPlayers || 2;
  const max = game.maxPlayers || players.length;
  if (players.length < min) return { error: `Need at least ${min} players.` };
  if (players.length > max) return { error: `Too many players for ${game.name}.` };
  const room = {
    id: roomId,
    gameId,
    game,
    players,
    state: game.createInitialState(resolvedOptions || undefined, players.length),
    options: resolvedOptions || null, // kept so a rematch can reuse the same settings
    status: 'playing',
    result: null,
  };
  if (typeof game.createSim === 'function') {
    room.sim = game.createSim(room.players, Date.now(), resolvedOptions || undefined);
    room.inputs = {};
  }
  armTurnDeadline(room);
  rooms.set(room.id, room);
  for (const p of room.players) if (!p.user.bot) userRooms.set(p.user.id, room.id);
  return { room: publicRoom(room) };
}

export function getRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? publicRoom(room) : null;
}

export function getRoomForUser(roomId, userId) {
  const room = rooms.get(roomId);
  return room ? publicRoomForUser(room, userId) : null;
}

export function getRoomIdForUser(userId) {
  return userRooms.get(userId);
}

// ---- Server-authoritative realtime (e.g. Smash Karts) ----

export function isRealtimeRoom(roomId) {
  const room = rooms.get(roomId);
  return !!room && typeof room.game.step === 'function';
}

// Buffer a player's latest input for the next tick.
export function setInput(roomId, userId, input) {
  const room = rooms.get(roomId);
  if (!room || !room.inputs) return;
  const player = room.players.find((p) => p.user.id === userId);
  if (!player) return;
  const idx = player.index;
  if (!room.inputs[idx]) room.inputs[idx] = { queue: [], last: null };
  room.inputs[idx].queue.push({
    seq: Number(input?.seq) || 0,
    throttle: Math.max(-1, Math.min(1, Number(input?.throttle) || 0)),
    steer: Math.max(-1, Math.min(1, Number(input?.steer) || 0)),
    fire: !!input?.fire,
  });
  if (room.inputs[idx].queue.length > 240) room.inputs[idx].queue.shift();
}

// Advance one tick; returns { players, data, over?, room? } or null.
export function stepRoom(roomId, dt) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.sim) return null;
  const now = Date.now();
  room.game.step(room.sim, room.inputs, dt, now);
  const players = room.players.map((p) => p.user.id);
  const data = { t: now, ...room.game.snapshot(room.sim, now) };
  if (room.sim.over && typeof room.game.result === 'function') {
    room.status = 'over';
    room.result = room.game.result(room.sim);
    const snap = publicRoom(room);
    const roomsByPlayer = playerRooms(room);
    registerRematch(room);
    endRoom(room);
    return { players, data, over: true, room: snap, rooms: roomsByPlayer };
  }
  return { players, data };
}

// A player left a realtime N-player match: mark their kart gone. If fewer than 2
// remain, end the match. Returns { handled, ended, roomId?, room?, players? }.
export function dropFromRealtime(userId) {
  const roomId = userRooms.get(userId);
  if (!roomId) return { handled: false };
  const room = rooms.get(roomId);
  if (!room || !room.sim || typeof room.game.dropPlayer !== 'function') return { handled: false };
  const player = room.players.find((p) => p.user.id === userId);
  userRooms.delete(userId);
  if (!player) return { handled: true, ended: false };
  const remaining = room.game.dropPlayer(room.sim, player.index);
  if (remaining < 2) {
    room.status = 'over';
    room.result = room.game.result
      ? room.game.result(room.sim)
      : { over: true, winner: null, draw: true };
    const snap = publicRoom(room);
    const roomsByPlayer = playerRooms(room);
    const players = room.players.map((p) => p.user.id);
    for (const p of room.players) userRooms.delete(p.user.id);
    rooms.delete(room.id);
    return { handled: true, ended: true, roomId, room: snap, rooms: roomsByPlayer, players };
  }
  return { handled: true, ended: false, roomId };
}

function endRoom(room) {
  rooms.delete(room.id);
  for (const p of room.players) userRooms.delete(p.user.id);
}

// Apply a move. Returns { room, players } on success or { error }.
export function makeMove(roomId, userId, move) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Game not found.' };
  if (room.status !== 'playing') return { error: 'Game is over.' };
  const player = room.players.find((p) => p.user.id === userId);
  if (!player) return { error: 'You are not in this game.' };

  const before = structuredClone(room.state);
  const { state, error } = room.game.applyMove(room.state, player.index, move);
  if (error) return { error };
  room.state = state;
  room.undo = { state: before, by: userId, requestedBy: null };

  const result = room.game.getResult(state);
  if (result.over) {
    room.status = 'over';
    room.result = result;
  }
  armTurnDeadline(room); // fresh deadline for the next turn (cleared if the game ended)
  const out = { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room), roomId: room.id };
  if (result.over) { recordIfDone(room); registerRematch(room); endRoom(room); }
  return out;
}

export function requestUndo(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return { error: 'Game not found.' };
  if (!room.undo) return { error: 'No move to undo.' };
  if (!room.players.some((p) => p.user.id === userId)) return { error: 'You are not in this game.' };
  room.undo.requestedBy = userId;
  return { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room) };
}

export function acceptUndo(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return { error: 'Game not found.' };
  if (!room.undo?.requestedBy) return { error: 'No undo request.' };
  if (room.undo.requestedBy === userId) return { error: 'Waiting for the other player.' };
  if (!room.players.some((p) => p.user.id === userId)) return { error: 'You are not in this game.' };
  room.state = structuredClone(room.undo.state);
  room.undo = null;
  armTurnDeadline(room);
  return { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room) };
}

export function clearUndo(roomId) {
  const room = rooms.get(roomId);
  if (room) room.undo = null;
}

export function isBotTurn(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return false;
  const turn = room.state?.turn;
  return room.players.some((p) => p.index === turn && p.user.bot);
}

export function makeBotMove(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing') return null;
  const bot = room.players.find((p) => p.index === room.state?.turn && p.user.bot);
  if (!bot) return null;
  const move = chooseBotMove(room.game, room.state, bot.index);
  if (!move) return null;
  const { state, error } = room.game.applyMove(room.state, bot.index, move);
  if (error) return null;
  room.state = state;
  const result = room.game.getResult(state);
  if (result.over) {
    room.status = 'over';
    room.result = result;
  }
  armTurnDeadline(room);
  const out = { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room), roomId: room.id };
  if (result.over) { recordIfDone(room); registerRematch(room); endRoom(room); }
  return out;
}

// ---- Turn timeouts (e.g. Ludo) ----

export function hasTurnClock(roomId) {
  const room = rooms.get(roomId);
  return !!room && !!room.game.turnTimeoutMs && typeof room.game.onTimeout === 'function';
}

export function getTurnEndsAt(roomId) {
  const room = rooms.get(roomId);
  return room && room.status === 'playing' ? (room.turnEndsAt || null) : null;
}

// The current player's turn expired: ask the game to auto-resolve it, then snapshot
// and re-arm. Returns { room, players, over } or null if there's nothing to do.
export function applyTimeout(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || typeof room.game.onTimeout !== 'function') return null;
  const { state } = room.game.onTimeout(room.state);
  room.state = state;
  const result = room.game.getResult(state);
  if (result.over) {
    room.status = 'over';
    room.result = result;
  }
  armTurnDeadline(room);
  const out = { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room), over: result.over, roomId: room.id };
  if (result.over) { recordIfDone(room); registerRematch(room); endRoom(room); }
  return out;
}

// ---- Realtime games (e.g. Ghost Rider) ----

// The other player's id in a room, for relaying position updates.
export function getOpponentId(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const opp = room.players.find((p) => p.user.id !== userId);
  return opp ? opp.user.id : null;
}

// All user ids in a room (for broadcasting in-game emotes to everyone present).
export function getRoomPlayerIds(roomId) {
  const room = rooms.get(roomId);
  return room ? humanIds(room) : [];
}

// First player to report finishing wins. Returns { room, players } or { error } or
// { already: true } if the race was already decided.
export function recordFinish(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Game not found.' };
  if (room.status !== 'playing') return { already: true };
  const player = room.players.find((p) => p.user.id === userId);
  if (!player) return { error: 'You are not in this game.' };

  room.status = 'over';
  room.result = { over: true, winner: player.index, draw: false };
  const out = { room: publicRoom(room), rooms: playerRooms(room), players: humanIds(room) };
  recordIfDone(room);
  registerRematch(room);
  endRoom(room);
  return out;
}

// A user left/disconnected: opponent wins by forfeit. Returns affected info or null.
export function forfeit(userId) {
  const roomId = userRooms.get(userId);
  if (!roomId) return null;
  const room = rooms.get(roomId);
  if (!room) {
    userRooms.delete(userId);
    return null;
  }
  const quitter = room.players.find((p) => p.user.id === userId);
  const opponent = room.players.find((p) => p.user.id !== userId);
  room.status = 'over';
  room.result = {
    over: true,
    winner: opponent ? opponent.index : null,
    draw: false,
    forfeit: true,
  };
  const snapshot = publicRoom(room);
  const roomsByPlayer = playerRooms(room);
  const players = humanIds(room);
  recordIfDone(room);
  endRoom(room);
  return { room: snapshot, rooms: roomsByPlayer, players, quitterId: userId, opponentId: opponent?.user.id };
}

// ---- Rematch ----
// When a game ends naturally (not a forfeit/disconnect), we keep a small offer
// describing how to rebuild it. Either player accepting recreates the room with
// the same game + settings + seats once everyone still present has agreed.
const rematchOffers = new Map(); // offerId (the ended room id) -> offer
const REMATCH_TTL_MS = 5 * 60 * 1000;

function registerRematch(room) {
  // prune stale offers so abandoned ones don't accumulate
  const cutoff = Date.now() - REMATCH_TTL_MS;
  for (const [id, o] of rematchOffers) if (o.createdAt < cutoff) rematchOffers.delete(id);
  rematchOffers.set(room.id, {
    gameId: room.gameId,
    options: room.options || null,
    userIds: humanIds(room),
    names: Object.fromEntries(room.players.filter((p) => !p.user.bot).map((p) => [p.user.id, p.user.username])),
    accepted: new Set(),
    createdAt: Date.now(),
  });
}

export function getRematchOffer(offerId) {
  return rematchOffers.get(offerId) || null;
}

// Record a player's wish to rematch. Returns { offer } or { error }.
export function acceptRematch(offerId, userId) {
  const offer = rematchOffers.get(offerId);
  if (!offer) return { error: 'Rematch is no longer available.' };
  if (!offer.userIds.includes(userId)) return { error: 'You were not in this game.' };
  offer.accepted.add(userId);
  return { offer };
}

export function clearRematch(offerId) {
  rematchOffers.delete(offerId);
}

// A player left the post-game screen (or disconnected): cancel any rematch they
// were part of. Returns [{ offerId, others }] so the caller can notify the rest.
export function cancelRematchForUser(userId) {
  const cancelled = [];
  for (const [id, offer] of rematchOffers) {
    if (!offer.userIds.includes(userId)) continue;
    rematchOffers.delete(id);
    cancelled.push({ offerId: id, others: offer.userIds.filter((u) => u !== userId) });
  }
  return cancelled;
}
