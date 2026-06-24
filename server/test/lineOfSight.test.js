import test from 'node:test';
import assert from 'node:assert/strict';
import { lineOfSightClear } from '../src/games/karts.js';

const empty = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };

test('clear when nothing is in the way', () => {
  assert.equal(lineOfSightClear(empty, -10, 0, 10, 0), true);
});

test('a box blocks a segment crossing its footprint', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 0, w: 4, d: 4 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
});

test('a box off to the side does not block', () => {
  const m = { obstacles: [{ kind: 'box', x: 0, z: 20, w: 4, d: 4 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), true);
});

test('a cylinder blocks a segment crossing it', () => {
  const m = { obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 3 }], ramps: [] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
  const m2 = { obstacles: [{ kind: 'cyl', x: 0, z: 20, r: 3 }], ramps: [] };
  assert.equal(lineOfSightClear(m2, -10, 0, 10, 0), true);
});

test('a flat wedge plateau (loY===hiY) blocks like a box', () => {
  const m = { obstacles: [], ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 8, axis: 'z', loY: 4, hiY: 4 }] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), false);
});

test('a sloped wedge (loY!==hiY) does NOT block', () => {
  const m = { obstacles: [], ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 8, axis: 'z', loY: 0, hiY: 4 }] };
  assert.equal(lineOfSightClear(m, -10, 0, 10, 0), true);
});

test('an obstacle containing an endpoint is ignored (target on a mesa is reachable)', () => {
  const m = { obstacles: [{ kind: 'box', x: 8, z: 0, w: 6, d: 6 }], ramps: [] };
  // endpoint (8,0) is inside the box footprint -> that box must not block
  assert.equal(lineOfSightClear(m, -10, 0, 8, 0), true);
});
