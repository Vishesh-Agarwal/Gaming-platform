# Ghost Rider Engine Audio (Workstream C, sub-project 4) — Design

**Date:** 2026-07-03

## Goal

Ghost Rider is the only racer on the platform with no sound. Its market
reference (Hill Climb Racing) is defined by its speed-tracking engine note.
Add a fully procedural audio layer: an engine loop whose pitch/brightness
follow speed and throttle, plus crash, landing, boost-pickup, and finish cues.

## Current state

The night-scene rendering is already strong (parallax ranges, moon, headlight,
suspension, dust/spark particles) — no visual work needed. The game loop has
clean hook points: `car.spd/onGround/crashed`, `input.gas`, `boosting()`,
`grabPickups()`, the crash branch, and the finish branch.

## Design

New `client/src/games/ghostRiderAudio.js` (Web Audio, asset-free, no-op stub
without Web Audio, `gameSoundMuted`-aware like the other game audio modules):

- `createGhostRiderAudio()` → `{ updateEngine, crash, land, pickup, finish, dispose }`.
- **Engine loop**: sawtooth + sub-square oscillators through a lowpass;
  `updateEngine(speed01, throttle, boosting)` each frame ramps pitch
  (~50→150 Hz), filter cutoff, and gain smoothly (`setTargetAtTime`); boost
  raises pitch ~25% and opens the filter. Muted ⇒ engine gain 0.
- **crash()**: noise burst + descending tone. **land(intensity01)**: low thud,
  emitted on air→ground transitions with meaningful fall speed. **pickup()**:
  two-note chime. **finish()**: short 3-note ascend.
- Autoplay-safe (`resume()` inside calls); disposed on unmount.

Wired in `GhostRider.jsx`: create per mount; `updateEngine` in the loop;
events at the existing crash/pickup/landing/finish branches.

## Out of scope

Visual changes, physics, netcode, other games.

## Testing

Source-assertion + module-contract tests (`client/test/ghostRiderAudio.test.js`);
`vite build`; browser: quick match, hear engine pitch track speed (manual).
