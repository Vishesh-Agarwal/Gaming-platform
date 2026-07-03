// Ghost Rider audio — fully procedural Web Audio (no assets), Hill-Climb style:
// a continuous engine loop whose pitch and brightness track speed/throttle,
// plus crash / landing / boost-pickup / finish cues. Returns a no-op stub when
// Web Audio is unavailable; respects the platform mute flag every frame.

function muted() {
  try { return window.localStorage?.getItem('gameSoundMuted') === '1'; } catch { return false; }
}

const STUB = {
  updateEngine() {}, crash() {}, land() {}, pickup() {}, finish() {}, dispose() {},
};

export function createGhostRiderAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return STUB;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.4;
  master.connect(ctx.destination);

  // ---- engine loop: saw + sub-square through a lowpass -------------------
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 1.5;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 55;
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = 27.5;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  saw.connect(lp);
  sub.connect(subGain).connect(lp);
  lp.connect(engineGain).connect(master);
  saw.start();
  sub.start();

  const resume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };

  // Smoothly track speed (0..1), throttle, and boost each frame.
  const updateEngine = (speed01, throttle, boosting) => {
    resume();
    const t = ctx.currentTime;
    if (muted()) { engineGain.gain.setTargetAtTime(0, t, 0.05); return; }
    const s = Math.max(0, Math.min(1, speed01));
    const boost = boosting ? 1.25 : 1;
    const f = (50 + s * 95 + (throttle ? 12 : 0)) * boost;
    saw.frequency.setTargetAtTime(f, t, 0.06);
    sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    lp.frequency.setTargetAtTime((550 + s * 1500 + (throttle ? 350 : 0)) * boost, t, 0.08);
    engineGain.gain.setTargetAtTime(0.07 + s * 0.09 + (throttle ? 0.05 : 0), t, 0.09);
  };

  // ---- one-shot cues ------------------------------------------------------
  const noise = (dur, freq, q, gain, when = 0) => {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const srcN = ctx.createBufferSource();
    srcN.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    srcN.connect(bp).connect(g).connect(master);
    srcN.start(ctx.currentTime + when);
  };
  const tone = (freq, endFreq, dur, gain, type = 'sine', when = 0) => {
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  const cue = (fn) => (...args) => { if (!muted()) { resume(); fn(...args); } };

  return {
    updateEngine,
    crash: cue(() => {
      noise(0.14, 900, 0.8, 0.5);
      tone(320, 70, 0.4, 0.3, 'sawtooth');
    }),
    land: cue((intensity = 0.5) => {
      const k = Math.max(0, Math.min(1, intensity));
      noise(0.03, 300, 1, 0.15 + 0.25 * k);
      tone(120, 60, 0.09, 0.1 + 0.2 * k);
    }),
    pickup: cue(() => {
      tone(660, 660, 0.08, 0.18, 'triangle');
      tone(990, 990, 0.1, 0.16, 'triangle', 0.07);
    }),
    finish: cue(() => {
      tone(523, 523, 0.12, 0.2, 'triangle');
      tone(659, 659, 0.12, 0.2, 'triangle', 0.11);
      tone(784, 784, 0.2, 0.22, 'triangle', 0.22);
    }),
    dispose() {
      try { saw.stop(); sub.stop(); } catch { /* already stopped */ }
      ctx.close().catch(() => {});
    },
  };
}
