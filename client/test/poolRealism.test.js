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
