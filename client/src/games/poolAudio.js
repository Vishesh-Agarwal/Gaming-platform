// Procedural pool SFX (Web Audio, asset-free) — same pattern as the Karts
// audio module. createPoolAudio() returns { play(type, intensity01), dispose };
// a no-op stub when Web Audio is unavailable. Respects the platform mute flag
// (localStorage gameSoundMuted, toggled by the Game header Sound button).

export function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function muted() {
  try { return window.localStorage?.getItem('gameSoundMuted') === '1'; } catch { return false; }
}

export function createPoolAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return { play() {}, dispose() {} };
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Short filtered noise burst — the "click" body of ball/rail impacts.
  const noiseBurst = (dur, freq, q, gain, when = 0) => {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(master);
    src.start(ctx.currentTime + when);
  };

  // Decaying tone — thunks and pings.
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

  const play = (type, intensity = 0.5) => {
    if (muted()) return;
    const k = clamp01(intensity);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (type === 'ball') {
      noiseBurst(0.006 + 0.006 * k, 1800 + 1400 * k, 1.2, 0.25 + 0.55 * k);
      tone(2400 + 800 * k, 1800, 0.03, 0.06 + 0.1 * k, 'triangle');
    } else if (type === 'rail') {
      noiseBurst(0.02, 420, 0.9, 0.18 + 0.35 * k);
      tone(150 + 60 * k, 90, 0.08, 0.12 + 0.18 * k);
    } else if (type === 'pocket') {
      tone(220, 90, 0.18, 0.3 + 0.2 * k);
      noiseBurst(0.03, 900, 1.5, 0.12, 0.1);
      noiseBurst(0.02, 700, 1.5, 0.08, 0.19);
    } else if (type === 'cue') {
      noiseBurst(0.008, 1200 + 800 * k, 1.4, 0.2 + 0.4 * k);
    }
  };

  return {
    play,
    dispose() { ctx.close().catch(() => {}); },
  };
}
