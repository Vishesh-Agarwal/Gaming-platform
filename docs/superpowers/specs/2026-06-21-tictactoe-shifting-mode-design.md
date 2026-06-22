# Tic-Tac-Toe — "Shifting" mode + per-invite mode selection

**Date:** 2026-06-21
**Game:** `tictactoe` (turn-based, server-authoritative referee).
**Goal:** Add a second mode — classic Three Men's Morris ("Shifting") — selectable
when inviting a friend, alongside the existing Classic mode.

## Rules module (`server/src/games/tictactoe.js`)

One module, two modes via options.

- `createInitialState(options)` → `{ board: Array(9) null|0|1, turn: 0, mode }`,
  where `mode ∈ {classic, shifting}` (default `classic`).
- Add `modes: [{id:'classic',name:'Classic'},{id:'shifting',name:'Shifting'}]`
  to the module (labels + server-side validation).
- **Shifting** phases are derived from the piece count (no extra state):
  - *Placement* (fewer than 6 pieces down): each player places until they own 3.
    Move shape `{cell}` (same as classic). Reject placing a 4th.
  - *Move* (6 pieces down): slide one of your pieces to a **connected empty**
    cell. Move shape `{from, to}`. Adjacency = classic Three Men's Morris:
    ```
    0:[1,3,4] 1:[0,2,4] 2:[1,5,4]
    3:[0,6,4] 4:[0,1,2,3,5,6,7,8] 5:[2,8,4]
    6:[3,7,4] 7:[6,8,4] 8:[5,7,4]
    ```
- `applyMove` validates turn, phase, ownership, target emptiness, adjacency.
- `getResult`:
  1. Line win (any of the 8 lines all one player) — checked first, so a win in
     the placement phase counts.
  2. Classic: full board → draw.
  3. Shifting: no draw; if the side to move (`state.turn`) has no legal slide in
     the move phase → that side loses (stalemate guard).

## Options plumbing

- `rooms.createInvite(from, to, gameId, options)`: validate `options.mode`
  against `game.modes`; store `invite.options = { mode }`; set the invite's
  display `gameName` to e.g. `"Tic-Tac-Toe · Shifting"`. Games without `modes`
  ignore options.
- `rooms.acceptInvite`: `room.state = game.createInitialState(invite.options)`.
- `socketHandlers` `game:invite`: forward `payload.options` to `createInvite`.
- Client `Home.onInvite(friendId, gameId, options)`: include `options` in the
  `game:invite` emit.
- Client registry `tictactoe`: add `modes` array.
- `InviteModal`: when `game.modes` exists, show a radio toggle (default the first
  mode); pass `{ mode }` to `onInvite`.

## Client UI (`client/src/games/TicTacToe.jsx`)

- Read `mode` from `room.state`; **classic path unchanged**.
- Shifting placement: click an empty cell to place; status shows how many left.
- Shifting move: click your piece to select (highlight it + its valid adjacent
  empty targets); click a target to slide → emit `{from, to}`. Local `selected`
  state clears on every `room.state` update.
- Status line reflects the phase; a small "Shifting" badge appears.
- Duplicate the adjacency map client-side (mirrors server, for target highlights).

## Testing

- Server unit checks: placement→move transition at 6 pieces; adjacency enforced;
  illegal slides (non-adjacent, occupied, not-your-piece, wrong turn) rejected;
  line win in both placement and move phases; stalemate-loss; classic mode
  unaffected (still draws on full board).
- Client production build succeeds.
- Manual playtest by the user.

## YAGNI

No repetition/threefold-draw detection (rare; players can leave). Stays a single
lobby card — mode is chosen at invite time.
