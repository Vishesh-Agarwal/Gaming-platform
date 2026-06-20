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
  return {
    id: room.id,
    gameId: room.gameId,
    players: room.players.map((p) => ({ index: p.index, ...publicUser(p.user) })),
    state: room.state,
    status: room.status, // 'playing' | 'over'
    result: room.result || null,
  };
}

// Create an invite from one user to a friend. Returns { invite } or { error }.
export function createInvite(fromUserId, toUserId, gameId) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  if (fromUserId === toUserId) return { error: "You can't invite yourself." };
  if (!areFriends(fromUserId, toUserId)) return { error: 'You are not friends.' };
  if (userRooms.has(fromUserId)) return { error: 'You are already in a game.' };
  if (userRooms.has(toUserId)) return { error: 'That player is already in a game.' };

  const invite = {
    id: nanoid(10),
    gameId,
    gameName: game.name,
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
    state: game.createInitialState(),
    status: 'playing',
    result: null,
  };
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
