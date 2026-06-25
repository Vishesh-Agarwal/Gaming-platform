# Ludo — Design Spec

**Date:** 2026-06-25
**Status:** Approved
**Scope:** New turn-based game `ludo` on the Playverse platform.

## Goal

Add Ludo: a 2–4 player, server-authoritative, turn-based board game using the existing
turn-based referee and the N-player lobby. Standard rules; play continues until a full
1st–4th ranking is decided.

## Decisions (locked)

- **Players:** 2–4 (lobby path). Seat→color: 2p = opposite corners; 3p/4p = consecutive corners.
- **Ruleset:** Standard — 6 to leave base; capture sends opponent token(s) home; safe star
  squares (no capture); extra turn on a 6, on a capture, and on bringing a token home; three
  6s in a row voids the turn; no blocking (tokens stack freely).
- **End:** play on for full ranking — over when only one player is left unfinished.
- **Dice:** server rolls (`Math.random`), cheat-proof. Two-step move (roll → choose token).

## Platform fit & the one change

Ludo is a turn-based module implementing the existing contract; `makeMove` already maps
`userId → seat index`, calls `game.applyMove(state, index, move)`, and broadcasts `game:state`
to all players, and `createRoom` builds N-player rooms from the lobby. No referee changes.

**The one platform change:** turn-based `createInitialState(options)` is not told how many
players are seated (all existing turn-based games are 2p). Extend the contract to
`createInitialState(options, seatCount)`:

- `server/src/rooms.js` `createRoom` passes `userIds.length`.
- `server/src/rooms.js` `acceptInvite` passes `room.players.length` (2).

Backward compatible: existing games (`tictactoe`, `artillery`, `hangman`) ignore the 2nd arg.

The lobby card opens a lobby because `maxPlayers > 2` (client registry). Ludo needs no
map/mode/team selectors (those are gated to `karts` in `Lobby.jsx`), so the basic lobby
(members + ready + host Start) applies unchanged.

## Board & coordinate model

Classic 15×15 cross board. The shared main track is a 52-cell loop. Each color has a start
cell on the loop; the four starts are 13 apart: loop indices **0, 13, 26, 39**.

