# Smash Karts FX Realism (Workstream C, sub-project 3) — Design

**Date:** 2026-07-03
**Status:** Targeted pass. The 2026-06-24 realistic-visuals sub-project already delivered PBR daylight (sun/sky/env, shadows, painted karts, no bloom) and explicitly deferred: `fx.js` still additive-neon, square aprons under round pillars, boost-arrow corner clip.

## Goal

Finish the daylight look: particle effects that read as smoke/dust/fire under
sunlight instead of neon glow, and the two deferred cosmetic fixes.

## Design

1. **Daylight particle pass (`fx.js`)** — keep the bounded pooled architecture
   (MAX, recycle, drop-over-budget) and the public API
   (`spark/smoke/dust/muzzle/explode/update/dispose`) exactly; change materials
   and recipes:
   - `NormalBlending` (default) + `depthWrite: false` everywhere; no additive.
   - Dust: neon `#3a3458` → warm road dust `#a89a84`, lower opacity start (0.55).
   - Smoke: `#5c5c60` growing plume, starts ~0.65 opacity.
   - Sparks: small bright `#ffd98a` chips (normal blending, they stay readable
     in daylight because they're brighter than the scene, not because they add).
   - Muzzle: brief pale `#fff3d0` flash, smaller.
   - Explosion: orange `#ff8a3c` fire core burst (short) + `#ffd24a` embers +
     a gray smoke plume (new: 6 rising smoke puffs) + ground dust ring in
     `#8f8574` at low opacity (replaces the neon shockwave color).
   - Per-particle opacity start values (a `fade` recipe field) instead of the
     fixed 1.0.
2. **Round aprons (`scene.js`)** — `addApron` uses `CircleGeometry(f.w/2 + 2)`
   for `kind === 'cyl'` obstacles, box plane otherwise.
3. **Boost arrow clip (`materials.js`)** — inset the painted arrow inside the
   generated texture (scale ~0.72 around center) so the circle cut never clips
   the arrow's corners.

## Out of scope

Physics, netcode, kart models, audio, skid marks (deferred), other games.

## Testing

`fx.js` and `scene.js`/`materials.js` are GL modules (build + manual-gated, per
the June pass convention). Source-assertion tests in `client/test/kartsFxRealism.test.js`
(no AdditiveBlending in fx.js, dust palette not neon, circle aprons for cyl,
arrow inset); `vite build`; browser: bot match on Pillars (round pillars +
combat), observe dust/explosions in daylight.
