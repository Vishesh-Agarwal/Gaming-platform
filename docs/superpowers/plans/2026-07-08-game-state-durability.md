# Game-State Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live turn-based games and lobbies survive a server restart/crash/deploy by snapshotting them to SQLite and rehydrating on boot.

**Architecture:** `rooms.js`/`lobbies.js` gain `export`/`import` serializers that turn their in-RAM Maps into plain JSON and back (re-attaching the game module by id). A new `persistence.js` snapshots all turn-based rooms + lobbies to a `durable_state` SQLite table every ~3s and on graceful shutdown, and rehydrates on boot. The already-built reconnection resume path drops reconnecting clients back into their rehydrated game with no client change.

**Tech Stack:** Node 18 (ESM, `node:test`), better-sqlite3, Socket.IO 4. No new dependencies.

## Global Constraints

- Node **18.20.8**, server is **ESM** (`import`/`export`, `.js` extensions on relative imports).
- Test runner `node --test`. Whole server suite: `npm test --prefix server`; single file: `node --test server/test/<file>.test.js` from repo root.
- **Scope:** turn-based rooms (incl. human+bot) and lobbies. **Exclude realtime** rooms (`typeof room.game.step === 'function'`) — they end on restart. Never serialize `room.game`/`room.sim`/`room.undo`.
- **Only `status: 'playing'` rooms** are exported/imported.
- **A bad snapshot must never stop boot** — parse each row in its own try/catch, skip version-mismatched (`v !== SNAP_V`) or unparseable/unknown-game rows.
- Tests hit the real dev SQLite DB — use unique usernames (`createUser` + a unique suffix, as `server/test/rematch.test.js` does); never assert absolute counts. The durability unit tests are process-local (in-memory Maps) or pure — they do **not** touch the shared `durable_state` table (the DB layer is proven by the manual restart test) to avoid racing a running dev server's snapshotter.
- Restart the `:3001` dev server after server-code edits (plain `node`, no `--watch`).
- Do NOT add a `Co-Authored-By` trailer to commits.
- Commit after each task. Continue on the current `reconnection-grace` branch (durability builds on its resume path).

---

### Task 1: Room + lobby serialization

**Files:**
- Modify: `server/src/rooms.js` (add `exportRooms`, `importRooms`)
- Modify: `server/src/lobbies.js` (add `exportLobbies`, `importLobbies`)
- Create: `server/test/persistenceState.test.js`

**Interfaces:**
- Consumes: existing `getGame` (registry), `getUserById` (db), the module-level `rooms`/`userRooms` Maps in rooms.js and `lobbies`/`byCode`/`userLobby` Maps in lobbies.js.
- Produces:
  - `exportRooms() -> Array<{ id, gameId, status:'playing', options, result, turnEndsAt, state, players:[{index,userId,bot,botUser?}] }>` — skips realtime and non-playing rooms.
  - `importRooms(arr) -> string[]` — rebuilds rooms, returns the ids it imported.
  - `exportLobbies() -> Array<lobby>` (plain objects).
  - `importLobbies(arr) -> void`.

- [ ] **Step 1: Write the failing test**

