# Carrom — Design Spec

**Date:** 2026-06-27
**Status:** Approved (design); pending implementation plan
**Game type:** turn-based, 2 players, server-authoritative

## Overview

A 2-player Carrom board game for Playverse. The server simulates each flick's
full physics synchronously and authoritatively (the Tank Duel / `artillery.js`
pattern): the player submits a move `{ x, angle, power }`, the server runs the
2D rigid-disc simulation to a complete rest, records a frame array of every
disc's position, and returns the settled state plus `lastShot.frames`. The
client replays the frames and then renders the authoritative resting state.
This is cheat-proof (server is the only source of truth) and reuses the existing
turn-based contract (rooms, referee, opt-in turn clock) with no new
infrastructure.

### Modes

Four selectable modes, all built on one physics core:

- **Classic** — full streamlined ruleset, 19 coins (1 Queen + 9 white + 9 black).
- **Points Race** — no color ownership; pocket any coin for points, first to a
  target score wins.
- **Blitz** — Classic rules plus a per-turn shot clock (reuses the turn-clock
  infra); timing out forfeits the turn.
- **Quick** — Classic rules on a trimmed rosette (Queen + 3 white + 3 black = 7
  coins) for short games.

## Architecture

Three modules, mirroring the existing `kartPhysics.js` / `karts.js` split:

- `server/src/games/carromPhysics.js` — **pure physics solver**, no game rules.
- `server/src/games/carrom.js` — **rules referee**: state, modes, turn/foul/queen
  logic, results.
- `client/src/games/Carrom.jsx` — board render, aim-line + power-slider input,
  frame replay, HUD. Exports a `Thumbnail` for the lobby grid.

### Approach decision

Chosen: **turn-based, synchronous server simulation** (Approach A).

Rejected alternatives:
- **Realtime tick sim** (Karts paradigm): wasted infrastructure for a turn-based
  game with long idle gaps; record-and-replay looks identical to the player.
- **Client physics + server relay**: cheatable and non-authoritative.

## Board & coordinates

- Logical space **900×900** (square), rendered responsively.
- Constants: `coinR = 18`, `strikerR = 22`, `pocketR = 30`, border inset `~72`.
- Four pockets at the inset corners.
- Player 0's baseline runs along the bottom edge; Player 1's along the top. Each
  turn the striker is placed on the shooter's own baseline and may slide along it.
- **Opening layout** is deterministic (no RNG → reproducible for tests):
  standard carrom rosette — red Queen dead center, ringed by 6 then 12
  alternating white/black coins (19 total). Quick mode: Queen + 3 white + 3
  black = 7, arranged in a small ring.

## Physics — `carromPhysics.js`

Signature:

```
simulateShot(coins, striker, { x, angle, power })
  -> { frames, finalCoins, pocketed, strikerPocketed }
```

- **Launch:** `power (0..100)` → striker speed; `angle` → direction (P0 shoots
  up-field, P1 down-field). Striker spawns at baseline slot `x`.
- **Integrator:** fixed substeps. Each step: apply linear friction
  (`v *= ~0.985`, zeroed below an epsilon), advance positions, resolve
  circle-circle elastic collisions (restitution ≈ 0.92; striker mass 1.5× a
  coin) and wall bounces off the inner rails.
- **Pocket capture:** any disc whose center falls within `pocketR` of a pocket is
  removed and recorded in `pocketed` (striker → `strikerPocketed`).
- Records a frame (positions of all live discs) every couple of substeps until
  everything rests or a max-step cap is hit; returns the frame array plus settled
  positions.
- **Deterministic**: pure float math, no randomness → unit-testable without
  sockets.

## Rules referee — `carrom.js`

Implements the game-module contract:
`createInitialState(options, seatCount)`, `applyMove(state, seat, move)`,
`getResult(state)`, a round/rematch reset, and (Blitz only)
`turnTimeoutMs` + `onTimeout(state)`.

Move shape: `{ x, angle, power }`.

### Streamlined Classic / Quick / Blitz rules

- **Colors are "open"** until the first coin is pocketed; that pocket claims that
  color for the shooter, and the opponent gets the other color.
