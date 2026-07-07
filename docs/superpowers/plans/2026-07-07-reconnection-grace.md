# Reconnection Grace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give turn-based games a 45-second grace window on disconnect instead of an instant forfeit, and resume a returning player straight back into their game (covering both transient socket drops and full page reloads).

**Architecture:** A tiny pure timer module (`reconnect.js`) holds per-user "pending forfeit" timers. `socketHandlers.js` schedules one on the last-socket disconnect of a turn-based room (instead of forfeiting) and cancels it on reconnect; on any connect while in a playing room it re-emits `game:start`, which the client already renders. Realtime games (Karts, Ghost Rider) and the turn clock are untouched.

**Tech Stack:** Node 18 (ESM, `node:test`), Socket.IO 4, React. No new dependencies.

## Global Constraints

- Node is **18.20.8**, server is **ESM** (`"type": "module"`) — `import`/`export`, `.js` extensions on relative imports.
- Test runner: `node --test`. Whole server suite: `npm test --prefix server`. Single server file: `node --test server/test/<file>.test.js` from repo root. Client suite: `node --test client/test/`.
- **In scope:** the 17 turn-based games. **Out of scope:** realtime games (Karts/Ghost Rider keep today's immediate drop) and surviving a *server* restart.
- **Grace window:** 45 s, from `config.reconnectGraceMs` (env `RECONNECT_GRACE_MS`, default 45000).
- **Turn clock is untouched** — grace only gates the forfeit; the existing per-turn timeout/auto-play keeps running.
- Client tests in this repo are **source-assertion** style (`readFileSync` + regex) — there is no socket.io integration harness. Follow that pattern for wiring/UI tests.
- Restart the `:3001` dev server after server-code edits (plain `node`, no `--watch`).
- Commit after each task. Branch off `main` first: `git switch -c reconnection-grace`.

---

### Task 1: Pending-forfeit timer module

**Files:**
- Create: `server/src/reconnect.js`
- Create: `server/test/reconnect.test.js`

**Interfaces:**
- Produces:
  - `scheduleForfeit(userId, ms, onExpire)` — starts (replacing any existing) a timer for `userId` that calls `onExpire()` after `ms`.
  - `cancelForfeit(userId) -> boolean` — clears the timer; returns `true` iff one was pending.
  - `hasPending(userId) -> boolean` — whether a timer is currently pending.

- [ ] **Step 1: Write the failing test**

Create `server/test/reconnect.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleForfeit, cancelForfeit, hasPending } from '../src/reconnect.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('scheduleForfeit fires the callback after the delay', async () => {
  let fired = false;
  scheduleForfeit('u1', 20, () => { fired = true; });
  assert.equal(hasPending('u1'), true);
  await wait(45);
  assert.equal(fired, true);
  assert.equal(hasPending('u1'), false); // cleared after firing
});

test('cancelForfeit prevents the callback and reports it was pending', async () => {
  let fired = false;
  scheduleForfeit('u2', 30, () => { fired = true; });
  assert.equal(cancelForfeit('u2'), true);
  assert.equal(cancelForfeit('u2'), false); // nothing left to cancel
  await wait(50);
  assert.equal(fired, false);
});

test('re-scheduling replaces the prior timer', async () => {
  let count = 0;
  scheduleForfeit('u3', 20, () => { count += 1; });
  scheduleForfeit('u3', 20, () => { count += 1; }); // replaces the first
  await wait(45);
  assert.equal(count, 1); // only the second timer fires
});

test('separate users have independent timers', async () => {
  const fired = [];
  scheduleForfeit('a', 20, () => fired.push('a'));
  scheduleForfeit('b', 20, () => fired.push('b'));
  cancelForfeit('a');
  await wait(45);
  assert.deepEqual(fired, ['b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/reconnect.test.js`
Expected: FAIL — `Cannot find module '../src/reconnect.js'`.

- [ ] **Step 3: Write the module**

Create `server/src/reconnect.js`:

```js
// Pending-forfeit timers for reconnection grace. When a player's last socket
// drops mid-(turn-based-)game, socketHandlers schedules a forfeit here instead
// of running it immediately; a reconnect within the window cancels it. Pure
// timer bookkeeping — no io/rooms imports, so it unit-tests in isolation.
const timers = new Map(); // userId -> timeout id

export function scheduleForfeit(userId, ms, onExpire) {
  cancelForfeit(userId); // never stack two timers for the same user
  const id = setTimeout(() => {
    timers.delete(userId);
    onExpire();
  }, ms);
  timers.set(userId, id);
}

export function cancelForfeit(userId) {
  const id = timers.get(userId);
  if (id === undefined) return false;
  clearTimeout(id);
  timers.delete(userId);
  return true;
}

export function hasPending(userId) {
  return timers.has(userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/reconnect.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/reconnect.js server/test/reconnect.test.js
git commit -m "feat(reconnect): pending-forfeit timer module for grace window"
```

---

### Task 2: Server wiring — grace on disconnect, cancel + resume on reconnect

**Files:**
- Modify: `server/src/config.js` (add `reconnectGraceMs`)
- Modify: `server/src/socketHandlers.js` (imports, connection handler, disconnect handler, `otherHumans` helper)
- Create: `server/test/reconnectWiring.test.js`

**Interfaces:**
- Consumes: `scheduleForfeit`, `cancelForfeit` from Task 1; `config.reconnectGraceMs`; existing `getRoomIdForUser`, `getRoomForUser`, `isRealtimeRoom`, `emitToUser`, `handleLeave`, `offline`, `broadcastPresence`.
- Produces: a `game:peer` socket event to opponents (`{ roomId, userId, username, status: 'left'|'back', graceMs? }`) and a resume `game:start`/`game:over` to the reconnecting socket. Consumed by Task 3.

- [ ] **Step 1: Add reconnectGraceMs to config**

In `server/src/config.js`, in the object returned by `loadConfig`, add the field after `trustProxy`:

```js
    // Number of proxy hops to trust for client IP (rate limiting). 0 = none.
    trustProxy: Number(env.TRUST_PROXY) || 0,
    // Grace window (ms) before a disconnected turn-based player forfeits.
    reconnectGraceMs: Number(env.RECONNECT_GRACE_MS) || 45000,
```

- [ ] **Step 2: Write the failing wiring test**

Create `server/test/reconnectWiring.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';

const handlers = readFileSync(new URL('../src/socketHandlers.js', import.meta.url), 'utf8');

test('config exposes a 45s default reconnect grace window', () => {
  assert.equal(loadConfig({}).reconnectGraceMs, 45000);
  assert.equal(loadConfig({ RECONNECT_GRACE_MS: '30000' }).reconnectGraceMs, 30000);
});

test('socketHandlers wires the grace timer and gates it on turn-based rooms', () => {
  assert.match(handlers, /from '\.\/reconnect\.js'/);
  assert.match(handlers, /scheduleForfeit\(/);
  assert.match(handlers, /cancelForfeit\(/);
  // grace only for non-realtime rooms; realtime still drops immediately
  assert.match(handlers, /isRealtimeRoom/);
  assert.match(handlers, /reconnectGraceMs/);
});

test('socketHandlers notifies opponents and resumes on reconnect', () => {
  assert.match(handlers, /'game:peer'/);
  assert.match(handlers, /status: 'left'/);
  assert.match(handlers, /status: 'back'/);
  // resume path re-emits game:start to the reconnecting socket
  assert.match(handlers, /socket\.emit\('game:start'/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test server/test/reconnectWiring.test.js`
Expected: FAIL — the `config` test passes but the `socketHandlers` assertions fail (no reconnect wiring yet).

- [ ] **Step 4: Add imports to socketHandlers.js**

In `server/src/socketHandlers.js`, add after the existing `import { allowSocketEvent } from './security.js';` line:

```js
import { scheduleForfeit, cancelForfeit } from './reconnect.js';
import config from './config.js';
```

- [ ] **Step 5: Add the `otherHumans` helper**

In `server/src/socketHandlers.js`, add this helper next to the other module-level
helpers (e.g. just below `const botTimers = new Set();`):

```js
// Human user ids in a (public) room other than `meId` — the opponents to notify
// about a disconnect/reconnect. Bots and the player themself are excluded.
function otherHumans(room, meId) {
  if (!room) return [];
  return room.players.filter((p) => !p.bot && p.id !== meId).map((p) => p.id);
}
```

- [ ] **Step 6: Replace the disconnect handler with the grace branch**

In `server/src/socketHandlers.js`, replace the existing disconnect handler:

```js
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
```

with:

```js
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
```

- [ ] **Step 7: Add cancel + resume to the connection handler**

In `server/src/socketHandlers.js`, find the connection-open block (right after
`socket.emit('presence:init', ...)`), and add this immediately after that
`presence:init` emit:

```js
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test server/test/reconnectWiring.test.js`
Expected: PASS (3 tests).
Run: `npm test --prefix server`
Expected: full suite green.

- [ ] **Step 9: Commit**

```bash
git add server/src/config.js server/src/socketHandlers.js server/test/reconnectWiring.test.js
git commit -m "feat(reconnect): 45s grace on disconnect + resume game:start on reconnect"
```

---

### Task 3: Client — opponent-disconnected banner

**Files:**
- Modify: `client/src/pages/Home.jsx` (listen for `game:peer`, hold `peer` state, pass to `Game`, clear on start/over)
- Modify: `client/src/pages/Game.jsx` (render a banner when a peer is disconnected)
- Create: `client/test/reconnectUi.test.js`

**Interfaces:**
- Consumes: the `game:peer` event `{ status: 'left'|'back', username, graceMs }` from Task 2, and the resume `game:start`/`game:over` (already handled by the existing `Home.jsx` listeners — no change needed for resume).
- Produces: a `peer` prop on `<Game>` and a `.game-peer-banner` element.

- [ ] **Step 1: Write the failing source-assertion test**

Create `client/test/reconnectUi.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');

test('Home listens for game:peer and clears peer state on start/over', () => {
  assert.match(home, /socket\.on\('game:peer'/);
  assert.match(home, /setPeer/);
  assert.match(home, /peer=\{peer\}/); // passed to <Game>
});

test('Game renders an opponent-disconnected banner from the peer prop', () => {
  assert.match(game, /peer/); // prop in the signature
  assert.match(game, /game-peer-banner/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/reconnectUi.test.js`
Expected: FAIL — no `game:peer` listener / `game-peer-banner` yet.

- [ ] **Step 3: Add peer state + listener in Home.jsx**

In `client/src/pages/Home.jsx`, add a `peer` state alongside the other game
state (near `const [activeRoom, setActiveRoom] = useState(...)`):

```js
  const [peer, setPeer] = useState(null); // opponent disconnect info, or null
```

Add the `game:peer` listener next to the existing `game:state`/`game:over`
listeners (just after the `socket.on('game:over', ...)` line):

```js
    socket.on('game:peer', (info) => {
      if (info.status === 'left') setPeer(info);
      else setPeer(null); // 'back'
    });
```

Clear the peer banner whenever a new/resumed game starts or a game ends — add
`setPeer(null);` inside the existing `socket.on('game:start', ...)` handler
(next to the other reset calls like `setGameError('')`) and inside the
`socket.on('game:over', ...)` handler:

```js
    socket.on('game:over', ({ room }) => { setActiveRoom(room); setPeer(null); });
```

(For `game:start`, add `setPeer(null);` among its existing `setX(...)` reset
lines.)

Add `setPeer` cleanup with the other `socket.off(...)` calls in the effect's
teardown:

```js
      socket.off('game:peer');
```

Pass the prop to `<Game>` — add `peer={peer}` to the `<Game ... />` prop list:

```js
        <Game
          room={activeRoom}
          youAreIndex={youAreIndex}
          onMove={onMove}
          onLeave={onLeave}
          onRematch={onRematch}
          rematch={rematch}
          onEmote={onEmote}
          onUndoRequest={onUndoRequest}
          onUndoAccept={onUndoAccept}
          emotes={emotes}
          error={gameError}
          progression={lastMatchProgression}
          peer={peer}
        />
```

- [ ] **Step 4: Render the banner in Game.jsx**

In `client/src/pages/Game.jsx`, add `peer = null` to the component signature:

```js
export default function Game({ room, youAreIndex, onMove, onLeave, onRematch, rematch, onEmote, onUndoRequest, onUndoAccept, emotes = [], error, progression = null, peer = null }) {
```

Render the banner next to the existing error banner. Find the line
`{error && <div className="error-banner">{error}</div>}` and add above it:

```jsx
      {peer && peer.status === 'left' && (
        <div className="game-peer-banner">
          {peer.username || 'Opponent'} disconnected — reconnecting…
        </div>
      )}
```

- [ ] **Step 5: Add banner styling**

In `client/src/styles.css`, append (near the other game-page chrome rules):

```css
.game-peer-banner {
  width: min(1080px, 100%);
  margin-bottom: 10px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(242, 176, 73, 0.4);
  background: rgba(242, 176, 73, 0.12);
  color: var(--text);
  font-weight: 700;
  text-align: center;
}
```

- [ ] **Step 6: Run tests + build to verify**

Run: `node --test client/test/reconnectUi.test.js`
Expected: PASS (2 tests).
Run: `node --test client/test/`
Expected: full client suite green.
Run: `npm run build --prefix client`
Expected: builds clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Home.jsx client/src/pages/Game.jsx client/src/styles.css client/test/reconnectUi.test.js
git commit -m "feat(reconnect): opponent-disconnected banner + peer state wiring"
```

- [ ] **Step 8: Manual 2-account browser verification**

Restart the `:3001` server so it runs the new code. Then, with two accounts in
two tabs:
1. Start a turn-based game (e.g. Checkers via a shared code, or any bot-less
   1v1) and make sure it's in the `playing` phase.
2. In tab A, kill the socket (DevTools → Network → offline, or close the tab).
   → Tab B shows the `.game-peer-banner` ("… disconnected — reconnecting…") and
   the turn clock (if any) keeps running.
3. Bring tab A back within 45 s (toggle online / reopen + re-login).
   → Tab A lands straight back in the game (via the resumed `game:start`); tab B's
   banner clears (via `game:peer` `back`).
4. Repeat but wait past 45 s → tab B gets the forfeit win (`game:over`), and tab
   A on return lands on Home (no active room).

---

## Notes for the executor

- **Order matters:** Task 1 (module) → Task 2 (server wiring, consumes it) → Task 3 (client). Tasks 2 and 3 are independently reviewable.
- **Do not touch the turn clock or realtime path** — the grace branch is gated on `!isRealtimeRoom(rid)`, and `handleLeave` (the forfeit/drop path) is reused unchanged.
- **Resume reuses `game:start`** — no new client rendering path; the existing `game:start` listener already sets `youAreIndex`, `activeRoom`, and clears lobby/invite state.
- **Multi-tab safety** is inherited from `offline()` returning `true` only when the *last* connection drops — the grace branch never runs while another tab is open.
- After server edits, restart `:3001` (plain `node`, no `--watch`).
