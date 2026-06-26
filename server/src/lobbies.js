// Multiplayer lobby: gather 2..maxPlayers players for a game, ready up, then start
// an N-player room. Join by friend invite or a shareable room code. In-memory
// (refresh/disconnect = leave), like rooms. socketHandlers does the emitting.
import { nanoid } from 'nanoid';
import { getGame } from './games/registry.js';

const lobbies = new Map();    // lobbyId -> lobby
const byCode = new Map();     // CODE -> lobbyId
const userLobby = new Map();  // userId -> lobbyId

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
function genCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (byCode.has(code));
  return code;
}

export function publicLobby(lobby) {
  return {
    id: lobby.id,
    code: lobby.code,
    gameId: lobby.gameId,
    gameName: lobby.gameName,
    hostId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    members: lobby.members.map((m) => ({ id: m.id, username: m.username, ready: m.ready, team: m.team ?? 0 })),
    options: lobby.options || null,
  };
}

export function getLobby(lobbyId) {
  return lobbies.get(lobbyId);
}
export function getLobbyForUser(userId) {
  const id = userLobby.get(userId);
  return id ? lobbies.get(id) : null;
}

function removeFromCurrent(userId) {
  const existing = userLobby.get(userId);
  if (existing) leaveLobby(userId);
}

// Returns { lobby } or { error }.
export function createLobby(user, gameId, options) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  removeFromCurrent(user.id);
  const lobby = {
    id: nanoid(10),
    code: genCode(),
    gameId,
    gameName: game.name,
    options: options || null,
    hostId: user.id,
    maxPlayers: game.maxPlayers || 4,
    members: [{ id: user.id, username: user.username, ready: false, team: 0 }],
    createdAt: Date.now(),
  };
  lobbies.set(lobby.id, lobby);
  byCode.set(lobby.code, lobby.id);
  userLobby.set(user.id, lobby.id);
  return { lobby };
}

// Quick Play matchmaking: drop the user into an open PUBLIC lobby for the game
// (joining the fullest one to fill matches fast), or open a fresh public lobby if
// none exist. Private friend/code lobbies are never matched into.
// Returns { lobby, joined } or { error }.
export function quickPlay(user, gameId) {
  const game = getGame(gameId);
  if (!game) return { error: 'Unknown game.' };
  let best = null;
  for (const lobby of lobbies.values()) {
    if (!lobby.public || lobby.gameId !== gameId) continue;
    if (lobby.members.length >= lobby.maxPlayers) continue;
    if (lobby.members.some((m) => m.id === user.id)) continue;
    if (!best || lobby.members.length > best.members.length) best = lobby;
  }
  if (best) {
    const { lobby, error } = joinLobby(best.id, user);
    if (!error) return { lobby, joined: true };
  }
  const { lobby, error } = createLobby(user, gameId, null);
  if (error) return { error };
  lobby.public = true; // open to matchmaking
  return { lobby, joined: false };
}

// idOrCode: a lobbyId or a room code. Returns { lobby } or { error }.
export function joinLobby(idOrCode, user) {
  const key = String(idOrCode || '');
  const lobby = lobbies.get(key) || lobbies.get(byCode.get(key.toUpperCase()));
  if (!lobby) return { error: 'Lobby not found.' };
  if (lobby.members.some((m) => m.id === user.id)) return { lobby };
  if (lobby.members.length >= lobby.maxPlayers) return { error: 'Lobby is full.' };
  removeFromCurrent(user.id);
  const a = lobby.members.filter((m) => m.team === 0).length;
  const b = lobby.members.filter((m) => m.team === 1).length;
  lobby.members.push({ id: user.id, username: user.username, ready: false, team: a <= b ? 0 : 1 });
  userLobby.set(user.id, lobby.id);
  return { lobby };
}

// Returns { lobby|null, memberIds, closed, leaverId }.
export function leaveLobby(userId) {
  const lobbyId = userLobby.get(userId);
  if (!lobbyId) return { lobby: null, memberIds: [], closed: false, leaverId: userId };
  const lobby = lobbies.get(lobbyId);
  userLobby.delete(userId);
  if (!lobby) return { lobby: null, memberIds: [], closed: false, leaverId: userId };
  lobby.members = lobby.members.filter((m) => m.id !== userId);
  if (lobby.members.length === 0) {
    lobbies.delete(lobby.id);
    byCode.delete(lobby.code);
    return { lobby: null, memberIds: [], closed: true, leaverId: userId };
  }
  if (lobby.hostId === userId) lobby.hostId = lobby.members[0].id; // transfer host
  return { lobby, memberIds: lobby.members.map((m) => m.id), closed: false, leaverId: userId };
}

export function setReady(userId, ready) {
  const lobby = getLobbyForUser(userId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  const m = lobby.members.find((x) => x.id === userId);
  if (m) m.ready = !!ready;
  return { lobby };
}

// A player picks their team (0/1). Returns { lobby } or { error }.
export function setMemberTeam(userId, team) {
  const lobby = getLobbyForUser(userId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  const m = lobby.members.find((x) => x.id === userId);
  if (m) m.team = team === 1 ? 1 : 0;
  return { lobby };
}

// Host-only: merge into the lobby's options (e.g. { map }). Returns { lobby } or { error }.
export function setLobbyOptions(hostId, options) {
  const lobby = getLobbyForUser(hostId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  if (lobby.hostId !== hostId) return { error: 'Only the host can change settings.' };
  lobby.options = { ...(lobby.options || {}), ...(options || {}) };
  return { lobby };
}

// Host-only start. Returns { gameId, options, userIds } or { error }.
export function startLobby(hostId) {
  const lobby = getLobbyForUser(hostId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  if (lobby.hostId !== hostId) return { error: 'Only the host can start.' };
  const game = getGame(lobby.gameId);
  const min = Math.max(2, game?.minPlayers || 2);
  // AI karts (Smash Karts) count toward the minimum, so a single human can start
  // a match against bots. Clamp to the game's seat cap.
  const max = game?.maxPlayers || min;
  const bots = Math.max(0, Math.min(Math.floor(Number(lobby.options?.bots) || 0), max - lobby.members.length));
  if (lobby.members.length < 1) return { error: 'Need at least one player.' };
  if (lobby.members.length + bots < min) return { error: `Need at least ${min} players (add bots to fill in).` };
  if (!lobby.members.every((m) => m.ready)) return { error: 'Everyone must be ready.' };

  if (lobby.options?.mode === 'teams') {
    if (lobby.gameId === 'ludo') {
      // Ludo teams are positional (partners sit opposite) — needs a full table.
      if (lobby.members.length !== 4) return { error: '2v2 Teams needs exactly 4 players.' };
    } else {
      // manually-assigned teams (Smash Karts) must be balanced and non-empty
      const a = lobby.members.filter((m) => (m.team ?? 0) === 0).length;
      const b = lobby.members.filter((m) => (m.team ?? 0) === 1).length;
      if (a === 0 || b === 0 || Math.abs(a - b) > 1) {
        return { error: 'Teams must be balanced (and non-empty).' };
      }
    }
  }
  const userIds = lobby.members.map((m) => m.id);
  const teams = lobby.members.map((m) => m.team ?? 0);
  const out = { gameId: lobby.gameId, options: { ...(lobby.options || {}), teams }, userIds };
  // tear the lobby down; the room takes over
  for (const id of userIds) userLobby.delete(id);
  lobbies.delete(lobby.id);
  byCode.delete(lobby.code);
  return out;
}