- Pocket one or more of **your** coins → **shoot again** (turn stays).
- Pocket **nothing** → turn passes.
- Pocket an **opponent's** coin → it is **returned** to the center spot (nudged
  to the first free position to avoid overlap), and the turn passes.
- **Striker pocketed = foul:** the turn passes and one of your already-pocketed
  coins returns to center (if none yet, nothing is owed).
- **Queen:** pocket the Queen, then **cover** her by pocketing one of your own
  coins on the same or the very next shot. Fail to cover → the Queen returns to
  the center spot.
- **Win:** all 9 of your coins pocketed **and** your Queen is covered by you.

### Points Race rules

- No color ownership, no Queen cover.
- Pocket any coin → shooter scores (regular coin = 1, Queen = 3) and shoots
  again.
- Pocket nothing → turn passes.
- Striker pocketed → −1 point (floored at 0) and the turn passes.
- First to **target (default 7)** wins. If the board empties first, the higher
  score wins; equal scores → draw.

### Blitz

Classic rules plus a per-turn shot clock (`turnTimeoutMs ≈ 20000`) via the
existing turn-clock infra. `onTimeout(state)` forfeits the turn: records an empty
shot and passes the turn to the opponent.

### State shape (sketch)

```js
{
  W, H, coinR, strikerR, pocketR,
  mode,                 // 'classic' | 'points' | 'blitz' | 'quick'
  target,               // points mode only
  coins: [{ id, color: 'white'|'black'|'queen', x, y }], // live coins only
  striker: { x, y },
  turn,                 // 0 | 1
  colors: { 0: null|'white'|'black', 1: null|'white'|'black' },
  scores: [0, 0],
  pocketedByColor: { white: n, black: n },
  queenOnBoard,         // bool
  queenAwaitingCover,   // seat index awaiting cover, or null
  phase,                // 'playing' | 'gameover'
  winner, draw,
  lastShot: { frames, pocketed, foul, by },
  seq,
}
```

## Client — `Carrom.jsx`

- Canvas board: procedural wood texture, four pockets, center rosette ring,
  baselines, aim arrow.
- Renders coins from state. On a new `lastShot`, replays `lastShot.frames` via
  `requestAnimationFrame`, then settles to the authoritative state.
- **Input** (your turn, board at rest): drag the striker along your baseline to
  position it → drag an aim line for direction → adjust a power slider → press
  **Fire** (emits `{ x, angle, power }`).
- **HUD:** turn indicator, your color, coins-left / score, Queen status, foul
  toast, and (Blitz) the shot clock — reuses the `TurnClock` component pattern
  already used by Tic-Tac-Toe.
- Universal emotes and rematch already apply via the shared `Game.jsx` shell.

## Wiring

- `server/src/games/registry.js`: `register(carrom)` (turn-based, min/max 2).
- `client/src/games/registry.js`: `carrom` entry with the four `modes` and an
  accent color + thumbnail.
- As a 2-player game, Carrom uses the **invite flow** (`InviteModal`). The mode
  picker is surfaced in `InviteModal` the same way Hangman surfaces its `rounds`
  option. Quick Play defaults to Classic.

## Testing

`server/test/carromPhysics.test.js`:
- Head-on collision transfers momentum (striker stops, target moves).
- A coin aimed at a pocket is captured.
- Friction brings all discs to rest within the step cap.
- Two identical runs produce identical results (determinism).

`server/test/carrom.test.js`:
- Pocketing your own coin keeps the turn.
- An empty shot passes the turn.
- Striker pocketed: foul returns one of your coins and passes the turn.
- Color is claimed by the shooter on the first pocket; opponent gets the other.
- Queen cover success (win path) vs. failure (Queen returns to center).
- Classic win condition (all your coins + covered Queen).
- Points mode: scoring values and reaching the target ends the game.
- Blitz `onTimeout` forfeits the turn.

## Out of scope (YAGNI)

- Full CarromBoard-Federation officiating (due-coin debts, three-foul penalties,
  last-coin foul, line fouls).
- Spin / english on the striker.
- More than 2 players (4-player doubles).
- Persistent stats / ELO.
