import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceHeight } from '../src/games/kartPhysics.js';

const map = {
  arena: { w: 80, d: 80 },
  obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10, top: 6 }],
  ramps: [{ kind: 'wedge', x: 20, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
};

test('default ground is 0 off all primitives', () => {
  assert.equal(surfaceHeight(map, 40, 40), 0);
});

test('box footprint returns its top', () => {
  assert.equal(surfaceHeight(map, 0, 0), 6);
  assert.equal(surfaceHeight(map, 4.9, 0), 6);
  assert.equal(surfaceHeight(map, 5.1, 0), 0); // just outside footprint
});

test('box without explicit top defaults to 3', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 0, w: 4, d: 4 }] };
  assert.equal(surfaceHeight(m, 0, 0), 3);
});

test('wedge interpolates linearly along its axis', () => {
  // wedge spans z in [-6, 6], loY at low edge (z=-6), hiY at high edge (z=6)
  assert.equal(surfaceHeight(map, 20, -6), 0);
  assert.equal(surfaceHeight(map, 20, 0), 3);
  assert.equal(surfaceHeight(map, 20, 6), 6);
});

test('overlapping primitives -> max height wins', () => {
  const m = {
    obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10, top: 2 }],
    ramps: [{ kind: 'wedge', x: 0, z: 0, w: 10, d: 10, axis: 'z', loY: 0, hiY: 8 }],
  };
  assert.equal(surfaceHeight(m, 0, 5), 8); // wedge high edge beats box top 2
});

test('cylinders are not walkable (contribute nothing)', () => {
  const m = { obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 5 }] };
  assert.equal(surfaceHeight(m, 0, 0), 0);
});
