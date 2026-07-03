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
