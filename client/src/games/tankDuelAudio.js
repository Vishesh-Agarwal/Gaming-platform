// Tank Duel audio — fully procedural Web Audio (no assets): cannon fire with a
// descending shell whistle, blast-scaled explosions, a drive rumble that tracks
// tank speed, and a round-over sting. No-op stub without Web Audio; respects
// the platform mute flag (localStorage gameSoundMuted) on every call/frame.

function muted() {
  try { return window.localStorage?.getItem('gameSoundMuted') === '1'; } catch { return false; }
}

const STUB = { fire() {}, explosion() {}, updateDrive() {}, roundOver() {}, dispose() {} };

export function createTankDuelAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return STUB;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);
  const resume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };

  const noise = (dur, freq, q, gain, when = 0, type = 'bandpass') => {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const srcN = ctx.createBufferSource();
    srcN.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    srcN.connect(f).connect(g).connect(master);
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

  // continuous drive rumble: lowpassed noise loop, gain follows speed
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0;
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = 140;
  const rumbleLen = ctx.sampleRate;
  const rumbleBuf = ctx.createBuffer(1, rumbleLen, ctx.sampleRate);
  const rd = rumbleBuf.getChannelData(0);
  for (let i = 0; i < rumbleLen; i++) rd[i] = Math.random() * 2 - 1;
  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;
  rumbleSrc.loop = true;
  rumbleSrc.connect(rumbleLp).connect(rumbleGain).connect(master);
  rumbleSrc.start();

  return {
    // cannon boom + descending shell whistle (both players hear the animation)
    fire(power01 = 0.7) {
      if (muted()) return;
      resume();
      const k = Math.max(0, Math.min(1, power01));
      noise(0.1, 260, 0.7, 0.4 + 0.3 * k);
      tone(95, 40, 0.28, 0.3 + 0.2 * k);
      tone(1500 + 600 * k, 500, 0.8, 0.07, 'sine', 0.12); // whistle as the shell flies
    },
    explosion(size01 = 0.7) {
      if (muted()) return;
      resume();
      const k = Math.max(0, Math.min(1, size01));
      noise(0.18, 700, 0.6, 0.4 + 0.35 * k);
      tone(70, 28, 0.5, 0.35 + 0.25 * k);
      noise(0.5, 180, 0.5, 0.12 + 0.15 * k, 0.06, 'lowpass'); // rumble tail
    },
    // called each frame while it's our turn; 0 speed => silent
    updateDrive(speed01 = 0) {
      const t = ctx.currentTime;
      const s = muted() ? 0 : Math.max(0, Math.min(1, speed01));
      rumbleGain.gain.setTargetAtTime(s * 0.22, t, 0.08);
      rumbleLp.frequency.setTargetAtTime(110 + s * 160, t, 0.1);
      if (s > 0) resume();
    },
    roundOver() {
      if (muted()) return;
      resume();
      tone(392, 392, 0.14, 0.2, 'triangle');
      tone(523, 523, 0.2, 0.22, 'triangle', 0.13);
    },
    dispose() {
      try { rumbleSrc.stop(); } catch { /* already stopped */ }
      ctx.close().catch(() => {});
    },
  };
}
