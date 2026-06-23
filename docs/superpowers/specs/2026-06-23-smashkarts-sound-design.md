# Smash Karts — Sound (Design)

Date: 2026-06-23
Status: Approved
Sub-project 2 of the Smash Karts "polish" track (1: visual upgrade ✅; remaining: 4-player perf, client prediction).

## Goal

Give Smash Karts a full audio layer — synthesized SFX, a per-kart engine sound,
and a generated music loop — entirely with the Web Audio API. **Asset-free**
(no audio files), client-only, no netcode changes. Matches the neon-arcade
identity established by the visual upgrade.

Chosen approach: **procedural SFX + a procedurally-generated music loop.** No
bundled audio assets, no loader, no licensing.

## Non-goals (YAGNI / deferred)

- No bundled audio files (`.mp3`/`.ogg`) and no asset loader.
- No volume slider — a single mute toggle only (persisted).
- No positional 3D audio (PannerNode/HRTF); simple stereo pan via
  `StereoPannerNode` is enough.
- No per-opponent engine sounds — engine audio is for the local player's kart
  only (keeps the graph small; revisit if desired later).
- No netcode/server changes — all events are derived client-side from the
  existing snapshot stream and local input.

## Browser constraints

- **Autoplay policy:** an `AudioContext` starts `suspended` and must be resumed
  inside a user-gesture handler. The game already has `keydown` and
  `pointerdown` handlers — call `audio.resume()` from them. Music only begins
  after a successful resume.
- All scheduling uses `AudioContext.currentTime` (the audio clock), never
  `setTimeout` for sample-accurate timing — the music scheduler uses a
  lookahead pattern (a coarse `setInterval` that schedules notes ahead on the
  audio clock).

## Architecture / file structure

New module: `client/src/games/karts/audio.js` (sibling of `scene.js`,
`kartModel.js`, `fx.js`). One factory:

`createAudio()` → an `audio` object:
- **Graph:** `ctx` (AudioContext) → `master` (GainNode) → destination.
  `master` feeds two sub-busses: `sfxBus` (GainNode) and `musicBus` (GainNode),
  so music can duck independently of SFX. A shared white-noise buffer is created
  once for noise-based SFX.
- **Lifecycle:**
  - `resume()` — `ctx.resume()` if suspended; on first successful resume, start
    the music scheduler. Idempotent.
  - `setMuted(bool)` / `isMuted()` — sets `master.gain` to 0 / nominal, persists
    to `localStorage['kt-muted']`. Initial state read from localStorage.
  - `dispose()` — stop the engine osc + music scheduler interval, then
    `ctx.close()`.
- **SFX methods** (each builds short-lived nodes that auto-stop; see list below).
- **Engine:** `engineStart()`, `engineUpdate(speed01, audible)`, `engineStop()`.
- **Music:** internal `startMusic()` / `stopMusic()`, plus
  `musicIntensity(level)` (0 = normal, 1 = final-10s layer in) and
  `musicDuck(bool)`.

`Karts.jsx` owns an `audio` instance for the match, wires `resume()` into its
input handlers, drives SFX/engine/music from the render loop, and calls
`audio.dispose()` in cleanup. A mute toggle is added to the DOM HUD.

## SFX catalogue (synthesized)

Each method takes an optional `pan` in [-1, 1] (default 0) routed through a
`StereoPannerNode → sfxBus`. Timbres are arcade/synth, all short:

- `mgFire(pan)` — ~40ms filtered white-noise tick + a tiny square blip.
- `rocketLaunch(pan)` — ~250ms downward frequency sweep (saw) + noise tail.
- `mineDrop(pan)` — low square "thunk" (~120Hz) + a short high beep.
- `explosion(pan)` — noise burst through a lowpass that sweeps down + a sub-sine
  boom (~60Hz) with a fast decay. Used for rocket impacts and kart deaths.
- `pickup(pan)` — 3-note rising arpeggio (square), bright.
- `shieldUp(pan)` — rising shimmer (two detuned saws + slight vibrato), ~400ms.
- `hit()` — short crunch (noise + lowpass) when the local player's HP drops.
- `countdownBeep()` — single mid beep (square); called per countdown tick.
- `go()` — higher, longer beep marking play start.
- `kill()` — bright 2-note up blip when the local player's kill count increases.
- `matchEnd()` — a short descending/!resolving stinger (a few chord tones).

## Engine sound

- `engineStart()` — a sawtooth oscillator → lowpass → a dedicated engine gain →
  `sfxBus`, started once, base frequency low (~50Hz).
- `engineUpdate(speed01, audible)` — `speed01` is the local kart's normalized
  speed (0..1); maps to oscillator frequency (~50→140Hz) and lowpass cutoff;
  `audible` gates the engine gain (0 when dead or not in the play phase) with a
  short ramp to avoid clicks.