Create `server/test/persistenceState.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/db.js';
import { createRoom, makeMove, getRoom, exportRooms, importRooms } from '../src/rooms.js';
import { createLobby, exportLobbies, importLobbies, getLobby } from '../src/lobbies.js';

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

test('a turn-based room round-trips through export/import with a working game module', () => {
  const a = createUser(uniq('dur_a'), 'x');
  const b = createUser(uniq('dur_b'), 'x');
  const { room } = createRoom('tictactoe', undefined, [a.id, b.id]);
  // seat 0 plays a move so state is non-initial
  const first = makeMove(room.id, room.state.turn === 0 ? a.id : b.id, { cell: 0 });
  assert.ok(!first.error, first.error);

  const exported = exportRooms();
  const mine = exported.find((r) => r.id === room.id);
  assert.ok(mine, 'room should be exported');
  assert.equal(mine.gameId, 'tictactoe');
  assert.equal(mine.status, 'playing');
  assert.equal(mine.players.length, 2);
  assert.ok(mine.players.every((p) => typeof p.index === 'number'));

  // simulate a DB round-trip and rehydrate under a fresh id
  const serial = JSON.parse(JSON.stringify(mine));
  serial.id = `rehyd_${room.id}`;
  const ids = importRooms([serial]);
  assert.deepEqual(ids, [serial.id]);

  const rebuilt = getRoom(serial.id);
  assert.ok(rebuilt, 'rebuilt room should exist');
  assert.deepEqual(rebuilt.state.board, getRoom(room.id).state.board);
  // proves the game module was re-attached: a further move applies without error
  const seat = rebuilt.state.turn;
  const mover = rebuilt.players.find((p) => p.index === seat).id;
  const res = makeMove(serial.id, mover, { cell: 1 });
  assert.ok(!res.error, `move on rehydrated room failed: ${res.error}`);
});

test('realtime rooms are excluded from the export', () => {
  const a = createUser(uniq('dur_rt_a'), 'x');
  const b = createUser(uniq('dur_rt_b'), 'x');
  const { room } = createRoom('karts', undefined, [a.id, b.id]);
  const exported = exportRooms();
  assert.equal(exported.find((r) => r.id === room.id), undefined);
});

test('lobbies round-trip through export/import', () => {
  const u = createUser(uniq('dur_lob'), 'x');
  const { lobby } = createLobby({ id: u.id, username: u.username }, 'ludo', undefined);
  assert.ok(lobby, 'lobby created');
  const exported = exportLobbies();
  const mine = exported.find((l) => l.id === lobby.id);
  assert.ok(mine, 'lobby exported');

  const serial = JSON.parse(JSON.stringify(mine));
  serial.id = `rehyd_${lobby.id}`;
  serial.code = 'ZZZZ';
  importLobbies([serial]);
  assert.ok(getLobby(serial.id), 'rehydrated lobby should exist');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/persistenceState.test.js`
Expected: FAIL — `exportRooms`/`importRooms`/`exportLobbies`/`importLobbies` are not exported.

- [ ] **Step 3: Add the room serializers to rooms.js**

In `server/src/rooms.js`, add near the other exported functions (e.g. after `getRoomIdForUser`):

```js
// ---- Durability: serialize/rehydrate turn-based rooms ----

// Plain, JSON-safe snapshot of every live turn-based room. Skips realtime rooms
// (their sim can't be cheaply serialized) and anything not currently playing.
export function exportRooms() {
  const out = [];
  for (const room of rooms.values()) {
    if (room.status !== 'playing') continue;
    if (typeof room.game.step === 'function') continue; // realtime — skip
    out.push({
      id: room.id,
      gameId: room.gameId,
      status: 'playing',
      options: room.options || null,
      result: room.result || null,
      turnEndsAt: room.turnEndsAt || null,
      state: room.state,
      players: room.players.map((p) => (p.user.bot
        ? { index: p.index, bot: true, botUser: p.user }
        : { index: p.index, bot: false, userId: p.user.id })),
    });
  }
  return out;
}

// Rebuild rooms from exported snapshots. Re-attaches the game module by id and
// rebuilds player user objects (bots from the stored object, humans re-fetched).
// Returns the ids actually imported. A bad entry is skipped, never thrown.
export function importRooms(arr) {
  const ids = [];
  for (const entry of arr || []) {
    try {
      if (!entry || entry.status !== 'playing') continue;
      const game = getGame(entry.gameId);
      if (!game) continue;
      const players = (entry.players || [])
        .slice()
        .sort((p1, p2) => p1.index - p2.index)
        .map((p) => ({ index: p.index, user: p.bot ? p.botUser : getUserById(p.userId) }));
      if (players.some((p) => !p.user)) continue; // a user vanished — drop the room
      const room = {
        id: entry.id,
        gameId: entry.gameId,
        game,
        players,
        state: entry.state,
        options: entry.options || null,
        status: 'playing',
        result: entry.result || null,
        turnEndsAt: entry.turnEndsAt || null,
      };
      rooms.set(room.id, room);
      for (const p of room.players) if (!p.user.bot) userRooms.set(p.user.id, room.id);
      ids.push(room.id);
    } catch { /* skip a corrupt entry — durability must never break boot */ }
  }
  return ids;
}
```

- [ ] **Step 4: Add the lobby serializers to lobbies.js**

