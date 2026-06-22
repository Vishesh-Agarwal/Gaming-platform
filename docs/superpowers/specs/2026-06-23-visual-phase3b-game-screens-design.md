# Phase 3b — visual level-up: game screens

**Date:** 2026-06-23
**Direction:** Carry the premium-neon pass into the four game screens.

## Tic-Tac-Toe (most impact)

- Refined board: glassier cells, accent hover already present — add depth + a
  subtle inner glow.
- **Animated marks:** X/O pop/draw in when placed (CSS keyframe; the mark span is
  keyed by cell+value so it animates on appearance, including shifting-mode moves).
- **Win line:** compute the winning line client-side from `board` + `result.winner`
  and give those cells a pulsing accent glow when the game is over.
- Player marks colored by index (X cyan/violet, O pink).

## Hangman / Tank Duel / Ghost Rider

- These already pick up the new `--display` font (Chakra Petch) and tokens via
  CSS. Align the **canvas HUD font strings** (currently `'Orbitron'`) to
  `'Chakra Petch'` in `GhostRider.jsx` and `Artillery.jsx` for consistency.
- Minor token alignment touch-ups only; no structural changes to canvas games.

## Testing

Client build; manual visual check (place marks, trigger a win line, glance at the
canvas HUDs).
