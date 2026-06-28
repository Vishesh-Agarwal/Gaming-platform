# 8-Ball Pool — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design); pending implementation plan
**Game type:** turn-based, 2 players, server-authoritative

## Overview

A 2-player Pool game for Playverse. Same proven pattern as Carrom / Tank Duel:
turn-based and server-authoritative. The player submits a shot `{ dx, dy, power, cue? }`,
the server simulates the entire shot to rest inside `applyMove`, records a frame
array of every ball's position, and returns the settled state plus
`lastShot.frames`. The client replays the frames, then renders the authoritative
resting state. Cheat-proof; reuses the existing turn-based contract (rooms,
referee, opt-in turn clock) with no new platform infrastructure.

### Modes (four, all on one physics core)

- **8-Ball (classic)** — streamlined WPA-style: stripes vs solids, clear your
  group then sink the 8 to win.
- **Blitz** — 8-Ball rules plus a per-turn shot clock (reuses the turn-clock infra).
- **9-Ball** — rotation: always contact the lowest-numbered ball first; pot the 9 to win.
- **Practice** — points race: pot any ball for a point, highest score when the
  table clears.

## Architecture

Turn-based, synchronous server simulation (Approach A, the Carrom pattern).
Rejected: a realtime tick sim (pool is turn-based with idle gaps) and client
physics (cheatable).

### Shared physics core (the key structural decision)

Carrom's `carromPhysics.js` already has the solver we need (circle–circle elastic
collisions, friction, rest, pocket capture), but its geometry is hardcoded (square
board, 4 corner pockets). Pool needs a 2:1 table with 6 pockets (4 corner + 2 side).

We extract a **shared, geometry-parameterized solver** and make both games thin
configs that delegate to it:

- `server/src/games/discPhysics.js` — **pure shared solver.**
  `simulateShot(discs, table) -> { frames, finalDiscs, pocketed, firstContact }`.
  `table` carries geometry + tuning: `{ W, H, bounds:{loX,hiX,loY,hiY}, pockets:[{x,y,r}], friction, stopV, restitution, wallRest, maxSteps, frameEvery }`.
  `firstContact` records the id of the first non-cue ball the cue ball strikes
  (needed for pool's wrong-first-contact foul). No game rules here.
- `server/src/games/carromPhysics.js` — **refactored to delegate** to `discPhysics`
  with Carrom's geometry. Its public API (`BOARD`, `POCKETS`, `simulateShot(discs)`)
  is unchanged, so `carrom.js` and all Carrom tests are untouched and verify no
  regression.
- `server/src/games/poolPhysics.js` — pool table geometry + constants; exports
  `TABLE` and `simulateShot(discs)` (delegating to `discPhysics`).
- `server/src/games/pool.js` — rules referee.
- `client/src/games/Pool.jsx` — render, input, replay, HUD, thumbnail.

## Table & coordinates

- Logical space **1000 × 500** (2:1), rendered responsively.
- Constants: `ballR = 13`, `pocketR = 24` (corner) / `22` (side), rail inset `~46`.
- **6 pockets:** 4 at the inset corners + 2 at the midpoints of the long (top/bottom)
  rails.
- **Head string / kitchen:** the cue ball is placed behind the head string (left
  quarter of the table) on the break. The rack sits at the foot spot (right side).
- **Balls:** cue (id 0, white), 1–7 solids, 8 (black), 9–15 stripes. Deterministic
  triangular rack with the 8 in the center, a solid and a stripe in two corners,
  the rest filled deterministically (no RNG → reproducible tests). 9-Ball uses a
  diamond rack of balls 1–9 (1 at front, 9 center). Practice uses the 8-Ball rack.

## Physics — `discPhysics.js`

`simulateShot(discs, table)`:
- Integrator: fixed substeps; per step apply linear friction (`v *= friction`,
  zeroed below `stopV`), advance, resolve circle–circle elastic collisions
  (restitution, equal ball mass) and rail bounces against `bounds`, then capture
  any ball within a pocket's radius.
- Records the id of the first ball the **cue ball** contacts → `firstContact`.
- Records a frame (all live ball positions) every `frameEvery` substeps until rest
  or `maxSteps`; returns frames + settled positions + `pocketed` (`{id}` list) +
  `firstContact`.
- Pure and deterministic.

The cue ball's launch velocity is computed by the rules layer from `{ dx, dy, power }`
(aim vector + power → speed) and passed in as the cue ball's initial velocity.

## Rules referee — `pool.js`

Implements the game-module contract: `createInitialState(options, seatCount)`,
`applyMove(state, seat, move)`, `getResult(state)`, plus (Blitz only)
`turnTimeoutMs(state)` + `onTimeout(state)`.

Move shape: `{ dx, dy, power, cue? }` where `cue: { x, y }` is honored **only** when
the shooter has ball-in-hand (after a foul) or on the break.

### State shape (sketch)
```js
{
  W, H, ballR, pocketR, pockets,
  mode,                 // 'eightball' | 'blitz' | 'nineball' | 'practice'
  balls: [{ id, x, y, group:'solid'|'stripe'|'eight'|'cue'|'num', n? }], // live balls
  cue: { x, y },        // cue ball resting position
  turn,                 // 0 | 1
  groups: { 0:null|'solid'|'stripe', 1:... }, // 8-ball assignment (open until first pot)
  ballInHand,           // true when the shooter may place the cue ball
  onBreak,              // true before the first shot
  scores: [0, 0],       // potted counts (8-ball: own group; practice: any)
  phase: 'playing'|'gameover', winner, draw,
  lastShot: { frames, pocketed, foul, by }, seq,
}
```

### 8-Ball / Blitz (streamlined)
- **Break:** cue ball placed in the kitchen; shooter breaks.
- **Open table** until the shooter's first legal pot of a non-8 ball assigns that
  group to them (opponent gets the other).
- After assignment, the cue ball must **contact a ball of your group first** (or the
  8 only when your group is cleared). Wrong first contact (opponent's group, or the
  8 early) → **foul**.
- Pot one or more of **your** group → **shoot again**; pot nothing → turn passes.
- **Scratch** (cue ball potted) → **foul**.
- Any **foul** → opponent gets **ball-in-hand** (place the cue anywhere) and the turn
  passes. Object balls potted on a foul stay potted (streamlined).
- **Win:** all of your group potted **and** the 8 then legally potted.
- **Loss:** potting the 8 before your group is cleared, or scratching on the shot
  that pots the 8.

### 9-Ball (streamlined)
- No groups. The cue ball must contact the **lowest-numbered ball on the table**
  first; otherwise foul.
- Pot any ball on a legal shot → continue; pot nothing → pass.
- **Win:** legally pot the **9**. Scratch/foul → ball-in-hand; if the 9 dropped on a
  foul it is re-spotted.

### Practice (points race)
- No groups, no fouls beyond scratch. Pot any ball → +1 to the shooter and shoot
  again; pot nothing → pass. Scratch → cue re-spots in the kitchen, turn passes.
- Ends when the table is cleared (cue ball excluded); highest score wins, equal → draw.

### Fouls — first-contact detection
The solver returns `firstContact` (first non-cue ball the cue ball hit, or null for
a total miss). `pool.js` uses it to detect wrong-first-contact (8-Ball group rules,
9-Ball lowest-ball rule) and a no-contact miss.

## Client — `Pool.jsx`

- Canvas table (felt green, wood rails, 6 pockets, head-string line). Renders balls
  from state (numbered, striped/solid styling, cue white, 8 black).
- On a new `lastShot`, replays `lastShot.frames` via `requestAnimationFrame`, then
  settles to authoritative state.
- **Input** (your turn, table at rest): drag from the cue ball to aim (an aim line),
  a power slider, then **Shoot** (emits `{ dx, dy, power }`). When `ballInHand` or
  `onBreak`, the cue ball is draggable (constrained to the kitchen on the break);
  the placement rides along as `cue` in the move.
- **HUD:** turn indicator, your group (or "open table"), balls remaining / score,
  ball-in-hand indicator, foul toast, and the Blitz clock (reuses the `TurnClock`
  pattern).
- Thumbnail export for the lobby grid. Universal emotes + rematch apply via the
  shared `Game.jsx` shell.

## Wiring
- `server/src/games/registry.js`: `register(pool)` (turn-based, 2 players).
- `client/src/games/registry.js`: `pool` entry with the four `modes` + accent +
  thumbnail.
- 2-player → invite flow; the mode picker auto-renders in `InviteModal` from
  `game.modes`. Quick Play defaults to 8-Ball.

## Testing
- `discPhysics.test.js`: head-on momentum transfer, pocket capture (corner + side),
  friction to rest, determinism, `firstContact` reporting.
- `poolPhysics.test.js`: pool geometry pockets capture; delegation sanity.
- `pool.test.js`: rack counts (16 / 9), group assignment on first pot, pot-your-group
  keeps turn, miss passes turn, scratch → ball-in-hand + turn passes, wrong-first-
  contact foul, 8-early loss, 8-ball win, 9-ball lowest-first foul + 9 win, Practice
  scoring + clear, Blitz `turnTimeoutMs`/`onTimeout`.
- Carrom regression: existing Carrom suites must stay green after the `carromPhysics`
  refactor.

## Out of scope (YAGNI)
- Call-shot, push-out, two-foul rule, exact legal-break enforcement, spin/english,
  cushion-count rules.
- More than 2 players. Persistent stats.