In `server/src/lobbies.js`, add near the other exports:

```js
// ---- Durability: serialize/rehydrate lobbies ----

// Lobbies are entirely plain data (no function refs), so export is a shallow
// copy of each lobby object.
export function exportLobbies() {
  return [...lobbies.values()].map((l) => ({ ...l }));
}

export function importLobbies(arr) {
  for (const lobby of arr || []) {
    try {
      if (!lobby || !lobby.id) continue;
      lobbies.set(lobby.id, lobby);
      if (lobby.code) byCode.set(lobby.code, lobby.id);
      for (const m of lobby.members || []) userLobby.set(m.id, lobby.id);
    } catch { /* skip a corrupt lobby */ }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test server/test/persistenceState.test.js`
Expected: PASS (3 tests).
Run: `npm test --prefix server`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add server/src/rooms.js server/src/lobbies.js server/test/persistenceState.test.js
git commit -m "feat(durability): export/import serializers for rooms and lobbies"
```

---

### Task 2: The snapshotter + storage table

**Files:**
- Modify: `server/src/db.js` (add `durable_state` table + `replaceDurableState`/`readDurableState`)
- Create: `server/src/persistence.js`
- Create: `server/test/persistenceSnapshot.test.js`

**Interfaces:**
- Consumes: `exportRooms`/`importRooms` (rooms.js), `exportLobbies`/`importLobbies` (lobbies.js), `replaceDurableState`/`readDurableState` (db.js).
- Produces:
  - db.js: `replaceDurableState(rows: Array<{kind,id,v,json}>)`, `readDurableState() -> rows`.
  - persistence.js: `SNAP_V` (const `1`), `parseSnapshotRows(rows) -> { rooms, lobbies }` (pure), `snapshotNow()`, `loadSnapshot() -> { rooms, lobbies }`, `rehydrate() -> { roomIds }`, `startSnapshotter(ms=3000)`, `stopSnapshotter()`.

- [ ] **Step 1: Write the failing test (pure parse logic)**

Create `server/test/persistenceSnapshot.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotRows, SNAP_V } from '../src/persistence.js';

test('parseSnapshotRows routes rooms and lobbies and skips bad rows', () => {
  const rows = [
    { kind: 'room', id: 'r1', v: SNAP_V, json: JSON.stringify({ id: 'r1', gameId: 'tictactoe' }) },
    { kind: 'lobby', id: 'l1', v: SNAP_V, json: JSON.stringify({ id: 'l1', code: 'ABCD', members: [] }) },
    { kind: 'room', id: 'bad-json', v: SNAP_V, json: '{not valid json' },        // skipped
    { kind: 'room', id: 'old-version', v: SNAP_V + 99, json: JSON.stringify({}) }, // skipped
  ];
  const { rooms, lobbies } = parseSnapshotRows(rows);
  assert.deepEqual(rooms.map((r) => r.id), ['r1']);
  assert.deepEqual(lobbies.map((l) => l.id), ['l1']);
});

