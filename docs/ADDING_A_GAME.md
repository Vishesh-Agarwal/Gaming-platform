# Adding a Game to Playverse

A complete, self-contained guide for building a new game that integrates with this
platform. It assumes **no prior context** — a fresh session or agent can follow it
end to end. Read it top to bottom once, then use the checklist at the end.

> The platform is an "extensibility core": invites, lobbies, rooms, the turn
> referee, the realtime tick loop, presence, chat, in-game emotes, and rematch are
> all generic. **Adding a game = write one server module + one React component +
> two registry lines.** You do not touch the platform plumbing (except for rare,
> noted extension points).

---

## 0. Recommended workflow

Do not start coding immediately. This repo's owner prefers **design before
implementation**, and plans executed **inline** (write test → implement → run →
commit per task), not via per-task reviewer subagents.

1. **Brainstorm** the design (rules, modes, input model, paradigm) and get sign-off.
2. **Write a short spec** → `docs/superpowers/specs/YYYY-MM-DD-<game>-design.md`.
3. **Write a TDD plan** → `docs/superpowers/plans/YYYY-MM-DD-<game>.md`.
4. **Execute inline**: one task at a time, each ending in passing tests + a commit.
5. Branch off `main` (e.g. `git checkout -b <game>`); merge + push only when asked.

See `docs/superpowers/specs/2026-06-27-carrom-design.md` and the matching plan for a
fully worked example (Carrom).

---

## 1. Pick a paradigm

Every game is one of three shapes. Choose by how state authority and timing work:

| Paradigm | Use when | Authority | Examples |
|---|---|---|---|
| **A. Turn-based referee** | Players alternate discrete moves; outcome is a pure function of state + move. | Server is sole truth. | Tic-Tac-Toe, Tank Duel, Ludo, Hangman, **Carrom** |
| **B. Server-authoritative realtime** | Continuous real-time action that must be cheat-proof. | Server runs a tick loop and streams snapshots. | Smash Karts |
| **C. Client relay** | Continuous action where light-weight peer position relay is enough (less cheat-sensitive). | Clients render; server only relays + decides the finish. | Ghost Rider |

A physics game with discrete shots (aim, fire, watch it settle) is **A**, not B —
the server simulates the whole shot synchronously inside `applyMove` and returns
recorded frames for the client to replay. That's how Carrom and Tank Duel work, and
it's the lowest-risk, fully-testable option. **Prefer A unless you truly need a
live tick loop.**

---

## 2. Repository layout

```
server/src/
  games/
    registry.js        <- register your server module here
    <game>.js          <- YOUR server module (rules / sim)
    <game>Physics.js   <- optional: pure helpers (physics, AI) split out for testing
  rooms.js             <- room lifecycle + turn referee (generic; rarely edited)
  realtime.js          <- 30Hz tick loop for paradigm B (generic)
  turnclock.js         <- per-turn timeout scheduler (generic)
  socketHandlers.js    <- socket event wiring (generic)
server/test/
  <game>.test.js       <- YOUR tests (node:test)
client/src/
  games/
    registry.js        <- register your client entry here
    <Game>.jsx         <- YOUR React component (default export) + `Thumbnail` export
  pages/Game.jsx       <- hosts your component + the shared result overlay (generic)
  components/
    InviteModal.jsx    <- 1v1 invite + mode/option pickers (auto-renders from registry)
    LobbyModal.jsx     <- N-player lobby (auto-renders from registry)
  styles.css           <- append your game's styles
```

**Keep modules focused.** Put pure logic (physics, AI, board math) in a separate
`<game>Physics.js` so it's unit-testable without sockets. The rules module imports it.

---

## 3. Paradigm A — Turn-based referee (most common)

### 3.1 The server module contract

`server/src/games/<game>.js` exports a default object. Required fields:

