# Smash Karts Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full procedural (Web Audio) sound layer to Smash Karts — synthesized SFX, a speed-tracking engine, and a generated synthwave loop — asset-free and client-only.

**Architecture:** A new `client/src/games/karts/audio.js` factory `createAudio()` builds one `AudioContext` (master gain → SFX bus + music bus), exposes SFX methods, engine controls, music controls, and lifecycle (`resume`/`setMuted`/`dispose`). It returns a no-op stub if Web Audio is unavailable. `Karts.jsx` owns one instance per match, resumes it on first input, drives events from the render loop, renders a mute toggle, and disposes on unmount. The module is built in layers: core + SFX first (engine/music as silent placeholders), then wiring, then the real engine, then the real music.

**Tech Stack:** React, Web Audio API (no new dependency).

## Global Constraints

- **Client-only.** Do NOT modify anything under `server/`. The combat sim is untouched.
- **Asset-free.** No audio files, no loader — everything synthesized at runtime.
- **No netcode changes.** All events derive from the existing snapshot stream + local input.
- **Autoplay policy.** The `AudioContext` starts suspended; `audio.resume()` must be called from a user-gesture handler (the existing `keydown`/`pointerdown` handlers). Music starts only after a successful resume.
- **Graceful absence.** If Web Audio is unavailable or the context throws on construction, `createAudio()` returns a stub whose every method is a no-op, so the game runs silently without errors.
- **No dead nodes.** Every SFX/music node is `stop()`-scheduled so the audio graph doesn't accumulate.
- **Mute persists** to `localStorage['kt-muted']`.
- **Test cycle (adapted for audio):** each task ends with `cd client && npm run build` clean (the Three.js chunk-size warning is expected and accepted) + a manual playtest. No unit tests for audio. Run build from the `client/` directory.

---

### Task 1: Audio module core + SFX catalogue

**Files:**
- Create: `client/src/games/karts/audio.js`

**Interfaces:**
- Produces: `createAudio()` → object with:
  - lifecycle: `resume()`, `setMuted(bool)`, `isMuted()`, `dispose()`
  - SFX: `mgFire(pan)`, `rocketLaunch(pan)`, `mineDrop(pan)`, `explosion(pan)`, `pickup(pan)`, `shieldUp(pan)`, `hit()`, `countdownBeep()`, `go()`, `kill()`, `matchEnd()`
  - engine (silent placeholders this task): `engineStart()`, `engineUpdate(speed01, audible)`, `engineStop()`
  - music: `musicDuck(bool)` (real this task); `musicIntensity(level)` and internal `startMusic()`/`stopMusic()` (silent placeholders this task)
  - All `pan` args are in [-1, 1], default 0.

- [ ] **Step 1: Create `client/src/games/karts/audio.js`**