test('parseSnapshotRows tolerates an empty/undefined input', () => {
  assert.deepEqual(parseSnapshotRows([]), { rooms: [], lobbies: [] });
  assert.deepEqual(parseSnapshotRows(undefined), { rooms: [], lobbies: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/persistenceSnapshot.test.js`
Expected: FAIL — `Cannot find module '../src/persistence.js'`.

- [ ] **Step 3: Add the storage table + accessors to db.js**

In `server/src/db.js`, add to the `db.exec(\`...\`)` schema block (or a new `db.exec` after it) the table:

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS durable_state (
    kind TEXT NOT NULL,
    id   TEXT NOT NULL,
    v    INTEGER NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (kind, id)
  );
`);
```

Then add the accessors (near the other exported query functions, before `export default db;`):

```js
const _clearDurable = db.prepare('DELETE FROM durable_state');
const _insertDurable = db.prepare('INSERT INTO durable_state (kind, id, v, json) VALUES (?, ?, ?, ?)');
const _replaceDurable = db.transaction((rows) => {
  _clearDurable.run();
  for (const r of rows) _insertDurable.run(r.kind, r.id, r.v, r.json);
});

// Atomically replace the whole durable_state snapshot.
export function replaceDurableState(rows) {
  _replaceDurable(rows || []);
}

export function readDurableState() {
  return db.prepare('SELECT kind, id, v, json FROM durable_state').all();
}
```

- [ ] **Step 4: Write persistence.js**

Create `server/src/persistence.js`:

```js
// Durability: periodic + on-shutdown snapshot of live turn-based rooms and
// lobbies to SQLite, and rehydration on boot. Single-instance only.
import { exportRooms, importRooms } from './rooms.js';
import { exportLobbies, importLobbies } from './lobbies.js';
import { replaceDurableState, readDurableState } from './db.js';

// Bump whenever the serialized room/lobby shape changes — older snapshots are
// then discarded on load rather than mis-read.
export const SNAP_V = 1;

let timer = null;

// Pure: turn raw durable_state rows into { rooms, lobbies }, skipping rows whose
// version mismatches or whose json is unparseable. Never throws.
export function parseSnapshotRows(rows) {
  const rooms = [];
  const lobbies = [];
  for (const row of rows || []) {
    if (!row || row.v !== SNAP_V) continue;
    let data;
    try { data = JSON.parse(row.json); } catch { continue; }
    if (row.kind === 'room') rooms.push(data);
    else if (row.kind === 'lobby') lobbies.push(data);
  }
  return { rooms, lobbies };
}

export function snapshotNow() {
  const rows = [];
  for (const r of exportRooms()) rows.push({ kind: 'room', id: r.id, v: SNAP_V, json: JSON.stringify(r) });
  for (const l of exportLobbies()) rows.push({ kind: 'lobby', id: l.id, v: SNAP_V, json: JSON.stringify(l) });
  replaceDurableState(rows);
}

export function loadSnapshot() {
  return parseSnapshotRows(readDurableState());
}

// Load the snapshot into the live Maps. Returns the imported room ids so the
// caller can re-arm turn clocks and nudge bots.
export function rehydrate() {
  const { rooms, lobbies } = loadSnapshot();
  importLobbies(lobbies);
  const roomIds = importRooms(rooms);
  return { roomIds };
}

export function startSnapshotter(ms = 3000) {
  stopSnapshotter();
  timer = setInterval(() => {
    try { snapshotNow(); } catch (e) { console.error('[persistence] snapshot failed:', e); }
  }, ms);
  timer.unref?.();
}

export function stopSnapshotter() {
  if (timer) { clearInterval(timer); timer = null; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test server/test/persistenceSnapshot.test.js`
Expected: PASS (2 tests).
Run: `npm test --prefix server`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.js server/src/persistence.js server/test/persistenceSnapshot.test.js
git commit -m "feat(durability): snapshotter + durable_state table with version-safe load"
```

---

### Task 3: Boot/shutdown wiring + bot resume + manual verification

**Files:**
- Modify: `server/src/socketHandlers.js` (export `resumeBots`)
- Modify: `server/src/index.js` (rehydrate on boot, snapshot on shutdown)
- Create: `server/test/resumeBotsWiring.test.js`

**Interfaces:**
- Consumes: `rehydrate`/`snapshotNow`/`startSnapshotter`/`stopSnapshotter` (persistence.js), `armTurnClock` (turnclock.js), `resumeBots` (socketHandlers.js), existing internal `isBotTurn`/`scheduleBotTurn`.
- Produces: `resumeBots(io, roomIds)` in socketHandlers.js.

- [ ] **Step 1: Write the failing wiring test**

Create `server/test/resumeBotsWiring.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resumeBots } from '../src/socketHandlers.js';

const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('resumeBots is exported and is a no-op for an empty/nonexistent room list', () => {
  assert.equal(typeof resumeBots, 'function');
  const mockIo = { to: () => ({ emit() {} }) };
  assert.doesNotThrow(() => resumeBots(mockIo, []));
  assert.doesNotThrow(() => resumeBots(mockIo, ['no-such-room']));
});

test('index.js rehydrates on boot and snapshots on shutdown', () => {
  assert.match(index, /rehydrate\(\)/);
  assert.match(index, /armTurnClock\(/);
  assert.match(index, /resumeBots\(/);
  assert.match(index, /startSnapshotter\(/);
  assert.match(index, /snapshotNow\(\)/);
  assert.match(index, /stopSnapshotter\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/resumeBotsWiring.test.js`
Expected: FAIL — `resumeBots` not exported (import error).

- [ ] **Step 3: Export resumeBots from socketHandlers.js**

In `server/src/socketHandlers.js`, add this exported function at module scope
(e.g. just below the `scheduleBotTurn` function definition):

```js
// After a boot-time rehydrate, nudge any room whose current turn belongs to a
// bot so play resumes without waiting for the turn clock to expire.
export function resumeBots(io, roomIds) {
  for (const id of roomIds || []) {
    if (isBotTurn(id)) scheduleBotTurn(io, id);
  }
}
```

- [ ] **Step 4: Wire rehydrate/snapshot into index.js**

In `server/src/index.js`, add to the imports:

```js
import { rehydrate, snapshotNow, startSnapshotter, stopSnapshotter } from './persistence.js';
import { resumeBots } from './socketHandlers.js';
import { armTurnClock } from './turnclock.js';
```

Inside the `if (import.meta.url === ...)` boot block, after `initSockets(io);`
and before `server.listen(...)`, add the rehydrate:

```js
  // Restore any live turn-based games/lobbies persisted before the last stop.
  const { roomIds } = rehydrate();
  for (const id of roomIds) armTurnClock(io, id);
  resumeBots(io, roomIds);
  startSnapshotter();
  if (roomIds.length) console.log(`[server] rehydrated ${roomIds.length} live game(s)`);
```

In the same block, update the `shutdown` function to snapshot before closing the
DB — change its body from:

```js
    server.close(() => {
      try { closeDb(); } catch { /* already closed */ }
      process.exit(0);
    });
```

to:

```js
    server.close(() => {
      try { stopSnapshotter(); snapshotNow(); } catch (e) { console.error('[server] final snapshot failed:', e); }
      try { closeDb(); } catch { /* already closed */ }
      process.exit(0);
    });
```

- [ ] **Step 5: Run tests + boot smoke**

Run: `node --test server/test/resumeBotsWiring.test.js`
Expected: PASS (2 tests).
Run: `npm test --prefix server`
Expected: full suite green.
Boot smoke — run the server directly on a throwaway port and confirm it starts
and logs cleanly:
```bash
cd server && PORT=3009 node src/index.js
```
Expected: prints the listening line (and, if a snapshot exists, a "rehydrated N
live game(s)" line); Ctrl-C exits cleanly. Then stop it.

- [ ] **Step 6: Commit**

```bash
git add server/src/socketHandlers.js server/src/index.js server/test/resumeBotsWiring.test.js
git commit -m "feat(durability): rehydrate games on boot, snapshot on shutdown, resume bots"
```

- [ ] **Step 7: Manual 2-account restart verification**

Restart the `:3001` dev server on the new code. With two accounts in two tabs:
1. Start a turn-based game (e.g. Checkers via a shared join code) and make a
   couple of moves so the board is non-trivial.
2. Restart the `:3001` server process (kill + start) — a graceful stop triggers
   the shutdown snapshot; a fresh start rehydrates.
3. Both tabs' sockets auto-reconnect → the resume path emits `game:start` → both
   land back in the **same** game with the board and turn intact.
4. Finish or make another move to confirm play continues normally.
5. Bonus: verify a realtime match (Karts vs a bot) does NOT resume after a
   restart (expected — realtime is excluded; the match ends and you're on Home).

---

## Notes for the executor

- **Order:** Task 1 (serializers) → Task 2 (snapshotter, consumes them) → Task 3 (boot wiring, consumes both).
- **The DB layer (`durable_state` read/write) has no unit test on purpose** — a running dev server snapshots to the same shared table every 3s, which would race a unit test. The pure `parseSnapshotRows` covers the risky version/corrupt-skip logic, the serializers are covered process-locally, and the manual restart test exercises the real DB path end-to-end.
- **Turn clocks:** `importRooms` preserves the stored absolute `turnEndsAt`; `armTurnClock` schedules for the *remaining* time, so a deadline that passed during downtime fires immediately (auto-plays that turn) — correct behavior.
- **No client changes** — reconnecting clients resume through the existing `game:start` path built for reconnection grace.
- After server edits, restart `:3001` (plain `node`, no `--watch`).
