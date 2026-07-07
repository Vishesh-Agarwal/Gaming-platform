# Reconnection Grace — Design

**Date:** 2026-07-07

## Goal

Stop a transient disconnect from instantly forfeiting a turn-based game. Today
the moment a player's last socket drops, `socketHandlers.handleLeave` forfeits
the match — so a Wi-Fi blip, a phone locking, a backgrounded tab, or a page
refresh loses the game. Add a grace window during which the player can return
and resume exactly where they were, covering both transient socket drops (React
state survives) and full page reload / browser restart (client state gone).

## Scope

- **In scope:** the 17 turn-based games (server-authoritative discrete state,
  trivial to re-push).
- **Out of scope:** the two realtime games — **Karts** (30 Hz predicted sim +
  Three.js scene) and **Ghost Rider** (client-authoritative relay). They keep
  today's behavior: a disconnect drops the player out and the match continues
  for everyone else. Re-syncing a live sim is a separate, much larger project.
- **Out of scope:** surviving a *server* restart. That needs durable room state
  (the priority-2 "state durability / multi-instance" effort). This feature only
  covers client-side disconnects while the server stays up.

## Decisions (locked)

- **Grace window:** 45 seconds. Configurable via `RECONNECT_GRACE_MS`
  (`config.reconnectGraceMs`, default 45000).
- **Turn clock during grace:** keeps running. Grace only gates the *forfeit* —
  the existing per-turn timeout/auto-play (`turnclock.js`) is untouched. Games
  without a turn clock simply have the opponent wait, at most, the grace window.

## Approach

Two small changes to the socket lifecycle; no new persistence, and both halves
reuse machinery that already exists (`rooms.forfeit` and the `game:start`
client handler).

1. **On last-socket disconnect** (turn-based room only): instead of calling
   `handleLeave` immediately, start a 45 s timer and emit `game:peer` to the
   opponent(s). If the timer expires, run the existing `handleLeave` (→
   `forfeit` → `game:over`). Realtime rooms keep the immediate `handleLeave`.
2. **On (re)connect:** cancel any pending grace timer; if one was pending, emit
   `game:peer {status:'back'}` to the opponent(s). Then, if the user is in a
   *playing* room, re-emit **`game:start`** (with `{ room, youAreIndex }`) —
   the client already renders a game from that event, so one path resumes both a
   transient drop and a full reload. If the user's room exists but is already
   `over`, emit `game:over` instead so they see the result rather than a stale
   board.

## Components

### `server/src/reconnect.js` (new)

Pure timer bookkeeping — no `io`/`rooms` imports, so it unit-tests with an
injected callback.

- `scheduleForfeit(userId, ms, onExpire)` — starts (and replaces any existing)
  timer for `userId`; calls `onExpire()` after `ms`.
- `cancelForfeit(userId) -> boolean` — clears the timer; returns `true` if one
  was pending (i.e. the user was mid-grace).
- `hasPending(userId) -> boolean` — for tests/introspection.

### `server/src/config.js` (modify)

Add `reconnectGraceMs: Number(env.RECONNECT_GRACE_MS) || 45000` to the returned
config object.

### `server/src/socketHandlers.js` (wire)

- **disconnect handler:** after `offline(me.id)` returns `true` (fully offline —
  preserves multi-tab: closing one of two tabs does nothing), branch on the
  user's room:
  - realtime room → `handleLeave(io, me.id)` (unchanged).
  - turn-based room → emit `game:peer` `{ roomId, userId, username, status:'left', graceMs }`
    to the other human players, then
    `scheduleForfeit(me.id, config.reconnectGraceMs, () => handleLeave(io, me.id))`.
  - no room → nothing (as today).
- **connection handler (per connect, incl. reconnect):** after presence setup,
  `if (cancelForfeit(me.id))` emit `game:peer {status:'back'}` to the other human
  players. Then look up the user's room: if `status === 'playing'` emit
  `game:start {room, youAreIndex}`; if `status === 'over'` emit
  `game:over {room}`.

### Client `Game.jsx` + `Home.jsx` (modify)

- `Home.jsx`: add a `socket.on('game:peer', ...)` listener that tracks a
  `peerStatus` (`left` with a countdown / `back` / cleared) and passes it to the
  Game page. The resume path needs **no** client change — `game:start` is
  already handled by the existing listener (it sets `youAreIndex`, `activeRoom`,
  and clears lobby/invite state).
- `Game.jsx`: render a dismissible banner over the board when a peer is `left`
  ("Opponent disconnected — reconnecting… (45s)"), and clear it on `back` or
  when the game ends.

## Data flow

- **Drop:** `disconnect` → `offline()` true → turn-based? → notify opponent
  (`game:peer left`) + `scheduleForfeit`.
- **Return in time:** `connect` → `cancelForfeit` true → notify opponent
  (`game:peer back`) + re-emit `game:start` → client renders the resumed game.
- **Timeout:** 45 s elapse → `handleLeave` → `forfeit` (today's exact path) →
  `game:over` to the opponent.

## Edge cases

- **Multi-tab:** grace only starts on the *last* connection dropping
  (`offline()` already returns `true` only when fully offline).
- **Reconnect after expiry:** already forfeited → `getRoomIdForUser` empty → no
  resume → user lands on Home (game over). Acceptable; an optional
  "you forfeited by disconnecting" toast is a future nicety, not in scope.
- **Game ended while briefly gone** (opponent's auto-play won within grace): on
  reconnect the room is `over` → emit `game:over` so the returning player sees
  the result, not a stale board.
- **Realtime unchanged:** Karts/Ghost Rider disconnect still drops immediately;
  the grace branch is gated on the room being turn-based.

## Testing

- **Unit** (`server/test/reconnect.test.js`): `scheduleForfeit` fires the
  callback after the delay; `cancelForfeit` prevents it and reports whether one
  was pending; re-scheduling replaces the prior timer; separate userIds are
  independent. Use fake/short timers (e.g. a few ms) — no real 45 s waits.
- **Source-assertion** (matches this repo's convention — there is no socket.io
  integration harness): assert `socketHandlers.js` imports and wires
  `scheduleForfeit`/`cancelForfeit`, gates the grace branch on
  `isRealtimeRoom`, and emits `game:start` on resume; assert `Game.jsx` renders
  a `game:peer`-driven banner and `Home.jsx` listens for `game:peer`.
- **Full suite** stays green (`npm test --prefix server`, `node --test client/test/`).
- **Manual** 2-account browser check: start a turn-based game, drop one tab
  mid-game → opponent sees the "disconnected — reconnecting" banner and the turn
  clock keeps running; bring the tab back within 45 s → banner clears and the
  game resumes; let it expire → opponent gets the forfeit win.
