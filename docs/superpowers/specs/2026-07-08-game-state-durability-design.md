# Game-State Durability — Design

**Date:** 2026-07-08

## Goal

Make live turn-based games and lobbies survive a server restart, crash, or
deploy. Today all room/lobby state lives only in module-level RAM Maps, so
restarting the process (a deploy, a crash, or even the dev `node` restart)
vaporizes every active match. This adds a periodic + on-shutdown snapshot of
that state to SQLite and rehydrates it on boot, so games resume instead of
vanishing.

This is the "durability" half of the priority-2 review item — **single-instance
only**. Full multi-instance (Redis shared state, Socket.IO Redis adapter,
room-affinity, Postgres) is explicitly *out of scope*; this is the necessary
groundwork for it but does not attempt it.

## The client side is already done

After a restart, socket.io auto-reconnects each client. The reconnection-grace
resume path (2026-07-07) already re-emits `game:start` to any user the server
finds in a `playing` room on (re)connect. So once the server **rehydrates its
rooms on boot**, players are dropped back into their game with **no new client
code**. Durability is a server-only change.

## Scope

- **Persisted:** turn-based rooms (including human + bot games) and lobbies.
- **Dropped on restart:** realtime matches — Karts and Ghost Rider (a 30 Hz live
  sim can't be cheaply serialized; consistent with reconnection scope). Their
  matches end; clients reconnect and land on Home. Also dropped: transient
  invites, rematch offers, and undo requests (low value, rebuilt naturally).

## Architecture

One new module, one new table, and export/import helpers on the two state
owners.

### `server/src/db.js` — the storage table

```sql
CREATE TABLE IF NOT EXISTS durable_state (
  kind TEXT NOT NULL,   -- 'room' | 'lobby'
  id   TEXT NOT NULL,
  v    INTEGER NOT NULL, -- schema version of the serialized payload
  json TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
```

Plus `db.js` helpers: `replaceDurableState(rows)` (one transaction: `DELETE FROM
durable_state` then insert all `rows`), and `readDurableState()` (returns all
rows).

### `server/src/persistence.js` (new) — the snapshotter

- `startSnapshotter(io, intervalMs = 3000)` — a `setInterval` that calls
  `snapshotNow()`; returns nothing (stored internally so it can be stopped).
- `snapshotNow()` — gathers `exportRooms()` + `exportLobbies()`, maps each to a
  `{ kind, id, v: SNAP_V, json }` row, and calls `replaceDurableState(rows)` in
  a single transaction (full replace, so ended games fall out automatically).
- `loadSnapshot()` — reads rows, JSON-parses each in its own try/catch,
  discards rows whose `v !== SNAP_V` or that fail to parse, returns
  `{ rooms: [...], lobbies: [...] }`.
- `stopSnapshotter()` — clears the interval (for the shutdown hook / tests).

### `server/src/rooms.js` — export / import

- `exportRooms()` → array of serialized rooms. **Skips** realtime rooms
  (`typeof room.game.step === 'function'`) and any room whose `status !==
  'playing'`. Each serialized room:
  ```js
  {
    id, gameId, status: 'playing', options, result: null, turnEndsAt,
    state,   // the plain game-state object
    players: [
      // one entry per seat; humans carry only userId, bot seats carry the
      // full synthetic bot user object (bots have no DB row to re-fetch).
      { index, userId: 123, bot: false },
      { index, bot: true, botUser: { id: -1, username: 'Bot Nova', bot: true } },
    ],
  }
  ```
  (State is already a plain serializable object. `room.game`, `room.sim`,
  `room.undo` are **not** serialized — game re-attached by id, sim/undo dropped.)
- `importRooms(arr)` → for each entry: `game = getGame(gameId)` (skip if the
  game id is unknown); rebuild each seat's `user` (bot → the stored `botUser`;
  human → `getUserById(userId)`), ordered by `index`; build the room
  object `{ id, gameId, game, players, state, status, options, result,
  turnEndsAt }`; `rooms.set(id, room)`; `userRooms.set(userId, id)` for each
  human. Returns the list of imported room ids so the caller can re-arm clocks
  and nudge bots.

### `server/src/lobbies.js` — export / import

- `exportLobbies()` → array of serialized lobbies (id, gameId, code, host,
  members `[{ userId, ready, team? }]`, options, createdAt). Lobbies hold no
  game state, so this is a near-verbatim structure dump.
- `importLobbies(arr)` → rebuild the `lobbies`, `byCode`, and `userLobby` Maps.

## Boot & shutdown flow

1. **Boot** (`index.js`, inside the direct-run block, before `server.listen`):
   `const snap = loadSnapshot(); importLobbies(snap.lobbies); const ids =
   importRooms(snap.rooms);`. After `io` is created + `initSockets(io)`: for
   each imported room id, re-arm the turn clock from the stored `turnEndsAt`
   (`armTurnClock(io, id)` — it reads the room's deadline), and if it is a
   bot's turn, `scheduleBotTurn(io, id)`. Then `startSnapshotter(io)`.
   - `scheduleBotTurn` is currently internal to `socketHandlers.js`; export a
     small `resumeBots(io)` from there (iterates imported rooms, nudges bot
     turns) so `index.js` doesn't reach into internals.
2. **Serving:** clients auto-reconnect → the existing connection handler finds
   their `playing` room → emits `game:start` → they resume.
3. **Shutdown** (the existing SIGTERM/SIGINT hook): call `stopSnapshotter()`
   then `snapshotNow()` *before* `closeDb()`.

## Safety & correctness

- **A bad snapshot must never stop the server booting.** `loadSnapshot()`
  parses each row in its own try/catch and skips version-mismatched
  (`v !== SNAP_V`) or unparseable rows. `importRooms`/`importLobbies` skip any
  entry that references an unknown game id or throws while rebuilding.
- **Only `playing` rooms** are exported/imported — an `over` room left in the
  table by a crash-between-snapshots is never rehydrated.
- **Hard-crash loss ceiling:** the last ≤ `intervalMs` (~3s) of activity — at
  most one turn-based move, which the player simply re-makes. Graceful deploys
  (the common case) snapshot on shutdown and lose nothing.
- **Bump `SNAP_V`** whenever the serialized room/lobby shape changes; old
  snapshots are then discarded rather than mis-read.

## Testing

- **Unit (`server/test/persistenceRooms.test.js`):** create a real room via
  `createRoom`, apply a move, `exportRooms()`, clear the `rooms` Map,
  `importRooms(exported)`, then assert: state/status/players preserved, the
  game module is re-attached (`getResult`/`applyMove` work), and a further
  `makeMove` still applies. A realtime room is excluded from the export. An
  `over` room is excluded.
- **Unit (`server/test/persistenceSnapshot.test.js`):** `snapshotNow()` writes
  rows; `loadSnapshot()` returns them; a row with a wrong `v` or corrupt json
  is skipped, not thrown. Lobby round-trip.
- **Full suite** stays green (`npm test --prefix server`).
- **Manual:** 2-account turn-based game (e.g. Checkers) mid-match → restart
  `:3001` → both clients auto-reconnect and land back in the same game with the
  board intact and the correct turn.

## Out of scope (documented for later)

Multi-instance horizontal scale (Redis + Socket.IO adapter + room-affinity +
Postgres). This durability layer is the prerequisite groundwork; when real
concurrent load justifies it, the serialized room/lobby shapes defined here
move from SQLite to Redis with minimal change to the export/import helpers.
