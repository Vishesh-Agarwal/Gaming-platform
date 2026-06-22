# Hangman — 2-player word-setter duel

**Date:** 2026-06-23
**Game:** new `hangman` module, turn-based, server-authoritative referee.
**Goal:** Add Hangman as a 2-player duel: each player secretly sets a word for the
other to guess (one round each); the better guesser wins.

## Rules

- Two rounds. Round 1: setter = P0, guesser = P1. Round 2: roles swap.
- The setter's word is a single A–Z word, 3–12 letters (server-sanitized).
- The guesser guesses one letter per turn; 6 wrong guesses = full gallows.
- Scoring after both rounds (fewest wrong): solve beats not-solve; both solve →
  fewer wrong wins; both fail → more letters revealed wins; exact tie → draw.

## State (`createInitialState`)

```
{
  phase: 'setting' | 'guessing' | 'done',
  round: 1 | 2,
  setter, guesser, turn,        // turn = setter in 'setting', guesser in 'guessing'
  wordLength, revealed[],        // revealed[i] = letter | null  (public mask)
  guessed[], wrong, maxWrong: 6,
  results: [null, null],         // results[guesserIndex] = { solved, wrong, revealedCount, word }
  lastWord, lastResult,          // last finished round, for the reveal banner
  secret,                        // { word } — PRIVATE, stripped before broadcast
  seq,
}
```
Round 1 starts `phase:'setting'`, `setter:0`, `guesser:1`, `turn:0`.

## `applyMove(state, playerIndex, move)`

- `getResult(state).over` → reject.
- `phase === 'setting'`: only `turn` (the setter) acts. `move.word` →
  uppercase, strip non-A–Z; require length 3–12 else error. Set
  `secret = { word }`, `wordLength`, `revealed = Array(len).fill(null)`,
  `guessed = []`, `wrong = 0`, `phase = 'guessing'`, `turn = guesser`. `seq++`.
- `phase === 'guessing'`: only `turn` (the guesser) acts. `move.letter` → single
  A–Z, not already in `guessed` (else error). Append to `guessed`. If the word
  contains it, fill all matching positions in `revealed`; else `wrong++`. Then:
  - solved (no nulls) or `wrong === maxWrong` → round over:
    `results[guesser] = { solved, wrong, revealedCount, word }`,
    `lastWord = word`, `lastResult = { guesser, solved, wrong, word }`,
    `secret = null`.
    - round 1 → round 2 setup: `round = 2`, swap `setter`/`guesser`,
      `phase = 'setting'`, `turn = setter`, reset `wordLength/revealed/guessed/wrong`.
    - round 2 → `phase = 'done'` (getResult will report the match).
  - else stay `guessing` (turn unchanged). `seq++`.

## `getResult`

Over only when `results[0]` and `results[1]` are both set. Winner by the
fewest-wrong rule above (`{ over, winner|null, draw }`); otherwise `over:false`.

## Platform change — private state

`rooms.publicRoom` strips `state.secret` before serializing (destructure it out),
so the secret word never reaches either client over the wire. The server keeps the
full `room.state` (with `secret`) for `applyMove`/`getResult`. The word becomes
public via `lastWord`/`results` at round end. All broadcast paths
(`game:start`, `game:state`, `game:over`) already go through `publicRoom`.

## Client (`client/src/games/Hangman.jsx`) + `Thumbnail`

- Register in client + server registries (new lobby card, no modes).
- `setting`: setter → word `<input>` (3–12 letters) + submit (`onMove({word})`);
  guesser → "Opponent is choosing a word…".
- `guessing`: SVG gallows building across 6 misses; masked word from `revealed`;
  used-letters list; clickable A–Z keyboard + physical key handler for the
  guesser; setter spectates the live progress.
- Round-1 reveal banner (`lastResult`) persists into round 2.
- Match end: platform game-over overlay; component also shows both `results`.

## Testing

Server units: word sanitize/length validation; hit reveals all instances; miss
increments wrong; solve and fail both end the round; role swap into round 2;
`publicRoom` omits `secret` (and keeps `revealed`); scoring branches
(fewer-wrong win, both-fail-by-revealed, exact draw). Client build.

## YAGNI

No whole-word guessing, no dictionary validation of the set word, no timers, no
hints, fixed 6 lives / 2 rounds.
