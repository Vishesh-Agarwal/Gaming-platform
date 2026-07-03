import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateShot, BOARD } from '../src/games/carromPhysics.js';
import { createInitialState, applyMove } from '../src/games/carrom.js';

test('carromPhysics forwards the events timeline; pocket events carry color', () => {
  // striker aimed straight at a coin sitting in front of the corner pocket
  const discs = [
    { id: 0, color: 'striker', x: 450, y: 750, vx: -8, vy: -8, r: BOARD.strikerR, mass: 1.4 },
    { id: 1, color: 'white', x: 160, y: 460, vx: 0, vy: 0, r: BOARD.coinR, mass: 1 },
  ];
  const out = simulateShot(discs);
  assert.ok(Array.isArray(out.events));
  const a = simulateShot(discs.map((d) => ({ ...d })));
  assert.deepEqual(a.events, out.events);
  for (const e of out.events.filter((x) => x.type === 'pocket')) {
    assert.ok(e.color, 'pocket events carry color');
  }
});

test('a carrom move ships lastShot.events to the client', () => {
  const state = createInitialState({ mode: 'classic' });
  const { state: next, error } = applyMove(state, 0, { x: 450, dx: 0.2, dy: -1, power: 80 });
  assert.equal(error, undefined);
  assert.ok(Array.isArray(next.lastShot.events));
  assert.ok(next.lastShot.events.length > 0, 'a full-power break makes contact events');
});
