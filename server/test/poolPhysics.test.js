import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, TABLE, POCKETS } from '../src/games/poolPhysics.js';

const ball = (id, x, y, vx = 0, vy = 0) => ({ id, x, y, vx, vy, r: TABLE.ballR, mass: 1 });

test('pool table has 6 pockets (4 corners + 2 sides)', () => {
  assert.equal(POCKETS.length, 6);
});

test('a ball aimed into a corner pocket is captured', () => {
  const { pocketed, finalDiscs } = simulateShot([ball(3, 130, 130, -4, -4)]);
  assert.equal(pocketed.length, 1);
  assert.equal(pocketed[0].id, 3);
  assert.equal(finalDiscs.length, 0);
});

test('a ball aimed into a side pocket is captured', () => {
  const { pocketed } = simulateShot([ball(4, TABLE.W / 2, 150, 0, -5)]);
  assert.equal(pocketed.length, 1);
  assert.equal(pocketed[0].id, 4);
});

test('head-on collision transfers momentum forward', () => {
  const { finalDiscs } = simulateShot([ball(0, 200, 250, 8, 0), ball(5, 320, 250)]);
  const c = finalDiscs.find((d) => d.id === 0);
  const o = finalDiscs.find((d) => d.id === 5);
  assert.ok(o.x > 320, 'object ball moved forward');
  assert.ok(o.x > c.x, 'object ended ahead of the cue');
});

test('identical inputs produce identical results (deterministic)', () => {
  const make = () => [ball(0, 200, 300, 6, -3), ball(6, 500, 220)];
  const a = simulateShot(make());
  const b = simulateShot(make());
  assert.equal(JSON.stringify(a.finalDiscs), JSON.stringify(b.finalDiscs));
});
