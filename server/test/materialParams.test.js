import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groundParamsFor,
  kartPaintParams,
  createCache,
} from '../../client/src/games/karts/materialParams.js';

test('groundParamsFor returns per-map params for known maps', () => {
  const a = groundParamsFor('arena');
  assert.ok(a.grassRatio >= 0 && a.grassRatio <= 1);
  assert.match(a.asphalt, /^#[0-9a-fA-F]{6}$/);
  assert.match(a.grass, /^#[0-9a-fA-F]{6}$/);
});

test('groundParamsFor falls back to a default for unknown maps', () => {
  const d = groundParamsFor('does-not-exist');
  assert.ok(d.grassRatio >= 0 && d.grassRatio <= 1);
  assert.match(d.asphalt, /^#[0-9a-fA-F]{6}$/);
  assert.match(d.grass, /^#[0-9a-fA-F]{6}$/);
});

test('kartPaintParams keeps the base color and yields a painted-metal range', () => {
  const p = kartPaintParams('#ff5d6c');
  assert.equal(p.color, '#ff5d6c');
  assert.ok(p.metalness > 0 && p.metalness <= 1);
  assert.ok(p.roughness > 0 && p.roughness < 1);
});

test('createCache produces each key once and returns the same instance', () => {
  let calls = 0;
  const cache = createCache((k) => ({ k, n: ++calls }));
  const first = cache.get('a');
  const second = cache.get('a');
  assert.equal(first, second);          // same instance
  assert.equal(calls, 1);               // producer ran once
  cache.get('b');
  assert.equal(calls, 2);
  assert.equal(cache.has('a'), true);
});

test('createCache dispose() calls each value.dispose() and clears the store', () => {
  const disposed = [];
  const cache = createCache((k) => ({ dispose() { disposed.push(k); } }));
  cache.get('x');
  cache.get('y');
  cache.dispose();
  assert.deepEqual(disposed.sort(), ['x', 'y']);
  assert.equal(cache.has('x'), false);
});
