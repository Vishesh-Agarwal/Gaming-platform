# Carrom Realism (Workstream C, sub-project 2) — Design

**Date:** 2026-07-03
**Status:** Proceeding on the approved C ordering; reuses the C1 (Pool) machinery.

## Goal

Make Carrom look and sound like its market reference (Carrom Pool: Disc Game):
a lit plywood board with visible grain, coins that read as real carrom men
(grooved rings, edge thickness), satisfying pocket drops, and wooden impact
sounds — without touching rules or shot outcomes.

## Current state

- Server: `carrom.js` (rules) → `carromPhysics.js` (geometry config) → shared
  `discPhysics.js`, which **already produces the `events` timeline** (C1) —
  Carrom's wrapper just drops it.
- Client: `Carrom.jsx` — good authentic markings (double baselines, rings,
  arrows, medallion) from the June pass, but a flat unlit surface, flat discs,
  instant disappearance on pot, no audio. Same `setPointerCapture` crash-path
  Pool had.

## Design

1. **Events pass-through (server):** `carromPhysics.simulateShot` forwards
   `events` from the shared solver (color attached for pocket events);
   `carrom.js` ships `lastShot.events` (+ `events: []` on timeout). Outcomes
   byte-identical.
2. **Board light + grain (client):** lamp gradient + corner vignette over the
   playing surface (same treatment as Pool's felt, warm-toned), subtle plywood
   grain strokes, inner shadow ring around the frame edge, pocket depth
   gradient inside the brass rings. Markings unchanged.
3. **Carrom-men render (client):** coins get concentric groove rings and an
   edge-thickness rim (a darker under-ellipse offset down-right, body drawn
   slightly up-left) so they read as wooden discs, not balls; the striker gets
   a star/ring inlay. Queen keeps red with grooves.
4. **Pocket sink (client):** reuse the C1 pattern — on a `pocket` event the
   coin eases into the pocket, shrinking/fading over ~10 frames.
5. **Wood-impact audio (client):** extend `poolAudio.js` (it becomes the shared
   impact-audio module) with `createCarromAudio()` — same primitives, wood-tuned
   recipes: sharp "clack" (brighter/harder than pool), frame knock, pocket drop.
   Same mute behavior. Carrom.jsx plays events at their replay frame + a flick
   tap on fire.
6. **Robustness:** guard `setPointerCapture` in Carrom.jsx like Pool.

## Out of scope

Rules/physics outcomes, prediction, striker strike animation (the pull band
already provides the launch visual), landscape mode (workstream D).

## Testing

Server: events-in-lastShot test; existing carrom suites stay green.
Client: source-assertion tests (board light, grooved discs, sink, audio wiring)
+ carromAudio contract via `poolAudio.js` exports; browser 2-tab verification.
