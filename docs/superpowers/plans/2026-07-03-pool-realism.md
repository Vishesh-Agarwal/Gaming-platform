# Pool Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8-Ball-Pool-grade feel for Pool: physics event timeline (server), lit table render, rolling balls, pocket-sink + cue-strike animations, procedural impact audio.

**Architecture:** One additive server change (`discPhysics.simulateShot` gains an `events` timeline; `pool.js` ships it on `lastShot`). Everything else is client-side inside `Pool.jsx` + two new client modules: pure `poolRoll.js` (roll math, node-testable) and `poolAudio.js` (Web Audio, karts-audio pattern). No rules/outcome changes; Carrom untouched until its own sub-project.

**Tech Stack:** node:test, canvas 2D, Web Audio.

## Global Constraints

- Shot outcomes must be byte-identical before/after (events are additive; never reorder solver math).
- No binary assets — all rendering/audio procedural.
- Respect platform mute: `localStorage.gameSoundMuted === '1'` (toggled live by the Game header Sound button).
- Tests: `npm test --prefix server`, `node --test client/test/`. Commit per task.

## File Structure

- `server/src/games/discPhysics.js` — events in `simulateShot`.
- `server/src/games/pool.js` — `lastShot.events`.
- `client/src/games/poolRoll.js` — NEW: pure roll-angle accumulation from frames.
- `client/src/games/poolAudio.js` — NEW: procedural SFX.
- `client/src/games/Pool.jsx` — table render, rolling balls, sink/strike animations, audio triggers.
- Tests: `server/test/discPhysicsEvents.test.js`, `client/test/poolRoll.test.js`, `client/test/poolRealism.test.js`.

---

### Task 1: Physics event timeline

**Files:** Modify `server/src/games/discPhysics.js`, `server/src/games/pool.js`. Test `server/test/discPhysicsEvents.test.js`.

**Interfaces:** `simulateShot(discs, table)` additionally returns `events: [{ f, type: 'ball'|'rail'|'pocket', id, id2?, speed }]` where `f` indexes `frames`. `pool.js` puts it on `lastShot.events` in all three resolvers + timeout keeps `events: []`.

- [ ] Test: two balls head-on → exactly one `ball` event (no re-report while overlapping); rail bounce → `rail` event with speed>0; pocketed disc → `pocket` event whose `f` is ≤ the first frame not containing the disc; identical inputs → identical events; existing return fields unchanged.
- [ ] Implement: `bounceWalls` returns impact speed (max |v| along flipped axes) or 0; contact throttle via a `Set` of `"i:j"` pair keys cleared when pair separates; `f = Math.floor(step / frameEvery)` at event time (clamped to frames pushed so far); pocket event uses entry speed `hypot(vx,vy)`.
- [ ] `pool.js`: destructure `events` from `simulateShot`, add to every `lastShot` (incl. `events: []` in `onTimeout`).
- [ ] Run `npm test --prefix server` (all suites — Carrom parity must stay green). Commit `"Pool realism: physics event timeline (ball/rail/pocket)"`.

### Task 2: Table render overhaul

**Files:** Modify `Pool.jsx` (`drawTable`/`drawRailInlays`), `client/src/styles.css` if needed. Test `client/test/poolRealism.test.js` (start it here).

- [ ] Test (source assertions): `Pool.jsx` contains `createRadialGradient` in `drawTable` (overhead light), a `drawPocket` helper with an inner shadow gradient, and wood-grain strokes in the rail draw.
- [ ] Implement `drawTable`: felt base `#1a6f4e`→edge-darkened via radial gradient centered slightly above table middle (lamp) + corner vignette; keep cloth pattern + kitchen line, add foot spot dot; rails: wood base `#5a3a20` with along-rail grain strokes (`rgba` darker lines) + a 2px gloss highlight on the inner edge; replace inlay rects with 6+6 brass diamond sights (`fillRect` rotated 45° or small path) at the standard positions; `drawPocket(ctx, p)`: outer leather ring (dark brown), hole `#050707`, inner radial gradient (transparent → rgba black 0.85) for depth.
- [ ] Visual check in browser, then `node --test client/test/`. Commit `"Pool realism: lit felt, wood rails, brass sights, deep pockets"`.

