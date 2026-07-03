import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pool = readFileSync(new URL('../src/games/Pool.jsx', import.meta.url), 'utf8');

test('table is lit: overhead-lamp gradient and corner vignette in drawTable', () => {
  const body = pool.slice(pool.indexOf('function drawTable'), pool.indexOf('function drawRail'));
  assert.match(body, /createRadialGradient/);
  assert.match(body, /vignette/i);
});

test('pockets are drawn with jaw depth (dedicated helper with inner shadow)', () => {
  assert.match(pool, /function drawPocket/);
  const body = pool.slice(pool.indexOf('function drawPocket'));
  assert.match(body.slice(0, 900), /createRadialGradient/);
});

test('rails have wood grain and brass diamond sights', () => {
  assert.match(pool, /grain/i);
  assert.match(pool, /diamond/i);
});

test('pocketed balls sink into the pocket instead of vanishing', () => {
  assert.match(pool, /sinks?Ref/);
  assert.match(pool, /type === 'pocket'/);
  assert.match(pool, /SINK_FRAMES/);
});

test('the shooter sees a cue strike animation before the replay starts', () => {
  assert.match(pool, /STRIKE_MS/);
  assert.match(pool, /lastFireRef/);
  assert.match(pool, /by === youAreIndex/);
});

test('procedural pool audio: four sound types, mute-aware, intensity clamped', async () => {
  const src = readFileSync(new URL('../src/games/poolAudio.js', import.meta.url), 'utf8');
  for (const type of ['ball:', 'rail:', 'pocket:', 'cue:']) assert.ok(src.includes(type), type);
  assert.match(src, /gameSoundMuted/);
  const { clamp01 } = await import('../src/games/poolAudio.js');
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(9), 1);
});

test('replay plays event sounds synced to the frame index', () => {
  assert.match(pool, /createPoolAudio/);
  assert.match(pool, /audioRef/);
  assert.match(pool, /play\(e\.type/);
});
