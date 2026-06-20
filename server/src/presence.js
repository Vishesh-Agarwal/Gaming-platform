// Presence domain: in-memory online tracking driven by socket lifecycle.
// Each user joins a Socket.IO room "user:<id>" so we can address them across tabs.
import { getFriendsList } from './db.js';

// userId -> number of live connections
const connections = new Map();

export function userRoom(userId) {
  return `user:${userId}`;
}

export function isOnline(userId) {
  return (connections.get(userId) || 0) > 0;
}

export function emitToUser(io, userId, event, payload) {
  io.to(userRoom(userId)).emit(event, payload);
}

// Online friends of a user (ids), used to seed the lobby.
export function onlineFriendIds(userId) {
  return getFriendsList(userId)
    .filter((f) => isOnline(f.id))
    .map((f) => f.id);
}

// Call on socket connect. Returns true if this is the user's first connection.
export function online(userId) {
  const next = (connections.get(userId) || 0) + 1;
  connections.set(userId, next);
  return next === 1;
}

// Call on socket disconnect. Returns true if the user is now fully offline.
export function offline(userId) {
  const next = (connections.get(userId) || 0) - 1;
  if (next <= 0) {
    connections.delete(userId);
    return true;
  }
  connections.set(userId, next);
  return false;
}

// Notify a user's friends of their online/offline transition.
export function broadcastPresence(io, userId, status) {
  for (const friend of getFriendsList(userId)) {
    if (isOnline(friend.id)) {
      emitToUser(io, friend.id, 'presence:update', { userId, status });
    }
  }
}
