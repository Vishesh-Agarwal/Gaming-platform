let audioContext = null;
let muted = typeof window !== 'undefined' && window.localStorage?.getItem('gameSoundMuted') === '1';

function ctx() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(freq, start, duration, type = 'sine', gain = 0.08) {
  const ac = ctx();
  if (!ac || muted) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  amp.gain.setValueAtTime(0.0001, ac.currentTime + start);
  amp.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(amp);
  amp.connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

export function getGameMuted() {
  return muted;
}

export function setGameMuted(value) {
  muted = !!value;
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem('gameSoundMuted', muted ? '1' : '0');
  }
}

export function playGameSound(kind) {
  if (muted) return;
  if (kind === 'move') {
    tone(360, 0, 0.07, 'triangle', 0.06);
    tone(540, 0.055, 0.08, 'triangle', 0.045);
  } else if (kind === 'error') {
    tone(180, 0, 0.12, 'sawtooth', 0.045);
    tone(130, 0.08, 0.14, 'sawtooth', 0.035);
  } else if (kind === 'win') {
    tone(440, 0, 0.1, 'triangle', 0.07);
    tone(660, 0.09, 0.12, 'triangle', 0.07);
    tone(880, 0.2, 0.18, 'triangle', 0.06);
  } else if (kind === 'lose') {
    tone(330, 0, 0.12, 'triangle', 0.055);
    tone(220, 0.12, 0.18, 'triangle', 0.045);
  } else if (kind === 'draw') {
    tone(300, 0, 0.11, 'sine', 0.045);
    tone(300, 0.14, 0.11, 'sine', 0.04);
  } else if (kind === 'tick') {
    tone(760, 0, 0.045, 'square', 0.025);
  } else if (kind === 'emote') {
    tone(620, 0, 0.05, 'sine', 0.035);
    tone(820, 0.045, 0.06, 'sine', 0.03);
  }
}
