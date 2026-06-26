// server/test/carromPhysics.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, BOARD } from '../src/games/carromPhysics.js';

test('a moving disc comes to rest and stops within the step cap', () => {
  const discs = [{ id: 'a', color: 'white', x: 450, y: 450, vx: 6, vy: 0, r: BOARD.coinR, mass: 1 }];
  const { frames, finalDiscs } = simulateShot(discs);
  assert.equal(finalDiscs.length, 1);
  assert.equal(finalDiscs[0].vx, 0);
  assert.equal(finalDiscs[0].vy, 0);
  assert.ok(finalDiscs[0].x > 450, 'should have drifted right');
  assert.ok(frames.length > 1 && frames.length < 4000, 'recorded a bounded set of frames');
});
