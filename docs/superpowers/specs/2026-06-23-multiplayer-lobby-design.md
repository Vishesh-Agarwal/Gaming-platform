# Multiplayer lobby (N-player rooms) — for Smash Karts

**Date:** 2026-06-23
**Goal:** Let a host gather 2–N players (N = game `maxPlayers`, 4 for karts) into
a lobby, ready up, and start an N-player match. Join via **friend invite or a
shareable room code**. Start gated on **≥2 players and all ready**. Games with
`maxPlayers <= 2` keep the existing 1:1 invite untouched.

## Server

### `rooms.js`
- New `createRoom(gameId, options, userIds)` — generic N-player room: players
  indexed 0..n-1, `createInitialState(options)`, sim init if realtime, register
  `userRooms`. (acceptInvite keeps its 1:1 path.) Returns `{ room }` / `{ error }`.

### `lobbies.js` (new)
State: `lobbies` (id→lobby), `byCode` (CODE→id), `userLobby` (userId→id).
Lobby: `{ id, code, gameId, gameName, options, hostId, maxPlayers, members:[{id,username,ready}], createdAt }`.
- `createLobby(host, gameId, options)` — game must exist; auto-leave any prior
  lobby; host joins (ready false); unique 4-letter `code`.
- `joinLobby(idOrCode, user)` — find by id or code; reject if full; idempotent if
  already in; leave prior lobby first.
- `leaveLobby(userId)` — remove; if host left, transfer host to members[0] or
  delete lobby (+code) if empty; returns `{ lobby|null, memberIds, closed }`.
- `setReady(userId, ready)`, `getLobbyForUser(userId)`, `publicLobby(lobby)`.
- `startLobby(hostId)` — host only; `members>=2 && >=minPlayers && all ready`;
  returns `{ gameId, options, userIds }` and deletes the lobby.

### `socketHandlers.js` (events, all use `me.id`)
- `lobby:create {gameId, options}` (reject if in a room) → ack `{lobby}`.
- `lobby:join {lobbyId|code}` → ack `{lobby}`; broadcast `lobby:update` to members.
- `lobby:invite {toUserId}` → if online — emit `lobby:invited {lobbyId, code,
  gameName, from}`.
- `lobby:ready {ready}` / `lobby:leave {}` → update/close; broadcast.
- `lobby:start {}` (host) → `createRoom(...)`; emit `game:start` to all; if
  realtime, `startMatch`. ack errors otherwise.
- Broadcast helper emits `lobby:update` (publicLobby) to all member ids; on close,
  `lobby:closed`.
- On disconnect: `leaveLobby(me.id)` and broadcast, alongside existing forfeit.

## Client

### `registry.js`
Add `maxPlayers` to entries (karts 4, others 2); expose in `availableGames`.

### `Home.jsx`
- State `lobby`, `lobbyInvites`. Listeners: `lobby:update`→setLobby,
  `lobby:invited`→push, `lobby:closed`→clear+flash. `game:start` also clears lobby.
- Handlers: `onCreateLobby(gameId, options)`, `onJoinLobby({lobbyId|code})`,
  `onLeaveLobby`, `onReady(ready)`, `onInviteToLobby(friendId)`, `onStartLobby`.

### `Lobby.jsx`
- Card click branches: `maxPlayers > 2` → `onCreateLobby(game.id)`; else the
  existing InviteModal.
- Lobby invites shown in the floating banner with **Join**.
- A **Join by code** control in the top bar.
- Render `LobbyModal` when `lobby` is set.

### `LobbyModal.jsx` (new)
Shows game name, big **room code**, member list (host tag + ready ✓), my **Ready**
toggle, **invite online friends** (non-members) list, **Start** (host only,
enabled when ≥2 + all ready), **Leave**.

## Out of scope (next)
Weapons/kills/timer/scoreboard; models/perf; reconnection.

## Testing
Server unit-ish: createLobby/join (by id + code)/ready/host-transfer/start
(gating) and `createRoom` builds an N-player room with a sim. Client build.
Manual: 3 browsers — host invites + code join, ready up, start, all spawn.