**Token progress (0–57):**
- `0` — in base (not yet entered play).
- `1–51` — on the shared loop, measured from the token's own color start
  (progress 1 = the color's start cell).
- `52–57` — the color's private 6-cell home column; `57` = home/goal (finished).

**Absolute loop cell** of a token at progress `p` (1 ≤ p ≤ 51), color `c`:
`(START[c] + (p − 1)) mod 52`. Used for capture detection and rendering. Home-column cells
(52–57) are private per color — never collide.

**Safe cells (no capture):** the four color start cells (0/13/26/39) and four star cells
(8/21/34/47). On a safe cell, opponent tokens coexist.

**Rendering tables (client):** precomputed maps from loop index 0–51 → `(row,col)` on the
15×15 grid; per-color home-column cells 52–57 → `(row,col)`; per-color base slots (4) →
`(row,col)`; and the center goal. These are static data in the client component module.

## State shape

```
{
  seatCount,                       // 2..4
  colors: [colorId per seat],      // seat -> color (0=red,1=green,2=yellow,3=blue)
  players: [ { color, tokens: [p0,p1,p2,p3] } ],   // one per seat, progress values
  current,                         // seat whose turn it is
  phase: 'roll' | 'move' | 'over',
  dice: null | 1..6,               // the current roll (null in 'roll' phase)
  movable: [tokenIdx, ...],        // tokens playable with `dice` (in 'move' phase)
  sixesInRow,                      // consecutive 6s by `current`
  finishedOrder: [seat, ...],      // seats that have all 4 tokens home, in order
  lastEvent: null | { type:'capture'|'home'|'pass'|'sixes', ... }, // client feedback
}
```

## Rules engine (`server/src/games/ludo.js`)

`createInitialState(options, seatCount)` — builds `players` per `seatCount` with the
seat→color mapping, all tokens at progress 0, `current = 0`, `phase = 'roll'`, `dice = null`,
`sixesInRow = 0`, `finishedOrder = []`.

`applyMove(state, seat, move) -> { state, error }`:
- Reject if `getResult(state).over`, if `seat !== current`, or if the player is already finished.
- **`{action:'roll'}`** (only in `phase:'roll'`):
  - Roll `dice = 1..6`.
  - If `dice === 6`: if `sixesInRow === 2` → **three-sixes void**: `lastEvent={type:'sixes'}`,
    reset `sixesInRow=0`, advance to next active seat, `phase:'roll'`. (No move this turn.)
    Else `sixesInRow += 1`.
  - Compute `movable` = token indices with a legal move for `dice`:
    - base token (progress 0): legal only if `dice === 6` (→ progress 1).
    - token at 1..56: legal if `progress + dice <= 57`.
    - token at 57: never.
  - If `movable` is empty → **auto-pass**: `lastEvent={type:'pass'}`; if `dice !== 6` reset
    `sixesInRow=0`; advance to next active seat, `phase:'roll'`, `dice=null`.
  - Else `phase:'move'`, keep `dice`, set `movable`.
- **`{action:'move', token}`** (only in `phase:'move'`):
  - Reject if `token` not in `movable`.
  - Apply: base token → progress 1; else `progress += dice`.
  - **Capture:** if the token is now on a loop cell (progress 1..51) that is NOT a safe cell,
    send every opponent token sharing that absolute loop cell back to progress 0; set
    `captured = true`, `lastEvent={type:'capture', ...}`.
  - **Home:** if the token reached 57, `reachedHome = true`, `lastEvent={type:'home', ...}`.
    If all 4 of this player's tokens are at 57 and the seat is not yet in `finishedOrder`,
    push the seat to `finishedOrder`.
  - **Extra turn** = `dice === 6 || captured || reachedHome`.
    - If extra turn: `phase:'roll'`, `dice=null`, `movable=[]`, same `current`. (`sixesInRow`
      stays as incremented for a 6; reset to 0 if the extra turn came only from capture/home.)
    - Else: reset `sixesInRow=0`, advance to next active seat, `phase:'roll'`, `dice=null`.
- **`advance to next active seat`**: step `current` forward (mod `seatCount`), skipping seats
  already in `finishedOrder`. If only one active seat remains, the game is over (see result).

`getResult(state) -> { over, winner, draw, ranking, scores }`:
- `scores` = per-seat count of tokens at 57 (always present, for live standings).
- `over` = `finishedOrder.length >= seatCount - 1`.
- When over: `ranking = [...finishedOrder, theOneRemainingUnfinishedSeat]` (if all finished,
  ranking is just `finishedOrder`). `winner = ranking[0]`. `draw = false`.
- When not over: `{ over:false, winner:null, draw:false, scores }`.

## Client (`client/src/games/Ludo.jsx`)

- Renders the 15×15 cross board from the static coordinate tables: four colored corner bases
  (with 4 token slots each), the cross track with marked safe/star cells, the four home
  columns, and the center goal triangle.
- Tokens drawn at their mapped cells from `room.state.players`. Stacked tokens fan slightly.
- Controls: when it's your seat (`youAreIndex === state.current`):
  - `phase:'roll'` → a **Roll** button → emits `{action:'roll'}`.
  - `phase:'move'` → the `movable` tokens are highlighted/clickable → emits
    `{action:'move', token}`.
- Shows the dice face, current player indicator (colored), and a live standings list
  (tokens-home per player). A brief toast/flash for `lastEvent` (capture/home/void).
- `Thumbnail` export for the lobby grid (a small static Ludo cross).
- Registered in `client/src/games/registry.js` (name "Ludo", an accent color, `maxPlayers: 4`).

## Testing

Server `node --test` (`npm test --prefix server`) — rules tested by injecting the dice
(refactor the roll so tests can force a value; e.g. an internal `rollDice` indirection the
test can monkeypatch, or accept `move.debugDice` only in test — choose the cleaner: an
exported pure helper `applyRoll(state, dice)` that `applyMove` calls with a real roll, so
tests call `applyRoll` directly):

- leaving base requires a 6; non-6 with all tokens in base auto-passes.
- normal advance by dice; overshoot past 57 is not a legal move.
- exact roll finishes a token (progress 57).
- capture: landing on an opponent on a non-safe cell sends it to base; landing on a safe cell
  does not.
- extra turn granted on 6 / capture / home; turn passes otherwise.
- three consecutive 6s voids the turn and passes.
- turn rotation skips finished seats.
- `getResult` ranking correct for 2p, 3p, 4p (finishedOrder + last remaining).
- platform: `createRoom` passes seatCount so a 4-seat Ludo state has 4 players; `acceptInvite`
  still works for 2p games (regression).

Client verified by `npm run build --prefix client`.

## Out of scope

- AI / bot fill for empty seats.
- Reconnection (disconnect = forfeit/ends room, platform v1).
- Seeded/deterministic production RNG; elaborate animations.
- Blocking, doubling, or house-rule variants beyond the Standard set above.
