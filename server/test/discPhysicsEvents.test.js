import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateShot } from '../src/games/discPhysics.js';

const TABLE = {
  bounds: { loX: 0, hiX: 400, loY: 0, hiY: 200 },
  pockets: [{ x: 400, y: 100, r: 20 }],
  friction: 0.985,
  stopV: 0.05,
  restitution: 0.94,
  wallRest: 0.75,
  maxSteps: 4000,
  frameEvery: 2,
};
const NO_POCKETS = { ...TABLE, pockets: [] };
const disc = (id, x, y, vx = 0, vy = 0) => ({ id, x, y, vx, vy, r: 10, mass: 1 });

test('a single contact between two discs reports exactly one ball event', () => {
  const { events } = simulateShot([disc(0, 50, 100, 6, 0), disc(1, 120, 100)], NO_POCKETS);
  const contacts = events.filter((e) => e.type === 'ball');
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].id, 0);
  assert.equal(contacts[0].id2, 1);
  assert.ok(contacts[0].speed > 0);
  assert.ok(Number.isInteger(contacts[0].f) && contacts[0].f >= 0);
});

test('a wall bounce reports a rail event with impact speed', () => {
  const { events } = simulateShot([disc(0, 50, 100, -8, 0)], NO_POCKETS);
  const rails = events.filter((e) => e.type === 'rail');
  assert.ok(rails.length >= 1);
  assert.equal(rails[0].id, 0);
  assert.ok(rails[0].speed > 0);
});

test('a pocketed disc reports a pocket event no later than its disappearance frame', () => {
  const { events, frames, pocketed } = simulateShot(
    [disc(0, 300, 100, 9, 0)],
    TABLE
  );
  assert.ok(pocketed.some((p) => p.id === 0));
  const ev = events.find((e) => e.type === 'pocket' && e.id === 0);
  assert.ok(ev, 'pocket event missing');
  const firstMissing = frames.findIndex((f) => !f.some((d) => d.id === 0));
  assert.ok(firstMissing === -1 || ev.f <= firstMissing);
  assert.ok(ev.f < frames.length);
});

test('events are deterministic and legacy return fields are unchanged', () => {
  const mk = () => [disc(0, 50, 100, 6, 0.5), disc(1, 120, 100), disc(2, 200, 110)];
  const a = simulateShot(mk(), TABLE);
  const b = simulateShot(mk(), TABLE);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.frames, b.frames);
  for (const key of ['frames', 'finalDiscs', 'pocketed', 'firstContact']) {
    assert.ok(key in a, key);
  }
});
