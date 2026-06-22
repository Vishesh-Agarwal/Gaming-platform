# Phase 3a — visual level-up: foundation + lobby

**Date:** 2026-06-23
**Direction:** Premium neon arcade. Keep Playverse's tri-neon identity; spend the
boldness on one signature, keep everything else disciplined.

## Tokens (`:root`)

- **Color:** void `#08060F`, surface `#120E1F`, glass `rgba(255,255,255,.04)`,
  border `rgba(255,255,255,.10)`. Neon: violet `#8B5CFF`, cyan `#22E0FF`, magenta
  `#FF4D8D`. Amber `#FFD24A` reserved for wins/scores. Keep gradient tokens.
- **Type:** display → **Chakra Petch** (body Inter, data monospace). Add a type
  scale via vars; tighter letter-spacing on display.
- **Motion:** `--ease: cubic-bezier(.22,.61,.36,1)`, `--dur: .18s`. Respect
  `prefers-reduced-motion` (disable ambient + tilt transitions).
- Shadow/glow helper vars for the neon edge treatment.

## Fonts (`index.html`)

Add Chakra Petch (keep Inter; keep Orbitron loaded for the canvas HUDs until 3b),
graceful system fallback retained.

## Signature

1. **Ambient backdrop** — fixed, behind everything (`body::before/::after`):
   slow-drifting blurred neon blobs + a faint perspective grid that fades out.
   Animation off under reduced-motion.
2. **Arcade-cabinet game cards** — `GameCard.jsx` gains pointer handlers that set
   `--rx/--ry` (cursor-parallax tilt) and `--mx/--my` (a highlight that follows
   the cursor); CSS adds the 3D tilt, a neon edge glow, and a glowing ▶ PLAY pill.
   Reset on pointer leave.

## Components (disciplined polish)

- Buttons: refined gradient + soft neon shadow, crisp press state, `ghost`/`link`
  variants kept.
- Inputs: focus ring with neon glow.
- Modal: entrance animation (fade + scale), via keyframes.
- Brand wordmark: Chakra Petch, gradient + subtle glow.
- Top bar + chat panel: spacing/contrast tidy-up.

## Out of scope (3b)

Game screens (Tic-Tac-Toe / Hangman board polish; canvas HUD alignment for Ghost
Rider / Tank Duel).

## Testing

Client build; verify no regressions in lobby/modal/cards. Manual visual check by
the user.
