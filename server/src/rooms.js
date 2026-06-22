// Game engine domain: invites + room lifecycle + the turn-based referee.
// State lives in memory (v1: refresh/disconnect = forfeit). Returns plain data;
// socketHandlers does the emitting.
import { nanoid } from 'nanoid';
import { getGame } from './games/registry.js';
import { areFriends, getUserById, publicUser } from './db.js';

const invites = new Map(); // inviteId -> { id, gameId, from, to, createdAt }
const rooms = new Map();   // roomId  -> room
const userRooms = new Map(); // userId -> roomId (a user is in at most one room)

function publicRoom(room) {
  // Strip private game state (e.g. Hangman's secret word) before it leaves the
  // server, so opponents never receive hidden info.
  const { secret, ...state } = room.state;
  return {
    id: room.id,
    gameId: room.gameId,
    players: room.players.map((p) => ({ index: p.index, ...publicUser(p.user) })),
    state,
    status: room.status, // 'playing' | 'over'
    result: room.result || null,
  };
}

// Create an invite from one user to a friend. Returns { invite } or { error }.
// options may carry a game mode (validated against the game's declared modes).
export function createInvite(fromUserId, toUserId, gameId, options) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  if (fromUserId === toUserId) return { error: "You can't invite yourself." };
  if (!areFriends(fromUserId, toUserId)) return { error: 'You are not friends.' };
  if (userRooms.has(fromUserId)) return { error: 'You are already in a game.' };
  if (userRooms.has(toUserId)) return { error: 'That player is already in a game.' };

  // resolve optional game settings: a mode (existing) and/or a numeric optionsSpec
  let resolved = null;
  const labels = [];

  if (game.modes?.length) {
    const mode = game.modes.find((m) => m.id === options?.mode) || game.modes[0];
    resolved = { ...resolved, mode: mode.id };
    labels.push(mode.name);
  }
  if (game.optionsSpec) {
    resolved = resolved || {};
    for (const [key, spec] of Object.entries(game.optionsSpec)) {
      if (spec.type === 'int') {
        let v = parseInt(options?.[key], 10);
        if (!Number.isFinite(v)) v = spec.default;
        v = Math.max(spec.min, Math.min(spec.max, v));
        resolved[key] = v;
        labels.push(`${v} ${(spec.label || key).toLowerCase()}`);
      }
    }
  }

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
    state: game.createInitialState(invite.options || undefined),
    status: 'playing',
    result: null,
  };
  // server-authoritative realtime games carry a live sim + per-player input buffer
  if (typeof game.createSim === 'function') {
    room.sim = game.createSim(room.players);
    room.inputs = {};
  }
  rooms.set(room.id, room);
  for (const p of room.players) userRooms.set(p.user.id, room.id);
  return { room: publicRoom(room) };
}

export function getRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? publicRoom(room) : null;
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
  room.inputs[player.index] = {
    throttle: Math.max(-1, Math.min(1, Number(input?.throttle) || 0)),
    steer: Math.max(-1, Math.min(1, Number(input?.steer) || 0)),
  };
}

// Advance one tick; returns { players:[ids], data } to broadcast, or null.
export function stepRoom(roomId, dt) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || !room.sim) return null;
  room.game.step(room.sim, room.inputs, dt);
  return {
    players: room.players.map((p) => p.user.id),
    data: { t: Date.now(), ...room.game.snapshot(room.sim) },
  };
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

  const { state, error } = room.game.applyMove(room.state, player.index, move);
  if (error) return { error };
  room.state = state;

  const result = room.game.getResult(state);
  if (result.over) {
    room.status = 'over';
    room.result = result;
  }
  const out = { room: publicRoom(room), players: room.players.map((p) => p.user.id) };
  if (result.over) endRoom(room);
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
  const out = { room: publicRoom(room), players: room.players.map((p) => p.user.id) };
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
  const players = room.players.map((p) => p.user.id);
  endRoom(room);
  return { room: snapshot, players, quitterId: userId, opponentId: opponent?.user.id };
}