- `engineStop()` — ramp gain to 0 and stop the oscillator.
- Normalize speed in `Karts.jsx`: the loop already computes per-kart `speed`
  (interpolated position delta per frame). Clamp `speed / EXPECTED_MAX` to
  [0,1]; `EXPECTED_MAX` is a tuning constant chosen so normal driving sits
  mid-range.

## Music loop

- Synthwave bed via a lookahead scheduler:
  - `nextNoteTime` advances on `ctx.currentTime`; a `setInterval(~25ms)`
    schedules any notes due within a ~100ms lookahead window.
  - Tracks: a bassline (saw through lowpass), an arpeggio (square), a kick
    (sine pitch-drop + noise click), and a hat (short noise burst). A fixed
    tempo (~120 BPM) and a short repeating chord/step pattern (8 or 16 steps).
  - `musicIntensity(1)` adds the arpeggio/hat layer (or raises its gain) for the
    final 10 seconds; `musicIntensity(0)` returns to the base bed.
  - `musicDuck(true)` ramps `musicBus.gain` down (e.g. to ~0.3) so the match-end
    stinger reads; used when the match ends.
- All track gains sit under `musicBus`; muting via `master` silences everything.

## Event wiring (in the `Karts.jsx` render loop / HUD timer)

Derived from state already present; track small `prev*` locals:

- **New projectile appears** (existing new-id branch): by `type` → `mgFire` /
  `rocketLaunch` / `mineDrop`, panned by the projectile's x relative to the
  local kart.
- **Projectile removed** (existing removed-id branch): rocket → `explosion`;
  mg/mine impacts already covered by mine→death/explosion paths (mg removal:
  no sound, to avoid spam). Pan by last x.
- **Kart alive→dead** (existing transition): `explosion`, panned by that kart's
  x. (Pairs with the existing `fx.explode`.)
- **Local weapon null→set** (from the HUD snapshot, `me.weapon`): `pickup`.
- **Local shield false→true** (`me.shield`): `shieldUp`.
- **Local HP decreased** (`me.hp` < previous): `hit`.
- **Local kills increased** (`me.kills` > previous): `kill`.
- **Countdown tick** (`phase==='countdown'`, `countdown` value changed): one
  `countdownBeep` per number; on `countdown` reaching 0 / phase→play: `go`.
- **Phase→over** (first time): `matchEnd` + `musicDuck(true)` + `engineStop`.
- **Final 10 seconds** (`phase==='playing'` && `timeLeft<=10`, once): 
  `musicIntensity(1)`.
- **Engine per frame:** `engineUpdate(speed01, audible)` where `audible =
  phase==='playing' && local kart alive`.
- **First gesture:** input handlers (`kd`, `md`) call `audio.resume()`.

Rate-safety: `mgFire` is the only high-frequency event (~11/s while firing) —
acceptable; each call is a tiny auto-stopping node. No explicit throttle needed,
but the synth must fully release/stop its nodes to avoid graph buildup.

## HUD control

- A small mute toggle button in a corner of the kart HUD (e.g. a 🔊/🔇 glyph),
  reflecting `audio.isMuted()`, calling `audio.setMuted(!muted)` and updating
  React state. Styled to match existing `.kt-*` HUD elements.

## Error handling / robustness

- If `AudioContext` is unavailable (very old browser) or construction throws,
  `createAudio()` returns a no-op stub (all methods present, do nothing) so the
  game runs silently without errors.
- Every SFX node is `stop()`-scheduled and disconnected on `ended` (or via a
  fixed stop time) so the graph doesn't accumulate dead nodes.
- `resume()` swallows rejected promises (autoplay still blocked) and retries on
  the next gesture.
- `dispose()` is safe to call when the context is already closed.

## Testing / verification

Audio can't be meaningfully unit-tested in this harness; verify by:
1. `cd client && npm run build` is clean (chunk-size warning accepted).
2. Manual playtest: sound starts on first input (not before); MG/rocket/mine,
   explosions, pickups, shield, hit, kill, countdown beeps, and match-end
   stinger all fire at the right moments; engine pitch tracks speed; music
   loops, lifts in the final 10s, and ducks at match end; mute toggle silences
   everything and persists across a reload; no console errors on join, play,
   death, leave; leaving closes the AudioContext (no "too many AudioContexts"
   warning after repeated enter/leave).
- Client-only: `git diff main -- server/` stays empty, so combat is untouched.

## Rollout

Feature branch `smashkarts-sound`, subagent-driven per the established workflow,
merged to `main` at the end. Remaining polish after this: 4-player perf, client
prediction.
