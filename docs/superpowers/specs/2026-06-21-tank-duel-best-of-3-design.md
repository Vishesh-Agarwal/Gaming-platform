# Tank Duel — best-of-3 rounds

**Date:** 2026-06-21
**Game:** `artillery` ("Tank Duel"), turn-based, server-authoritative referee.
**Goal:** Turn a single-kill game into a best-of-3 match (first to 2 round wins),
with an auto-advancing between-rounds flow and the round loser firing first.

## Approach

All logic lives in the game module + the existing `game:move` → `game:state`
flow. No new server timers or socket events. A round-over is a frozen state; a
`{ next: true }` move advances to the next round and is idempotent (safe if both
clients send it).

## State (`createInitialState`)

Add: `roundsToWin: 2`, `scores: [0, 0]`, `round: 1`, `phase: 'playing'`,
`starter: 0`, `roundResult: null`. Existing fields (`ground`, `tanks`, `turn`,
`wind`, `lastShot`, `seq`, `maxHp`, `moveBudget`, `blast`, `W`, `H`, `step`) keep
their meaning. Round 1 starts with player 0.

## `applyMove`

- If `phase === 'roundover'`: accept only `{ next: true }` (ignore `turn`) →
  `advanceRound`. Any other move is rejected. (A `{ next: true }` while
  `phase === 'playing'` falls through to the shot path and is rejected as an
  invalid shot — the idempotency guard.)
- Otherwise: the normal drive + shot, crater carving, and blast damage as today.
  Then resolve the round:
  - one tank at 0 HP → `winner = survivor`, `scores[winner]++`.
  - both at 0 HP → draw round (no score change), `roundResult.winner = null`.
  - if any `scores[i] >= roundsToWin` → keep `phase: 'playing'` (let `getResult`
    report the match win); otherwise set `phase: 'roundover'` and
    `roundResult = { winner, scores }`, leaving the board frozen (death visible,
    `lastShot` = the killing shot).
  - no death → normal turn switch.

## `advanceRound(state)`

Returns a fresh round: new `seed` + `ground` (new `makeGround`), tanks reset to
start x positions and full HP, `round + 1`, `phase: 'playing'`, `roundResult:
null`, `lastShot: null`, fresh `wind`, `seq + 1`. Next starter / `turn`:
`roundResult.winner != null ? (1 - winner)` (the loser) else `1 - state.starter`
(alternate on a draw). `starter` updated to that value.

## `getResult`

- `scores[0] >= roundsToWin` → `{ over, winner: 0 }`;
  `scores[1] >= roundsToWin` → winner 1.
- else `{ over: false }`. A single tank death no longer ends the match — rounds
  are managed in `applyMove`.

## Client (`Artillery.jsx`)

- Score pips ("You 1 – 0 Opp") in the FIRE CONTROL header, always shown.
- `phase === 'roundover'` and the kill animation finished → round overlay:
  "ROUND n — You win / Opponent wins / Draw", the score, "next round in 3…" with
  a **Skip** button. Countdown end or Skip → emit `onMove({ next: true })` once
  per client (ref-guarded; server idempotent).
- On `state.round` change → reset local render refs: displayed `ground`,
  displayed HP, local tank x, particles, animation/seq trackers.
- Firing disabled while `roundover`. Match end keeps the platform game-over
  overlay.

## Testing

Server unit checks: kill makes it 1–0 and `getResult.over === false`;
`{ next: true }` advances (fresh terrain, full HP, loser is `turn`); reaching 2
gives `getResult.over` with the right winner; draw round leaves scores unchanged;
`{ next: true }` rejected while `phase === 'playing'`. Client build.

## YAGNI

No per-round timers on the server; no configurable round count (fixed best-of-3).
