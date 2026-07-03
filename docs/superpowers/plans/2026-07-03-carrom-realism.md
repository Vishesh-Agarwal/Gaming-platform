# Carrom Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carrom-Pool-grade feel: events pass-through, lit grained board, grooved carrom men with edge thickness, pocket sinks, wooden impact audio, pointer-capture guard.

**Architecture:** Mirrors C1. Server: forward the existing `events` from `discPhysics` through `carromPhysics`/`carrom.js`. Client: all inside `Carrom.jsx` + `createCarromAudio()` added to the shared impact-audio module (`poolAudio.js`).

## Global Constraints

- Shot outcomes byte-identical (events additive only).
- No assets; respect `gameSoundMuted`.
- Tests: `npm test --prefix server`, `node --test client/test/`. Commit per task.

## Tasks

### Task 1: Events pass-through (server)
- Test (`server/test/carromEvents.test.js`): `simulateShot` (carromPhysics) returns `events`; pocket events carry `color`; `applyMove` result has `lastShot.events`; determinism.
- Implement: destructure `events` in `carromPhysics.simulateShot`, attach `color: colorById.get(e.id)` to pocket events, return; `carrom.js` adds `events` to both resolve paths' `lastShot` + `events: []` in timeout.
- Full server suite → commit.

### Task 2: Board light + grain + disc render (client)
- Test (`client/test/carromRealism.test.js`): drawBoard has `createRadialGradient` (lamp) + vignette + grain; drawDisc has groove rings + edge rim.
- Implement in `Carrom.jsx`:
  - drawBoard: after the surface fill — plywood grain (wavering horizontal strokes, `rgba(120,80,30,0.05)`), lamp radial gradient (warm white centre → `rgba(60,30,5,0.25)` edges), corner vignette, inner shadow inset ring just inside the frame, pocket depth radial gradient inside each brass ring.
  - drawDisc: body ellipse raised 1px (edge rim: darker full circle 1.5px lower first), then 2 concentric groove circles (`rgba(0,0,0,0.18)` stroke at r*0.72 and r*0.45); striker: ring + 6-point star inlay strokes; keep radial shading.
- Client suite + build → commit.

### Task 3: Pocket sink + audio + capture guard (client)
- Test additions: `sinksRef`/`SINK_FRAMES` in Carrom.jsx; `createCarromAudio` exported from poolAudio.js with wood recipes; Carrom plays `e.type` at frame; try/catch around setPointerCapture.
- Implement:
  - poolAudio.js: refactor internals so recipes are data; add `createCarromAudio()` (ball→"clack": 2600–4200 Hz burst, shorter+louder; rail→frame knock 220 Hz; pocket→drop + wood rattle; cue→flick tap). `createPoolAudio` behavior unchanged.
  - Carrom.jsx: roll-free sink tracker (reuse sink pattern with last-frame positions map), audio on events during replay + flick on fire, capture guard.
- Both suites + build → commit.

### Task 4: Verification sweep
- Suites + build green; 2-tab browser match: board look, coin clacks, sink, no console errors; commit fix-ups.