### Task 3: Rolling balls

**Files:** Create `client/src/games/poolRoll.js`; modify `Pool.jsx`. Test `client/test/poolRoll.test.js`.

**Interfaces:** `createRollState()` → object; `advanceRoll(state, frame, ballR)` accumulates per-ball `{ angle, dirX, dirY }` from frame-to-frame displacement (`dAngle = dist / r`); `rollFor(state, id)` → `{ angle, dirX, dirY }` or null. Render: number cap center offset = `sin(angle)` along travel dir scaled by `r*0.6`; cap radius scales with `cos` so it shrinks toward the limb and wraps to the other side (2.5D roll illusion); stripes translate the band the same way.

- [ ] Test: no movement → no roll; moving 2πr in +x → angle ≈ 2π and dir (1,0); direction updates when the ball turns; unknown id → null; state survives balls missing from a frame (potted).
- [ ] Implement `poolRoll.js` (pure, no DOM).
- [ ] Wire into `Pool.jsx`: maintain roll state in a ref, reset on `st.seq` change, `advanceRoll` per replay frame; `drawBall` gains optional `roll` param that offsets cap/stripe as above (static draw when null).
- [ ] Tests + browser check (balls visibly roll during replay). Commit `"Pool realism: balls roll during shot replays"`.

### Task 4: Pocket sink + cue strike animations

**Files:** Modify `Pool.jsx`. Extend `client/test/poolRealism.test.js`.

- [ ] Test: source asserts a `sinkingBalls`/sink-animation path keyed off `pocket` events, and a cue `strike` phase before replay (`setTimeout`/raf ≤ 200ms) with the stick hidden during replay (existing behavior preserved).
- [ ] Implement: on `st.seq` change with frames: play a ~120 ms strike animation first (stick gap animates from pulled-back to contact using the last aim/power — track them in refs captured at fire time; skip when this client didn't shoot), then start the frame replay. During replay, when a `pocket` event's frame is reached, push `{id, from:{x,y}, pocket:{x,y}, start:frameIdx}` into a ref list; for the next 10 frames render that ball easing to the pocket center with scale `1→0` and alpha fade. Nearest pocket = min-distance from the event ball's last known position.
- [ ] Tests + browser check. Commit `"Pool realism: cue strike + pocket sink animations"`.

### Task 5: Procedural audio

**Files:** Create `client/src/games/poolAudio.js`; modify `Pool.jsx`. Extend `client/test/poolRealism.test.js`.

**Interfaces:** `createPoolAudio()` → `{ play(type, intensity01), dispose() }`; types `ball|rail|pocket|cue`. No-op stub when Web Audio unavailable; checks `gameSoundMuted` at each play; lazily `resume()`s the context on play.

- [ ] Test: module exports `createPoolAudio`; source asserts mute check + the four types; intensity clamps to [0,1] via an exported pure `clamp01`.
- [ ] Implement: shared `AudioContext` + master gain; `ball` = 3–8 ms noise burst through a bandpass (freq 1800–3200 Hz by intensity) + tiny sine ping; `rail` = 60 Hz-ish filtered thump; `pocket` = low sine drop (220→90 Hz, 180 ms) + two quiet delayed clicks (rattle); `cue` = short mid tap. Gain scales with intensity.
- [ ] Wire in `Pool.jsx`: create once per mount (ref + dispose on unmount); on fire → `play('cue', power/100)`; during replay, when `frameIdx` crosses an event's `f` → play its type with `speed` normalized (`clamp01(speed / 12)`).
- [ ] Tests + browser listen. Commit `"Pool realism: procedural impact audio"`.

### Task 6: Verification sweep

- [ ] `npm test --prefix server && node --test client/test/` all green; `npx vite build` clean.
- [ ] Browser: full 8-ball game vs another account or practice mode — table look, rolling balls, strike + sink animations, sounds (and mute toggle), both seat orientations, mobile landscape entry.
- [ ] Commit fix-ups.
