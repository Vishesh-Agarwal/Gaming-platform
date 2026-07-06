# Game visual modernization (all games) — Design

**Date:** 2026-07-06

## Goal

Bring every game's board, pieces, motion, and page backdrop up to the bar set
by the workstream-C games (Pool/Carrom/Karts/GhostRider/TankDuel): material
feel instead of flat gradient panels, believable piece depth, motion on state
changes, and an ambient scene behind the board. CSS-only (layered gradients,
transforms, keyframes) — no binary assets. HUD/glass chips and all game logic
stay untouched.

## Batches

**V1 — classic boards**
- **Connect Four**: glossy blue cabinet — continuous lacquer front panel with
  punched circular holes (radial-gradient wells, zero cell gap), discs with
  glass gloss that drop from above with a gravity-overshoot keyframe.
- **Checkers**: walnut/maple wood squares (layered gradients + grain), wood
  frame, lacquered red-vs-charcoal pieces with ridged rims
  (repeating-conic-gradient), kings read as stacked + crown, settle-in
  animation on placement.
- **Reversi**: club-green felt board with inlaid grid, discs become true 3D
  flippers — `transform-style: preserve-3d`, ivory/charcoal faces on
  `::before`/`::after`, owner class change transitions `rotateY` so captures
  visibly flip.
- **Micro Chess**: cream/walnut squares with soft bevels, glyph pieces get
  carved depth (layered text-shadow), last-move trail styling.

**V2 — lines & letters**
- **Tic-Tac-Toe**: glass slab board, X/O drawn as animated SVG strokes
  (dash-draw), win-line laser sweep.
- **Dots & Boxes**: blueprint/graph-paper surface, line-draw animation on
  claim, box fill pop.
- **Word Duel**: Wordle-style reveal flip on scored rows, keyboard press
  feedback.
- **Boggle**: bevelled 3D letter dice in a wooden tray, tray shake on a new
  board, found-word pop.

**V3 — cards & tables**
- **Uno**: felt table, fanned hand with hover lift, card-play flight, glossier
  faces.
- **Codenames**: card-table felt, paper word cards flipping to team color.
- **Hangman**: chalkboard tiles/keyboard (gallows canvas already strong).

**V4 — ambient backdrops + light passes**
- Shared mechanism: the game page gets a per-game accent glow + vignette
  behind the board (one CSS hook, accent from the registry color).
- Light passes: Battleship (ocean ambience), Skribble, Ludo (already themed).

## Testing

Source-assertion CSS/wiring tests per batch (established pattern), full client
suite + build per game, browser screenshot sweep per batch. Commit per game.
