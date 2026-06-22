# Phase 2 — let games finish + score-aware end screens (all games)

**Date:** 2026-06-23
**Scope:** Platform `Game.jsx` end overlay + per-game `getResult` scores.
**Goal:** When a match ends, let the final play/animation be seen before the
result pops, and show scores in the result where a game tracks them.

## Changes

### 1. Scores in results
- `artillery.getResult` returns `scores: state.scores` (round wins) alongside
  `over/winner/draw`. (Hangman already returns `scores`.)
- Tic-Tac-Toe and Ghost Rider keep no scores (single-game) — none shown.
- `rooms.makeMove` already sets `room.result = getResult(state)`, and
  `publicRoom` broadcasts `result`, so `room.result.scores` reaches the client.
  Forfeit/Ghost-Rider results simply have no `scores` (handled gracefully).

### 2. `Game.jsx` end overlay
- Becomes a small stateful component: when `room.status === 'over'`, delay the
  overlay ~2s (so the final move/animation is visible), via `useState` +
  `useEffect(setTimeout)`. The header "Back to lobby" button is already available
  during the delay, so the player is never stuck.
- Overlay shows the outcome heading (existing win/lose/draw/forfeit text) plus,
  when `room.result.scores` exists, a score line:
  `Your score: X · <opponent>: Y` (indexed by player index).

## Out of scope (Phase 3)
Visual restyling. This phase is behavior + score display only.

## Testing
- `artillery.getResult` includes `scores` (unit check).
- Client build.
- Manual: end a Tank Duel / Hangman match → final play visible, then overlay
  with scores; end Tic-Tac-Toe → overlay with no score line.