```js
// Smash Karts — procedural audio (Web Audio API). Asset-free: all SFX, the engine,
// and the music loop are synthesized at runtime. Returns a no-op stub when Web Audio
// is unavailable so the game still runs (silently) without errors.

const MUTE_KEY = 'kt-muted';
const noop = () => {};
const STUB = {
  resume: noop, setMuted: noop, isMuted: () => false, dispose: noop,
  mgFire: noop, rocketLaunch: noop, mineDrop: noop, explosion: noop,
  pickup: noop, shieldUp: noop, hit: noop, countdownBeep: noop, go: noop,
  kill: noop, matchEnd: noop,
  engineStart: noop, engineUpdate: noop, engineStop: noop,
  musicIntensity: noop, musicDuck: noop,
};

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return STUB;
  let ctx;
  try { ctx = new AC(); } catch { return STUB; }

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
  const musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);

  let muted = localStorage.getItem(MUTE_KEY) === '1';
  master.gain.value = muted ? 0 : 1;

  // shared 1s white-noise buffer for noise-based SFX
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const now = () => ctx.currentTime;
  const panNode = (pan) => {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    p.connect(sfxBus);
    return p;
  };

  // --- synth helpers (auto-stopping) ---
  const tone = (type, f0, f1, t0, dur, gain, dest) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noise = (t0, dur, gain, dest, cut0, cut1) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(cut0, t0);
    if (cut1) f.frequency.exponentialRampToValueAtTime(Math.max(40, cut1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0); s.stop(t0 + dur + 0.02);
  };

  // --- SFX ---
  const mgFire = (pan) => { const d = panNode(pan), t = now(); noise(t, 0.04, 0.4, d, 2000, 800); tone('square', 220, 180, t, 0.03, 0.15, d); };
  const rocketLaunch = (pan) => { const d = panNode(pan), t = now(); tone('sawtooth', 600, 90, t, 0.25, 0.25, d); noise(t, 0.25, 0.2, d, 1200, 300); };
  const mineDrop = (pan) => { const d = panNode(pan), t = now(); tone('square', 130, 110, t, 0.12, 0.3, d); tone('square', 880, 880, t + 0.08, 0.06, 0.12, d); };
  const explosion = (pan) => { const d = panNode(pan), t = now(); noise(t, 0.5, 0.6, d, 1800, 120); tone('sine', 90, 45, t, 0.45, 0.5, d); };
  const pickup = (pan) => { const d = panNode(pan), t = now(); [523, 659, 784].forEach((f, i) => tone('square', f, f, t + i * 0.06, 0.08, 0.2, d)); };
  const shieldUp = (pan) => { const d = panNode(pan), t = now(); tone('sawtooth', 300, 600, t, 0.4, 0.18, d); tone('sawtooth', 303, 606, t, 0.4, 0.16, d); };
  const hit = () => { const d = panNode(0), t = now(); noise(t, 0.12, 0.4, d, 1000, 200); tone('square', 160, 80, t, 0.1, 0.18, d); };
  const countdownBeep = () => { const d = panNode(0), t = now(); tone('square', 440, 440, t, 0.12, 0.25, d); };
  const go = () => { const d = panNode(0), t = now(); tone('square', 880, 880, t, 0.3, 0.3, d); };
  const kill = () => { const d = panNode(0), t = now(); tone('square', 660, 660, t, 0.08, 0.25, d); tone('square', 990, 990, t + 0.08, 0.14, 0.25, d); };
  const matchEnd = () => { const d = panNode(0), t = now(); [523, 415, 330, 262].forEach((f, i) => tone('sawtooth', f, f, t + i * 0.15, 0.4, 0.25, d)); };

  // --- engine (real implementation added in the engine task) ---
  const engineStart = () => {};
  const engineUpdate = () => {};
  const engineStop = () => {};

  // --- music (scheduler added in the music task) ---
  const startMusic = () => {};
  const stopMusic = () => {};
  const musicIntensity = () => {};
  const musicDuck = (on) => { musicBus.gain.setTargetAtTime(on ? 0.12 : 0.35, now(), 0.1); };

  // --- lifecycle ---
  let musicStarted = false;
  const resume = () => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!musicStarted && ctx.state !== 'closed') { musicStarted = true; startMusic(); }
  };
  const setMuted = (m) => {
    muted = !!m;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    master.gain.setTargetAtTime(muted ? 0 : 1, now(), 0.02);
  };
  const isMuted = () => muted;
  const dispose = () => { try { engineStop(); stopMusic(); ctx.close(); } catch { /* already closed */ } };

  return {
    resume, setMuted, isMuted, dispose,
    mgFire, rocketLaunch, mineDrop, explosion, pickup, shieldUp, hit,
    countdownBeep, go, kill, matchEnd,
    engineStart, engineUpdate, engineStop, musicIntensity, musicDuck,
  };
}
```

- [ ] **Step 2: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted). `audio.js` is unused so far — that's fine; it must compile.

- [ ] **Step 3: Commit**

```bash
git add client/src/games/karts/audio.js
git commit -m "Smash Karts: procedural audio module — core + SFX catalogue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Integrate audio, mute toggle, countdown/match-end wiring

**Files:**
- Modify: `client/src/games/Karts.jsx`
- Modify: `client/src/styles.css` (mute button styling)

**Interfaces:**
- Consumes: `createAudio()` from Task 1.
- Produces: an `audio` instance created in the effect; `resume()` wired to input; `dispose()` in cleanup; a React `muted` state + DOM mute toggle; countdown/go/matchEnd/musicDuck wiring.

- [ ] **Step 1: Import and create the audio instance**

In `client/src/games/Karts.jsx`, add to the imports:

```js
import { createAudio } from './karts/audio.js';
```

In the component body (near the other `useState`), add:

```js
  const [muted, setMuted] = useState(false);
  const audioRef = useRef(null);
```

Inside the main `useEffect`, right after the `fx` is created (`const fx = createFx(scene);`), add:

```js
    const audio = createAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