```js
export default {
  id: 'connect4',          // unique string; used everywhere as the game key
  name: 'Connect Four',    // display name
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,           // >2 makes it a LOBBY game (see §6); 2 uses the invite flow
  createInitialState,      // (options, seatCount) => state
  applyMove,               // (state, seat, move) => { state } | { error }
  getResult,               // (state) => { over, winner|null, draw, scores? }
  // optional:
  modes,                   // [{ id, name }] — see §5
  optionsSpec,             // { key: { type:'int', min, max, default, label } } — see §5
  turnTimeoutMs,           // number | (state)=>number|null — per-turn clock; see §3.3
  onTimeout,               // (state) => { state } — auto-resolve a timed-out turn
};
```

#### `createInitialState(options, seatCount)`
- `options` is `undefined` or an object like `{ mode: 'classic', rounds: 3 }`
  (already validated by the platform — see §5). `seatCount` is the player count.
- Return a **plain serializable** state object. Seats are integer indices
  `0..seatCount-1`. Include a `turn` field (whose turn it is). Convention: also keep
  a `seq` counter you bump every move so the client can detect new states.
- **Determinism:** if you need randomness, seed it and store the seed in state
  (see `artillery.js`'s `makeGround`/`seed`). Reproducible state = testable + replayable.
- **Hidden info:** put anything opponents must NOT see under `state.secret`. The
  platform strips `state.secret` before sending state to clients (see `publicRoom`
  in `rooms.js`). Hangman keeps its word there.

#### `applyMove(state, seat, move)`
- `move` is whatever your client sends (a plain object). Validate everything.
- Return `{ error: 'message' }` to reject (turn not yours, illegal move, game over),
  or `{ state: newState }` on success. **Return a new object; treat `state` as
  immutable.**
- Enforce turns yourself: `if (state.turn !== seat) return { error: 'Not your turn.' }`.
- Bump `seq`, set the next `turn`, and record whatever the client needs to animate
  (e.g. Carrom stores `lastShot.frames`, an array of disc positions per substep).

#### `getResult(state)`
- Pure function. Return:
  - In progress: `{ over: false, winner: null, draw: false, scores? }`
  - Win: `{ over: true, winner: <seat>, draw: false, scores? }`
  - Draw: `{ over: true, winner: null, draw: true, scores? }`
- `scores` is optional, an array indexed by seat (`[s0, s1]`). If present, the result
  overlay shows it. For Carrom it's coins pocketed / points.
- **Team games** return a different shape (see §6.3).
- The platform calls `getResult` after every `applyMove`; if `over`, it ends the
  room, fires `game:over`, and registers a rematch offer automatically.

A worked minimal module (Connect Four) is in §7.

### 3.2 The client component contract

`client/src/games/<Game>.jsx` **default-exports** the component and also exports a
`Thumbnail`:

```jsx
export function Thumbnail() { /* small inline SVG for the lobby grid */ }

export default function ConnectFour({ room, youAreIndex, onMove }) {
  const st = room.state;                       // your state (secret stripped)
  const myTurn = st.turn === youAreIndex && room.status === 'playing';
  // render from st; on a legal action call:
  //   onMove({ ...yourMove })   // platform emits game:move and broadcasts new state
}
```

- **Props are exactly `{ room, youAreIndex, onMove }`.** Nothing else.
  - `room` = `{ id, gameId, players:[{index,id,username}], state, status, result, turnEndsAt }`.
  - `youAreIndex` = your seat.
  - `onMove(move)` sends your move to the server (it round-trips and you get the new
    `room` via a re-render — do not optimistically mutate authoritative state).
- The component re-renders whenever new state arrives. Use `room.state.seq` to
  trigger animations of the latest move.
- **You get for free** (rendered by `pages/Game.jsx` around your component):
  the header, the **result overlay**, **in-game emotes**, and **rematch**. Don't
  build those.
- **Turn clock:** if your game declares `turnTimeoutMs`, `room.turnEndsAt` is a
  wall-clock ms deadline you can render as a countdown bar (see `TicTacToe.jsx`'s
  `TurnClock`).

### 3.3 Optional per-turn clock

Declare both:

```js
turnTimeoutMs: 30000,                         // fixed for all states
// OR, for a mode-specific clock:
turnTimeoutMs: (state) => state.mode === 'blitz' ? 20000 : null, // null = no clock
onTimeout(state) { /* auto-resolve the turn */ return { state: next }; },
```

`onTimeout` must pass the turn (and/or make a forced move) so play continues. The
platform arms a single timer per turn (`turnclock.js`); when it fires it calls
`onTimeout`, broadcasts the new state, and re-arms for the next turn.

> The function form of `turnTimeoutMs` is supported by `armTurnDeadline` in
> `rooms.js`. Numeric works too (TTT, Ludo). This is the one place where a
> mode-specific feature touched generic code — already done, reuse it.

---

## 4. Paradigms B and C — realtime games

### 4.1 B. Server-authoritative realtime (tick loop)

Your module exposes a **sim** instead of (or in addition to) `applyMove`. The
presence of `step` makes the room realtime (`isRealtimeRoom` checks
`typeof game.step === 'function'`), and `realtime.js` runs a 30 Hz loop:

```js
export default {
  id, name, type: 'realtime', minPlayers, maxPlayers,
  createInitialState,                 // still required (room.state snapshot)
  createSim(players, now, options),   // => sim object; set sim.over=true when done
  step(sim, inputs, dt, now),         // advance one tick; mutate sim
  snapshot(sim, now),                 // => plain data broadcast each tick (merged with {t:now})
  result(sim),                        // => { over, winner|null, draw, scores? } when sim.over
  dropPlayer(sim, index),             // player left: mark gone; return count of remaining HUMAN players
  // optional: botCount(playerCount, options) and AI inside step (see karts.js)
};
```

- Each tick the server calls `step(sim, room.inputs, dt, now)` then broadcasts
  `snapshot(...)` to all players as the `game:rt:snap` event.
- When `sim.over` becomes true, the platform reads `result(sim)`, fires `game:over`,
  and stops the loop.
- `dropPlayer` returning `< 2` ends the match. **Count only non-bot players** so a
  match doesn't keep ticking after all humans leave (see `karts.js`).

**Client input channel (important extension point):** the client emits
`game:rt:input { roomId, input }` and the server buffers it via `setInput` in
`rooms.js`. **`setInput` currently hard-codes the kart input shape**
(`{ seq, throttle, steer, fire }`). If your realtime game needs different controls,
generalize `setInput` to pass the raw input through (or add your fields) — this is
the one realtime change that requires editing `rooms.js`.

**Client component** for realtime games reads snapshots and sends input via the
socket directly (not `onMove`):

```jsx
import { getSocket } from '../socket.js';
// subscribe: getSocket().on('game:rt:snap', (data) => setSnap(data));
// send:      getSocket().emit('game:rt:input', { roomId: room.id, input });
// remember to remove listeners on unmount.
```

### 4.2 C. Client relay (peer position broadcast)

No server physics. The server only relays position payloads and decides the winner
by who reports finishing first.

- Client sends `game:rt:state { roomId, s }`; the server relays `s` to every other
  player as `game:rt:ghost { from, s }` (N-player safe).
- When a client crosses the finish line it sends `game:rt:finish { roomId }`. The
  **first** to report wins: the server sets `result = { over:true, winner:<seat>,
  draw:false }` and fires `game:over`.
- Server module is minimal: `id, name, type:'realtime', min/maxPlayers,
  createInitialState`. No `step`/`snapshot` (so it is NOT driven by the tick loop).
- See `ghostrider.js` (server) and `GhostRider.jsx` (client).

---

## 5. Modes and options (settings)

Two independent mechanisms, both auto-rendered in the invite/lobby UI:

### Modes (a named ruleset variant)
- **Server module:** `modes: [{ id:'classic', name:'Classic' }, { id:'blitz', name:'Blitz' }]`.
  `createInvite` (in `rooms.js`) validates `options.mode` against this list,
  defaults to `modes[0]`, and passes it through to `createInitialState(options)`.
- **Client registry:** `modes: [{ id, name, hint }]` (hint shown under the picker).
- `InviteModal` auto-renders a mode picker when there are 2+ modes. **No UI code
  needed.** Read `options.mode` in `createInitialState`.

### Numeric options (e.g. "rounds")
- **Server module:** `optionsSpec: { rounds: { type:'int', min:1, max:10, default:3, label:'Rounds' } }`.
  `createInvite` clamps and passes them in `options`.
- **Client registry:** `options: [{ key:'rounds', label:'Rounds', min:1, max:10, default:3 }]`.
  `InviteModal` renders steppers. (See Hangman.)

> Note the asymmetry: server uses `optionsSpec` (object, for validation), client
> registry uses `options` (array, for the stepper UI). Both are needed.

---

## 6. Player count, lobby vs invite, teams, bots

### 6.1 Invite (2 players) vs Lobby (3+)
`pages/Lobby.jsx` routes by `maxPlayers`: `> 2` opens the **LobbyModal** (multiplayer
lobby with ready-up, maps, modes, bots, teams); otherwise it opens **InviteModal**
(invite one friend). Set `maxPlayers` accordingly. **Quick Play** (auto-match an
open public lobby) works for any game via the ⚡ button on the card.

### 6.2 Bots (realtime only, optional)
A realtime module can declare `botCount(playerCount, options)` and append bot
entities in `createSim`, driving them with AI inside `step`. `startLobby` counts
bots toward the minimum so 1 human + bots can start. `dropPlayer` must ignore bots
when counting remaining players. (See `karts.js`.)

### 6.3 Teams (optional)
- Add a `teams` mode in your `modes` list.
- In `createInitialState`, derive a `teams` array (seat → team id) and store it.
- `getResult` for a team game returns the team shape the shared overlay expects:
  ```js
  { over, mode:'teams', winner:<teamId>, teams:[scoreA, scoreB], draw, scores }
  ```
  `winner` is a **team id** (not a seat). The overlay reads `room.state.teams[youAreIndex]`
  to tell each player if their team won. (See `ludo.js` teams branch.)
- Team assignment UI: positional (Ludo, fixed by seat) or manual picker (Karts,
  via `lobby:team`). The LobbyModal renders the manual picker when the client
  registry/lobby marks the game as manual-teams.

---

## 7. Worked example — Connect Four (paradigm A, minimal & complete)

### Server: `server/src/games/connect4.js`
```js
// Connect Four — 2-player, turn-based, server-authoritative.
const COLS = 7, ROWS = 6;

export function createInitialState(/* options, seatCount */) {
  return {
    cols: COLS, rows: ROWS,
    board: Array.from({ length: COLS }, () => []), // board[col] = stack of seat ids (bottom-up)
    turn: 0,
    lastDrop: null,
    seq: 0,
  };
}

function winnerFrom(board, cols, rows) {
  const at = (c, r) => (board[c] && r < board[c].length ? board[c][r] : null);
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const who = at(c, r);
      if (who == null) continue;
      for (const [dc, dr] of dirs) {
        let n = 1;
        while (at(c + dc * n, r + dr * n) === who) n++;
        if (n >= 4) return who;
      }
    }
  }
  return null;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const col = Number(move?.col);
  if (!Number.isInteger(col) || col < 0 || col >= state.cols) return { error: 'Bad column.' };
  if (state.board[col].length >= state.rows) return { error: 'Column is full.' };

  const board = state.board.map((stack) => stack.slice());
  board[col].push(seat);
  return {
    state: {
      ...state,
      board,
      turn: 1 - seat,
      lastDrop: { col, row: board[col].length - 1, by: seat },
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  const w = winnerFrom(state.board, state.cols, state.rows);
  if (w != null) return { over: true, winner: w, draw: false };
  const full = state.board.every((stack) => stack.length >= state.rows);
  if (full) return { over: true, winner: null, draw: true };
  return { over: false, winner: null, draw: false };
}

export default {
  id: 'connect4', name: 'Connect Four', type: 'turn-based',
  minPlayers: 2, maxPlayers: 2,
  createInitialState, applyMove, getResult,
};
```

### Register (server): `server/src/games/registry.js`
```js
import connect4 from './connect4.js';   // with the other imports
// ...
register(connect4);                      // with the other register(...) calls
```

### Test: `server/test/connect4.test.js`
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import c4 from '../src/games/connect4.js';

test('rejects a move out of turn', () => {
  const s = c4.createInitialState();
  assert.ok(c4.applyMove(s, 1, { col: 0 }).error);
});

test('four in a column wins', () => {
  let s = c4.createInitialState();
  // seat 0 drops col 0 four times, seat 1 drops col 1 between
  for (let i = 0; i < 3; i++) {
    s = c4.applyMove(s, 0, { col: 0 }).state;
    s = c4.applyMove(s, 1, { col: 1 }).state;
  }
  s = c4.applyMove(s, 0, { col: 0 }).state;
  const r = c4.getResult(s);
  assert.equal(r.over, true);
  assert.equal(r.winner, 0);
});
```
Run: `cd server && node --test test/connect4.test.js`

### Client component: `client/src/games/ConnectFour.jsx`
```jsx
export function Thumbnail() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <rect x="10" y="14" width="80" height="72" rx="8" fill="#2b5cff" />
      {[0,1,2].map((r) => [0,1,2,3].map((c) => (
        <circle key={`${r}-${c}`} cx={22 + c * 19} cy={30 + r * 22} r="7"
          fill={(r + c) % 2 ? '#ffd23f' : '#ff5d6c'} />
      )))}
    </svg>
  );
}

