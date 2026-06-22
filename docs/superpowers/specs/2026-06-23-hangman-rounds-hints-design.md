# Hangman — hints, scored rounds, and a loss explosion (Phase 1)

**Date:** 2026-06-23
**Game:** `hangman`. Builds on the word-setter duel.
**Goal:** Per-word hints, configurable scored rounds (1–10, chosen at invite),
a scoreboard between rounds + final standings, and an exploding gallows on a miss.

## Round / leg structure

- A **round = two legs**: leg 0 (setter P0 → guesser P1), leg 1 (setter P1 →
  guesser P0). Each player guesses once per round.
- **N rounds** (1–10), chosen by the inviter. Highest cumulative score wins;
  equal = draw.
- **Scoring** per leg: solve → `10 − wrong`; miss → 0. Added to the guesser's total.

## State (`createInitialState(options)`)

```
{
  totalRounds,                 // clamp(options.rounds ?? 3, 1, 10)
  round: 1, leg: 0,
  phase: 'setting'|'guessing'|'legover'|'roundover'|'done',
  setter: 0, guesser: 1, turn: 0,
  maxWrong: 6,
  hint: null,                  // public (shown to guesser)
  wordLength: 0, revealed: [], guessed: [], wrong: 0,
  secret: null,                // { word } — stripped by publicRoom
  scores: [0,0],
  roundPoints: [0,0],          // points this round (reset each round)
  legResult: null,             // { guesser, solved, wrong, word, points }
  history: [],                 // [{ round, points:[a,b], totals:[A,B] }]
  seq: 0,
}
```

## `applyMove`

- `getResult.over` → reject.
- `phase 'setting'` (turn = setter): `move = { word, hint }`. word → upper, A–Z,
  3–12; hint → trim, 1–60 chars. Set `secret={word}`, `hint`, reset board, →
  `guessing`, turn = guesser.
- `phase 'guessing'` (turn = guesser): `move = { letter }`, single A–Z, not
  repeated. Hit reveals all instances; miss `wrong++`. On solve or `wrong===6`:
  points = solved ? max(0, 10 − wrong) : 0; `scores[guesser] += points`;
  `roundPoints[guesser] = points`; `legResult = {...}`; `secret=null`; keep the
  board frozen; → `legover`.
- `phase 'legover'` (`{next:true}`, either player, idempotent): leg 0 → leg 1
  (`setting`, setter P1, reset board); leg 1 → push `history`, then
  `round < totalRounds ? 'roundover' : 'done'`.
- `phase 'roundover'` (`{next:true}`): round++, leg 0, setter P0, `roundPoints=[0,0]`,
  reset board, → `setting`.

## `getResult`

`phase !== 'done'` → `{ over:false }`. Else compare `scores`: higher wins, equal =
draw. Returns `{ over, winner|null, draw, scores }` (scores included for the end
screen / Phase 2).

## Invite options (generalized)

- A game module may declare `optionsSpec`, e.g. Hangman:
  `optionsSpec: { rounds: { type:'int', min:1, max:10, default:3, label:'Rounds' } }`.
- `rooms.createInvite` builds a sanitized `options` object: validated `mode`
  (existing) **plus** each `optionsSpec` int (parsed, clamped, default). Invite
  display name appends labels, e.g. "Hangman · 3 rounds".
- `createInitialState(options)` reads `options.rounds`.
- Client registry mirrors a UI descriptor (`options: [{ key:'rounds', label, min,
  max, default }]`); `InviteModal` renders a stepper and includes the value in
  `onInvite(friendId, gameId, { ...mode, rounds })`.

## Client (`Hangman.jsx`)

- **setting**: setter form = word input + **hint input**; guesser waits.
- **guessing**: show the **hint**; gallows; masked word; A–Z keyboard (+ keys).
- **legover**: frozen board; reveal word; result line ("You solved WORD +8").
  On a miss the gallows **explodes** (canvas/particle burst overlay) then reveals.
  Auto-advance (~2.5s) + Skip → `{next:true}`.
- **roundover**: scoreboard — this round's points, running totals, mini history;
  **Continue** → `{next:true}`.
- **done**: final standings + winner (plus platform overlay).
- Score chips ("You X · Bob Y") visible during play.

## Testing

Server units: rounds clamp from options; leg/round progression through all phases;
scoring (solve = 10−wrong, miss = 0, totals); hint + word validation; `secret`
stays server-side; winner-by-total and draw; `{next:true}` gated by phase. Client
build.

## YAGNI

No per-leg timers, no hint reveal penalty, no whole-word guessing, fixed 6 lives.
