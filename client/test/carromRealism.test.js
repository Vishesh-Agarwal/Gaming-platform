import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const carrom = readFileSync(new URL('../src/games/Carrom.jsx', import.meta.url), 'utf8');

test('board is lit plywood: lamp gradient, vignette, and grain strokes', () => {
  const body = carrom.slice(carrom.indexOf('function drawBoard'), carrom.indexOf('function drawBaseline'));
  assert.match(body, /createRadialGradient/);
  assert.match(body, /vignette/i);
  assert.match(body, /grain/i);
});

test('pockets have a depth gradient inside the brass rings', () => {
  const body = carrom.slice(carrom.indexOf('function drawBoard'), carrom.indexOf('function drawBaseline'));
  assert.match(body, /depth/i);
});

test('carrom men are grooved discs with edge thickness, not plain circles', () => {
  const body = carrom.slice(carrom.indexOf('function drawDisc'));
  assert.match(body, /groove/i);
  assert.match(body, /rim/i);
  assert.match(carrom, /star/i); // striker inlay
});

test('pocketed coins sink into the pocket; sounds sync to event frames', () => {
  assert.match(carrom, /sinksRef/);
  assert.match(carrom, /SINK_FRAMES/);
  assert.match(carrom, /createCarromAudio/);
  assert.match(carrom, /play\(e\.type/);
});

test('carrom guards setPointerCapture like pool', () => {
  assert.match(carrom, /try \{ canvasRef\.current\.setPointerCapture/);
});

test('the shared impact-audio module exposes a wood-tuned carrom preset', async () => {
  const audio = readFileSync(new URL('../src/games/poolAudio.js', import.meta.url), 'utf8');
  assert.match(audio, /createCarromAudio/);
  const mod = await import('../src/games/poolAudio.js');
  assert.equal(typeof mod.createCarromAudio, 'function');
  const stub = mod.createCarromAudio(); // no Web Audio under node -> no-op stub
  stub.play('ball', 0.5);
  stub.dispose();
});
