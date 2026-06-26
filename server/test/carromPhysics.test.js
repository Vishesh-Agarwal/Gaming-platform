// server/test/carromPhysics.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, BOARD } from '../src/games/carromPhysics.js';
import { POCKETS } from '../src/games/carromPhysics.js';

test('a moving disc comes to rest and stops within the step cap', () => {
  const discs = [{ id: 'a', color: 'white', x: 450, y: 450, vx: 6, vy: 0, r: BOARD.coinR, mass: 1 }];
  const { frames, finalDiscs } = simulateShot(discs);
  assert.equal(finalDiscs.length, 1);
  assert.equal(finalDiscs[0].vx, 0);
  assert.equal(finalDiscs[0].vy, 0);
  assert.ok(finalDiscs[0].x > 450, 'should have drifted right');
  assert.ok(frames.length > 1 && frames.length < 4000, 'recorded a bounded set of frames');
});

test('head-on collision transfers momentum to the resting disc', () => {
  const striker = { id: 's', color: 'striker', x: 200, y: 450, vx: 8, vy: 0, r: BOARD.strikerR, mass: 1.5 };
  const coin = { id: 'c', color: 'white', x: 300, y: 450, vx: 0, vy: 0, r: BOARD.coinR, mass: 1 };
  const { finalDiscs } = simulateShot([striker, coin]);
  const s = finalDiscs.find((d) => d.id === 's');
  const c = finalDiscs.find((d) => d.id === 'c');
  assert.ok(c.x > 300, 'struck coin moved forward');
  assert.ok(c.x > s.x, 'coin ended ahead of the striker');
});

test('a coin sliding into a corner is pocketed', () => {
  const p = POCKETS[0]; // top-left
  const coin = { id: 'c', color: 'white', x: p.x + 60, y: p.y + 60, vx: -4, vy: -4, r: BOARD.coinR, mass: 1 };
  const { pocketed, finalDiscs } = simulateShot([coin]);
  assert.equal(pocketed.length, 1);
  assert.equal(pocketed[0].id, 'c');
  assert.equal(finalDiscs.length, 0);
});

test('identical inputs produce identical results (deterministic)', () => {
  const make = () => [
    { id: 's', color: 'striker', x: 200, y: 600, vx: 5, vy: -3, r: BOARD.strikerR, mass: 1.5 },
    { id: 'c', color: 'black', x: 350, y: 420, vx: 0, vy: 0, r: BOARD.coinR, mass: 1 },
  ];
  const a = simulateShot(make());
  const b = simulateShot(make());
  assert.equal(JSON.stringify(a.finalDiscs), JSON.stringify(b.finalDiscs));
  assert.equal(JSON.stringify(a.pocketed), JSON.stringify(b.pocketed));
});
