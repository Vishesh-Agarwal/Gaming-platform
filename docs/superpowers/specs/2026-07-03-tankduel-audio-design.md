# Tank Duel Audio (Workstream C, sub-project 5) — Design

**Date:** 2026-07-03

## Goal

Tank Duel's visuals already had a dedicated feel pass (velocity driving, dust,
trajectory animation, crater carving, debris) but it is silent. Add procedural
audio: cannon fire, shell whistle, blast-scaled explosion, a drive rumble that
tracks the tank's speed, and a round-over sting. (Match win/lose sounds already
come from the platform's Game chrome.)

## Design

New `client/src/games/tankDuelAudio.js` — same conventions as the Ghost Rider
module (Web Audio, no assets, no-op stub, `gameSoundMuted`-aware, autoplay-safe,
smooth ramps): `createTankDuelAudio()` → `{ fire, explosion, updateDrive, roundOver, dispose }`.

- **fire(power01)**: deep boom (noise + low tone) + a ~0.8 s descending whistle.
- **explosion(size01)**: layered noise burst + sub thump + short rumble tail,
  gain/size scaled.
- **updateDrive(speed01)**: continuous filtered-noise rumble whose gain/cutoff
  follow drive speed (0 ⇒ silent); called every frame from the render loop.
- **roundOver()**: two-note sting.

Wired in `Artillery.jsx`: fire+whistle when a new shot animation starts (both
players hear it), explosion at the fly→boom transition (scaled by blast),
updateDrive from the drive branch, sting when the round-over countdown starts,
dispose on unmount.

## Testing

Module-contract + wiring source assertions (`client/test/tankDuelAudio.test.js`);
build; two-tab shot in the browser (console-clean).
