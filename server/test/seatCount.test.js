import test from 'node:test';
import assert from 'node:assert/strict';
import { register, getGame } from '../src/games/registry.js';

test('createRoom-style seatCount reaches createInitialState', () => {
  let seen = null;
  register({
    id: '__probe__', name: 'Probe', type: 'turn-based', minPlayers: 2, maxPlayers: 4,
    createInitialState: (_opts, seatCount) => { seen = seatCount; return { seatCount }; },
    applyMove: (s) => ({ state: s }),
    getResult: () => ({ over: false, winner: null, draw: false }),
  });
  const g = getGame('__probe__');
  const st = g.createInitialState(undefined, 3);
  assert.equal(seen, 3);
  assert.equal(st.seatCount, 3);
});