```

- [ ] **Step 2: Resume audio on first input**

In the input handlers, call `audio.resume()` so audio unlocks on the first gesture. In the `kd` (keydown) handler, after `keys[k] = true; apply();`, add `audio.resume();`. In the `md` (pointerdown) handler, after `keys[' '] = true; apply();`, add `audio.resume();`. The handlers become:

```js
    const kd = (e) => { const k = e.key.toLowerCase(); if (driveKeys.includes(k)) { keys[k] = true; apply(); audio.resume(); e.preventDefault(); } };
    const md = () => { keys[' '] = true; apply(); audio.resume(); };
```

- [ ] **Step 3: Track countdown/phase and wire beeps + match end**

Add prev-state locals near the other render-loop prev trackers (e.g. next to `prevAlive`):

```js
    let prevCountdown = null;
    let prevPhase = null;
```

In the render loop, inside `if (sample && snap) { ... }`, after the per-kart `for (const ks of sample)` block, add a phase/countdown audio block:

```js
        // countdown beeps, GO, and match-end stinger
        if (snap.phase === 'countdown' && snap.countdown !== prevCountdown) {
          if (snap.countdown > 0) audio.countdownBeep();
          prevCountdown = snap.countdown;
        }
        if (snap.phase !== prevPhase) {
          if (prevPhase === 'countdown' && snap.phase === 'playing') audio.go();
          if (snap.phase === 'over') { audio.matchEnd(); audio.musicDuck(true); audio.engineStop(); }
          prevPhase = snap.phase;
        }
```

- [ ] **Step 4: Dispose audio in cleanup**

In the cleanup `return () => { ... }`, before `fx.dispose();`, add:

```js
      audio.dispose();
```

- [ ] **Step 5: Add the mute toggle to the HUD**

In the returned JSX, inside the `kt-hud` overlay div (alongside `kt-timer`/`kt-scores`), add a mute button:

```jsx
          <button
            className="kt-mute"
            onClick={() => { const a = audioRef.current; if (!a) return; const m = !a.isMuted(); a.setMuted(m); setMuted(m); }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
```

- [ ] **Step 6: Style the mute button**

In `client/src/styles.css`, add near the other `.kt-*` rules:

```css
.kt-mute {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(124, 196, 255, 0.35);
  background: rgba(10, 12, 24, 0.6);
  color: #cfe6ff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background var(--dur, 0.15s) var(--ease, ease);
}
.kt-mute:hover { background: rgba(20, 26, 50, 0.85); }
.kt-mute:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 2px; }
```

- [ ] **Step 7: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 8: Manual verify**

In a match: no sound plays until you first press a key/click; then the countdown beeps once per number, a "GO" tone plays at start, and a descending stinger plays when the clock hits 0. The mute button in the top-right toggles 🔊/🔇, silences everything when muted, and stays muted after a page reload.

- [ ] **Step 9: Commit**

```bash
git add client/src/games/Karts.jsx client/src/styles.css
git commit -m "Smash Karts: wire audio instance, mute toggle, countdown + match-end SFX

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Combat SFX wiring (fire, impacts, pickup, shield, hit, kill)

**Files:**
- Modify: `client/src/games/Karts.jsx`

**Interfaces:**
- Consumes: the `audio` instance (Task 2) and its SFX methods (Task 1).
- Produces: combat-event sounds driven from the render loop, panned by x relative to the local kart.

- [ ] **Step 1: Add a pan helper and local-kart x**

In the render loop, inside `if (sample && snap) { ... }`, after the existing camera/local-kart computation (where `me` is found via `sample.find((k) => k.i === youAreIndex)`), add:

```js
        const meX = me ? me.x : null;
        const panFor = (x) => (meX == null ? 0 : Math.max(-1, Math.min(1, (x - meX) / (arena.w / 2))));
```

