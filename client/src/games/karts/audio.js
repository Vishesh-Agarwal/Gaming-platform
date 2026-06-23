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
