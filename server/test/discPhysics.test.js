import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot } from '../src/games/discPhysics.js';

// A small generic test table: 600x400 box, one corner pocket and one side pocket.
const TABLE = {
  bounds: { loX: 40, hiX: 560, loY: 40, hiY: 360 },
  pockets: [
    { x: 40, y: 40, r: 24 },     // top-left corner
    { x: 300, y: 36, r: 22 },    // top side
  ],
  friction: 0.985, stopV: 0.05, restitution: 0.94, wallRest: 0.75,
  maxSteps: 4000, frameEvery: 2,
};
const ball = (id, x, y, vx = 0, vy = 0) => ({ id, x, y, vx, vy, r: 13, mass: 1 });

test('a moving disc comes to rest within the step cap', () => {
  const { finalDiscs, frames } = simulateShot([ball(1, 300, 200, 6, 0)], TABLE);
  assert.equal(finalDiscs.length, 1);
  assert.equal(finalDiscs[0].vx, 0);
  assert.equal(finalDiscs[0].vy, 0);
  assert.ok(finalDiscs[0].x > 300, 'drifted right');
  assert.ok(frames.length > 1 && frames.length < 5000);
});

test('head-on collision transfers momentum forward', () => {
  const cue = ball(0, 150, 200, 8, 0);
  const obj = ball(2, 250, 200);
  const { finalDiscs } = simulateShot([cue, obj], TABLE);
  const c = finalDiscs.find((d) => d.id === 0);
  const o = finalDiscs.find((d) => d.id === 2);
  assert.ok(o.x > 250, 'struck ball moved forward');
  assert.ok(o.x > c.x, 'object ended ahead of the cue');
});

test('a disc aimed into the corner pocket is captured', () => {
  const { pocketed, finalDiscs } = simulateShot([ball(3, 100, 100, -4, -4)], TABLE);
  assert.equal(pocketed.length, 1);
  assert.equal(pocketed[0].id, 3);
  assert.equal(finalDiscs.length, 0);
});

test('a disc aimed into the side pocket is captured', () => {
  const { pocketed } = simulateShot([ball(4, 300, 120, 0, -5)], TABLE);
  assert.equal(pocketed.length, 1);
  assert.equal(pocketed[0].id, 4);
});

test('identical inputs produce identical results (deterministic)', () => {
  const make = () => [ball(0, 120, 250, 5, -2), ball(5, 320, 180)];
  const a = simulateShot(make(), TABLE);
  const b = simulateShot(make(), TABLE);
  assert.equal(JSON.stringify(a.finalDiscs), JSON.stringify(b.finalDiscs));
  assert.equal(JSON.stringify(a.pocketed), JSON.stringify(b.pocketed));
});

test('firstContact reports the first object ball the cue (id 0) hits', () => {
  const cue = ball(0, 100, 200, 8, 0);
  const obj = ball(7, 250, 200);
  const { firstContact } = simulateShot([cue, obj], TABLE);
  assert.equal(firstContact, 7);
});

test('firstContact is null when the cue hits nothing', () => {
  const { firstContact } = simulateShot([ball(0, 300, 200, 0, 4)], TABLE);
  assert.equal(firstContact, null);
});

const cueSpin = (along, side = 0) => ({ id: 0, x: 150, y: 200, vx: 8, vy: 0, r: 13, mass: 1, spin: { along, side } });

test('follow english pushes the cue forward through the contact', () => {
  const plain = simulateShot([cueSpin(0), ball(2, 250, 200)], TABLE).finalDiscs.find((d) => d.id === 0);
  const follow = simulateShot([cueSpin(1), ball(2, 250, 200)], TABLE).finalDiscs.find((d) => d.id === 0);
  assert.ok(follow.x > plain.x + 5, 'cue with follow ends further forward');
});

test('draw english pulls the cue back after contact', () => {
  const plain = simulateShot([cueSpin(0), ball(2, 250, 200)], TABLE).finalDiscs.find((d) => d.id === 0);
  const draw = simulateShot([cueSpin(-1), ball(2, 250, 200)], TABLE).finalDiscs.find((d) => d.id === 0);
  assert.ok(draw.x < plain.x - 5, 'cue with draw ends further back');
});

test('zero spin leaves the result identical to no spin field (no-op)', () => {
  const withZero = simulateShot([cueSpin(0), ball(2, 250, 200)], TABLE);
  const without = simulateShot([ball(0, 150, 200, 8, 0), ball(2, 250, 200)], TABLE);
  assert.equal(JSON.stringify(withZero.finalDiscs.map((d) => [d.id, d.x, d.y])),
    JSON.stringify(without.finalDiscs.map((d) => [d.id, d.x, d.y])));
});