(If `me` is declared with `const` inside an inner block, hoist `meX`/`panFor` to just after that declaration so they're in scope for the projectile section below. Match the actual structure when editing.)

- [ ] **Step 2: Fire sounds on new projectiles**

In the projectile diff, in the new-projectile branch (where `fx.muzzle(...)` is called), add the matching launch sound. The branch becomes:

```js
          if (!mesh) {
            mesh = makeProj(p.type); scene.add(mesh); projMap.set(p.id, mesh);
            if (p.type !== 'mine') fx.muzzle(p.x, p.z, p.h || 0, p.type === 'rocket' ? '#ff7a3c' : '#fff7b0');
            if (p.type === 'rocket') audio.rocketLaunch(panFor(p.x));
            else if (p.type === 'mine') audio.mineDrop(panFor(p.x));
            else audio.mgFire(panFor(p.x));
          }
```

- [ ] **Step 3: Explosion sound on rocket impact**

In the projectile-removal branch, where `fx.explode(...)` runs for rockets, add the explosion sound. The rocket branch becomes:

```js
            if (mesh.userData.type === 'rocket') { fx.explode(mesh.position.x, mesh.position.z, '#ff7a3c'); audio.explosion(panFor(mesh.position.x)); }
```

- [ ] **Step 4: Explosion sound on kart death**

Where the alive→dead transition calls `fx.explode(...)`, add the death explosion sound:

```js
          if (meta && prevAlive[ks.i] && !meta.alive && !meta.gone) { fx.explode(ks.x, ks.z, colors[ks.i % colors.length]); audio.explosion(panFor(ks.x)); }
```

- [ ] **Step 5: Local-player pickup / shield / hit / kill**

Add prev-state locals near `prevAlive`:

```js
    let prevWeapon = null;
    let prevShield = false;
    let prevHp = 100;
    let prevKills = 0;
```

In the render loop, inside `if (sample && snap) { ... }`, after the phase/countdown block from Task 2, add a local-player event block:

```js
        // local-player feedback sounds
        const meMeta = snap.karts.find((k) => k.i === youAreIndex);
        if (meMeta) {
          if (meMeta.weapon && !prevWeapon) audio.pickup(0);
          prevWeapon = meMeta.weapon;
          if (meMeta.shield && !prevShield) audio.shieldUp(0);
          prevShield = meMeta.shield;
          if (meMeta.hp < prevHp && meMeta.alive) audio.hit();
          prevHp = meMeta.hp;
          if (meMeta.kills > prevKills) audio.kill();
          prevKills = meMeta.kills;
        }
```

- [ ] **Step 6: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 7: Manual verify**

In a match: firing the MG gives a rapid rattle, rockets a launch whoosh, mines a thunk — each panned toward where it happens; rocket hits and kart deaths boom; grabbing a crate plays a rising pickup; a shield activating shimmers; taking damage crunches; scoring a kill plays a bright blip. No audio errors in the console under heavy fire.

- [ ] **Step 8: Commit**

```bash
git add client/src/games/Karts.jsx
git commit -m "Smash Karts: combat SFX — fire, impacts, pickup, shield, hit, kill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Engine sound

**Files:**
- Modify: `client/src/games/karts/audio.js` (replace the engine placeholders with real implementations)
- Modify: `client/src/games/Karts.jsx` (start engine, update per frame)

**Interfaces:**
- Consumes: `ctx`, `sfxBus`, `now` from the module (already in scope).
- Produces: real `engineStart()`, `engineUpdate(speed01, audible)`, `engineStop()`.

- [ ] **Step 1: Replace the engine placeholders in `audio.js`**

In `client/src/games/karts/audio.js`, replace this block:

```js
  // --- engine (real implementation added in the engine task) ---
  const engineStart = () => {};
  const engineUpdate = () => {};
  const engineStop = () => {};
```

with:

```js
  // --- engine: a continuous filtered saw whose pitch/volume track speed ---
  let engineOsc = null, engineFilter = null, engineGain = null;
  const engineStart = () => {
    if (engineOsc) return;
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(sfxBus);
    engineOsc.start();
  };
  const engineUpdate = (speed01, audible) => {
    if (!engineOsc) return;
    const s = Math.max(0, Math.min(1, speed01 || 0));
    engineOsc.frequency.setTargetAtTime(50 + s * 90, now(), 0.05);
    engineFilter.frequency.setTargetAtTime(300 + s * 1200, now(), 0.05);
    engineGain.gain.setTargetAtTime(audible ? (0.05 + s * 0.12) : 0, now(), 0.05);
  };
  const engineStop = () => {
    if (!engineOsc) return;
    try { engineGain.gain.setTargetAtTime(0, now(), 0.05); engineOsc.stop(now() + 0.2); } catch { /* noop */ }
    engineOsc = null; engineFilter = null; engineGain = null;
  };
```

- [ ] **Step 2: Start the engine and define a speed constant in `Karts.jsx`**

After `audioRef.current = audio; setMuted(audio.isMuted());` (Task 2), add:

```js
    audio.engineStart();
    const ENGINE_MAX_SPEED = 0.5; // per-frame interpolated delta at full throttle (tuning)
```

- [ ] **Step 3: Capture the local kart's speed and update the engine each frame**

In the render loop's `for (const ks of sample)` block, after `speed`/`turn` are computed for the kart, capture the local kart's speed by adding (still inside the loop):

```js
          if (ks.i === youAreIndex) localSpeed = speed;
```

Declare `let localSpeed = 0;` just before the `for (const ks of sample)` loop.

After the loop (e.g. right after the phase/countdown block), add:

```js
        const meAlive = !!snap.karts.find((k) => k.i === youAreIndex && k.alive && !k.gone);
        audio.engineUpdate(localSpeed / ENGINE_MAX_SPEED, snap.phase === 'playing' && meAlive);
```

- [ ] **Step 4: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 5: Manual verify**

In a match: a low engine drone is audible while playing; its pitch and brightness rise as your kart speeds up and fall when you slow/stop; it cuts out when you die and during the countdown/over phases; no clicks/pops when it starts or stops.

- [ ] **Step 6: Commit**

```bash
git add client/src/games/karts/audio.js client/src/games/Karts.jsx
git commit -m "Smash Karts: engine sound tracking kart speed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Music loop

**Files:**
- Modify: `client/src/games/karts/audio.js` (replace the music placeholders with the real scheduler)
- Modify: `client/src/games/Karts.jsx` (final-10s intensity)

**Interfaces:**
- Consumes: `ctx`, `musicBus`, `noiseBuf`, `now` from the module.
- Produces: real `startMusic()`, `stopMusic()`, `musicIntensity(level)` (a synthwave bed via a lookahead scheduler). `musicDuck` already exists from Task 1.

- [ ] **Step 1: Replace the music placeholders in `audio.js`**

In `client/src/games/karts/audio.js`, replace this block:

```js
  // --- music (scheduler added in the music task) ---
  const startMusic = () => {};
  const stopMusic = () => {};
  const musicIntensity = () => {};
```

with:

```js
  // --- music: a synthwave bed scheduled on the audio clock (lookahead) ---
  const TEMPO = 120;
  const stepDur = 60 / TEMPO / 2; // eighth notes
  const baseFreq = 110; // A2
  const semis = (n) => baseFreq * Math.pow(2, n / 12);
  const bassPat = [0, 0, 7, 0, 5, 5, 3, 0];
  const arpPat = [12, 16, 19, 24];
  let musicTimer = null;
  let nextNote = 0;
  let step = 0;
  let intensity = 0;

  const schedStep = (time) => {
    const s = step % 8;
    // kick on beats
    if (s % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, time);
      o.frequency.exponentialRampToValueAtTime(50, time + 0.12);
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
      o.connect(g); g.connect(musicBus); o.start(time); o.stop(time + 0.16);
    }
    // bass
    {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = semis(bassPat[s] - 12);
      f.type = 'lowpass'; f.frequency.value = 500;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.18, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + stepDur * 0.9);
      o.connect(f); f.connect(g); g.connect(musicBus); o.start(time); o.stop(time + stepDur);
    }
    // arpeggio + hat only when intensity is up (final 10s)
    if (intensity > 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = semis(arpPat[step % arpPat.length]);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.08, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + stepDur * 0.8);
      o.connect(g); g.connect(musicBus); o.start(time); o.stop(time + stepDur);

      const hs = ctx.createBufferSource(); hs.buffer = noiseBuf;
      const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, time);
      hg.gain.linearRampToValueAtTime(0.06, time + 0.005);
      hg.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      hs.connect(hf); hf.connect(hg); hg.connect(musicBus); hs.start(time); hs.stop(time + 0.06);
    }
    step++;
  };

  const startMusic = () => {
    if (musicTimer) return;
    nextNote = now() + 0.1;
    musicTimer = setInterval(() => {
      while (nextNote < now() + 0.1) { schedStep(nextNote); nextNote += stepDur; }
    }, 25);
  };
  const stopMusic = () => { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } };
  const musicIntensity = (lvl) => { intensity = lvl; };
```

- [ ] **Step 2: Lift intensity in the final 10 seconds (`Karts.jsx`)**

Add a prev-state local near the other prev trackers:

```js
    let intensityOn = false;
```

In the render loop, after the phase/countdown block, add:

```js
        if (!intensityOn && snap.phase === 'playing' && snap.timeLeft <= 10) { audio.musicIntensity(1); intensityOn = true; }
```

- [ ] **Step 3: Build**

Run: `cd client && npm run build`
Expected: build succeeds (chunk-size warning accepted).

- [ ] **Step 4: Manual verify**

In a match: after the first input, a looping synthwave bed (bass + kick) plays under the action; in the final 10 seconds an arpeggio + hi-hat layer comes in, raising the energy; at match end the music ducks so the stinger reads; leaving the match stops the music (no lingering loop, no "too many AudioContexts" warning after several enter/leave cycles).

- [ ] **Step 5: Commit**

```bash
git add client/src/games/karts/audio.js client/src/games/Karts.jsx
git commit -m "Smash Karts: generated synthwave music loop with final-10s intensity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final integration verification

**Files:**
- Modify: none expected (verification + any small fixes).

- [ ] **Step 1: Confirm no server changes**

Run: `git diff --name-only main -- server/`
Expected: empty (client-only; combat untouched).

- [ ] **Step 2: Clean build from scratch**

Run: `cd client && rm -rf dist && npm run build`
Expected: build succeeds; only the accepted chunk-size warning.

- [ ] **Step 3: Full playtest checklist**

In one session confirm: silence until first input; countdown beeps + GO; engine tracks speed and cuts on death; MG/rocket/mine fire sounds (panned); explosions on rocket hits + deaths; pickup/shield/hit/kill sounds; music loops, lifts in final 10s, ducks at match end with the stinger; mute toggle silences all + persists across reload; repeated enter→leave does not leak AudioContexts (no console warning) and `dispose()` closes the context.

- [ ] **Step 4: Update project memory**

Update `~/.claude/projects/-home-vishesh-Documents-AI-challenge-2026-projects-Game-platform/memory/playverse-project-overview.md`: note the Smash Karts sound sub-project is done (procedural Web Audio: SFX catalogue, speed-tracking engine, generated synthwave loop with final-10s intensity + match-end duck, persisted mute, autoplay-safe, `games/karts/audio.js`), and that remaining polish = 4-player perf, client prediction.

- [ ] **Step 5: Commit (only if Step 4 or any fix changed tracked files)**

```bash
git add -A
git commit -m "Smash Karts: finalize sound sub-project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Audio engine (ctx, master, SFX/music busses, resume, setMuted/isMuted, dispose, no-op stub) → Task 1. ✔
- SFX catalogue (mgFire, rocketLaunch, mineDrop, explosion, pickup, shieldUp, hit, countdownBeep, go, kill, matchEnd) → Task 1. ✔
- Mute toggle + persistence → Task 2 (setMuted/localStorage in Task 1; HUD button in Task 2). ✔
- Autoplay resume on first gesture → Task 2. ✔
- Countdown/go/match-end + music duck wiring → Task 2. ✔
- Combat SFX wiring with stereo pan → Task 3. ✔
- Engine sound (start/update/stop + speed normalization + per-frame wiring) → Task 4. ✔
- Music loop (lookahead scheduler, bass/kick/arp/hat, intensity, duck) → Task 5 (musicDuck in Task 1). ✔
- Final-10s intensity → Task 5. ✔
- Robustness (stub fallback, auto-stopping nodes, dispose-safe) → Task 1; verification → Task 6. ✔
- Client-only / no netcode → enforced by Global Constraints; verified Task 6. ✔

**Placeholder scan:** No TBD/TODO; every code step has complete code. The engine/music placeholders in Task 1 are intentional, working no-ops replaced verbatim in Tasks 4–5. ✔

**Type consistency:** `createAudio()` returns exactly the method set consumed in `Karts.jsx`: `resume`, `setMuted`, `isMuted`, `dispose`, the 11 SFX methods, `engineStart`/`engineUpdate`/`engineStop`, `musicIntensity`, `musicDuck`. `engineUpdate(speed01, audible)` and `musicIntensity(level)` signatures match their call sites. `panFor(x)` defined in Task 3 before its uses. Prev-state locals (`prevCountdown`, `prevPhase`, `prevWeapon`, `prevShield`, `prevHp`, `prevKills`, `localSpeed`, `intensityOn`) are each declared once and used consistently. ✔