export default function ConnectFour({ room, youAreIndex, onMove }) {
  const st = room.state;
  const myTurn = st.turn === youAreIndex && room.status === 'playing';
  const colHeight = (c) => st.board[c].length;
  const cellOwner = (c, r) => (r < st.board[c].length ? st.board[c][r] : null);
  const disc = (who) => (who == null ? 'empty' : who === youAreIndex ? 'me' : 'them');

  return (
    <div className="c4">
      <div className="c4-grid" style={{ '--cols': st.cols }}>
        {Array.from({ length: st.cols }, (_, c) => (
          <button key={c} className="c4-col" disabled={!myTurn || colHeight(c) >= st.rows}
            onClick={() => onMove({ col: c })}>
            {Array.from({ length: st.rows }, (_, rTop) => {
              const r = st.rows - 1 - rTop; // render top row first
              return <span key={r} className={`c4-cell ${disc(cellOwner(c, r))}`} />;
            })}
          </button>
        ))}
      </div>
      <p className="c4-turn">{myTurn ? 'Your move' : "Opponent's move"}</p>
    </div>
  );
}
```

### Register (client): `client/src/games/registry.js`
```js
import ConnectFour, { Thumbnail as ConnectFourThumb } from './ConnectFour.jsx';
// add to the `registry` object:
connect4: {
  name: 'Connect Four',
  Component: ConnectFour,
  thumbnail: ConnectFourThumb,
  accent: '#2b5cff',
},
```
(Heavy components — e.g. anything pulling Three.js — should be `lazy()`-loaded;
see how Karts is imported.)

### Styles: append to `client/src/styles.css`
```css
.c4-grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 6px; }
.c4-col { display: flex; flex-direction: column; gap: 6px; background: #2b5cff; border-radius: 8px; padding: 6px; }
.c4-cell { width: 48px; height: 48px; border-radius: 50%; background: #11183a; }
.c4-cell.me { background: #ffd23f; }
.c4-cell.them { background: #ff5d6c; }
```

That's a complete, playable game. The invite flow, turns, win detection, result
overlay, emotes, and rematch all work with zero platform changes.

---

## 8. The result overlay (what `getResult` feeds)

`pages/Game.jsx` renders the end screen from `room.result`:
- `result.winner === youAreIndex` → "You won"; else "You lost"; `result.draw` → draw.
- `result.forfeit` → opponent-left messaging (set by the platform, not you).
- `result.scores` (array by seat) → shown as "Your score / Opponent" (2p) or a
  ranked standings list (3+).
- `result.mode === 'teams'` → team messaging using `room.state.teams` and
  `result.teams`. (See §6.3.)

Return the shape that matches your game and the overlay just works.

---

## 9. Testing, build, run

- **Server tests:** `node --test` from the `server/` directory. Files:
  `server/test/<name>.test.js`, using `import test from 'node:test'` and
  `import assert from 'node:assert/strict'`. Run a single file with
  `node --test test/<name>.test.js`. Keep test output pristine (no warnings).
- **Make logic deterministic** so tests are stable. For physics/AI, put the math in
  a pure `<game>Physics.js` and test it directly; then test the rules module by
  constructing states and asserting transitions.
- **Client build (smoke check):** `npm run build --prefix client` **from the project
  root** (it fails if run from `server/`). There are no client unit tests in this
  repo — verify by building and a manual two-browser playtest.
- **Dev:** `npm run dev` from the root (concurrently runs the `--watch` server on
  **:3001** and Vite on **:5173**). Open http://localhost:5173/.

### Gotchas
- Run **only** `npm run dev`. A stray `npm start` server squatting on **:3001**
  causes "my changes don't show in the browser."
- Build from the **root**, not `server/`.
- Do not rip assets from real games (IP). Author original procedural art / SVG.
- Commit messages end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Commit/branch only when asked; branch off `main` for new work.

---

## 10. Checklist (turn-based game)

- [ ] Brainstormed; spec written to `docs/superpowers/specs/`; sign-off.
- [ ] TDD plan written to `docs/superpowers/plans/`.
- [ ] Branch created off `main`.
- [ ] `server/src/games/<game>.js`: `createInitialState`, `applyMove`, `getResult`,
      default export with `id/name/type/minPlayers/maxPlayers`.
- [ ] (Optional) pure helpers in `server/src/games/<game>Physics.js`.
- [ ] (Optional) `modes` / `optionsSpec` / `turnTimeoutMs` + `onTimeout`.
- [ ] Hidden info (if any) under `state.secret`.
- [ ] `register(<game>)` + import in `server/src/games/registry.js`.
- [ ] `server/test/<game>.test.js` covering: illegal/out-of-turn moves, a win, a
      draw, each mode, any foul/special rule. `node --test` green (whole suite).
- [ ] `client/src/games/<Game>.jsx`: default component (`{room, youAreIndex, onMove}`)
      + `Thumbnail` export.
- [ ] Client registry entry (`name, Component, thumbnail, accent`, plus
      `modes`/`options`/`maxPlayers` as needed). `lazy()` if heavy.
- [ ] Styles appended to `client/src/styles.css`.
- [ ] `npm run build --prefix client` from root succeeds.
- [ ] Manual two-browser playtest (two friended accounts).
- [ ] Commits use the trailer; merge/push only when asked.

### Extra checklist items for realtime (B)
- [ ] `createSim`, `step`, `snapshot`, `result`, `dropPlayer` (count non-bots).
- [ ] Client subscribes to `game:rt:snap` and emits `game:rt:input` via `getSocket()`.
- [ ] If controls differ from karts, generalize `setInput` in `rooms.js`.
- [ ] (Optional) `botCount` + AI in `step`.

### Extra checklist items for relay (C)
- [ ] Minimal server module (no `step`/`snapshot`).
- [ ] Client emits `game:rt:state {roomId, s}`, listens for `game:rt:ghost`,
      and sends `game:rt:finish {roomId}` to win.

---

## 11. Quick reference — platform events (you rarely emit these directly)

| Event (client→server) | Purpose |
|---|---|
| `game:move {roomId, move}` | turn-based move (via the `onMove` prop) |
| `game:rt:input {roomId, input}` | realtime (B) input |
| `game:rt:state {roomId, s}` | relay (C) position broadcast |
| `game:rt:finish {roomId}` | relay (C) report finishing (first wins) |
| `game:emote {roomId, emote}` | in-game reaction (handled for you) |

| Event (server→client) | Purpose |
|---|---|
| `game:start {room, youAreIndex}` | room created; enter the game |
| `game:state {room}` | new authoritative state (turn-based) |
| `game:rt:snap {...}` | per-tick snapshot (realtime B) |
| `game:rt:ghost {from, s}` | a peer's relayed position (relay C) |
| `game:over {room}` | game ended; overlay shows `room.result` |

The component you write only needs the props in §3.2 (turn-based) or `getSocket()`
(realtime/relay). Everything else is plumbing you inherit.
```
