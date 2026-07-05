import assert from 'node:assert/strict';
import test from 'node:test';

import battleship, { FLEET } from '../src/games/battleship.js';

// Default-style placement: fleet rows 0..4, horizontal from x=0.
function rowFleet() {
  return FLEET.map((spec, row) => ({
    id: spec.id,
    cells: Array.from({ length: spec.size }, (_, i) => ({ x: i, y: row })),
  }));
}

function placedState(mode) {
  let state = battleship.createInitialState({ mode });
  state = battleship.applyMove(state, 0, { type: 'place', ships: rowFleet() }).state;
  state = battleship.applyMove(state, 1, { type: 'place', ships: rowFleet() }).state;
  return state;
}

test('mode defaults to classic and is visible to clients', () => {
  assert.equal(battleship.createInitialState().mode, 'classic');
  assert.equal(battleship.createInitialState({ mode: 'salvo' }).mode, 'salvo');
  assert.equal(battleship.publicState(placedState('salvo'), 0).mode, 'salvo');
  assert.ok(battleship.modes.some((m) => m.id === 'salvo'));
});

test('classic mode still fires single shots and rejects salvo moves', () => {
  let state = placedState();
  assert.ok(battleship.applyMove(state, 0, { type: 'salvo', cells: [{ x: 9, y: 9 }] }).error);
  const res = battleship.applyMove(state, 0, { type: 'fire', x: 0, y: 0 });
  assert.ok(!res.error, res.error);
  assert.equal(res.state.lastShot.result, 'hit');
});

test('salvo mode fires one shot per surviving ship, all resolved together', () => {
  let state = placedState('salvo');
  assert.ok(battleship.applyMove(state, 0, { type: 'fire', x: 0, y: 0 }).error, 'single fire should be rejected');
  assert.match(battleship.applyMove(state, 0, { type: 'salvo', cells: [{ x: 0, y: 4 }] }).error, /5/);
  const dup = Array(5).fill({ x: 0, y: 4 });
  assert.ok(battleship.applyMove(state, 0, { type: 'salvo', cells: dup }).error);

  // Sink the patrol boat (0,4)+(1,4) with 3 misses alongside.
  const res = battleship.applyMove(state, 0, {
    type: 'salvo',
    cells: [{ x: 0, y: 4 }, { x: 1, y: 4 }, { x: 7, y: 7 }, { x: 8, y: 8 }, { x: 9, y: 9 }],
  });
  assert.ok(!res.error, res.error);
  state = res.state;
  assert.equal(state.lastShot.result, 'salvo');
  assert.equal(state.lastShot.salvo.length, 5);
  assert.equal(state.lastShot.salvo.filter((s) => s.result !== 'miss').length, 2);
  assert.equal(state.lastShot.salvo.some((s) => s.sunk === 'patrol'), true);
  assert.equal(state.turn, 1);
  assert.equal(state.scores[0], 2);

  // Seat 1 lost the patrol boat, so their salvo shrinks to 4 shots.
  assert.match(battleship.applyMove(state, 1, {
    type: 'salvo',
    cells: [{ x: 9, y: 0 }, { x: 9, y: 1 }, { x: 9, y: 2 }, { x: 9, y: 3 }, { x: 9, y: 4 }],
  }).error, /4/);
  const ok = battleship.applyMove(state, 1, {
    type: 'salvo',
    cells: [{ x: 9, y: 0 }, { x: 9, y: 1 }, { x: 9, y: 2 }, { x: 9, y: 3 }],
  });
  assert.ok(!ok.error, ok.error);
});

test('salvo rejects cells that were already fired at', () => {
  let state = placedState('salvo');
  state = battleship.applyMove(state, 0, {
    type: 'salvo',
    cells: [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 7 }, { x: 8, y: 8 }, { x: 9, y: 9 }],
  }).state;
  state = battleship.applyMove(state, 1, {
    type: 'salvo',
    cells: [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 7 }, { x: 8, y: 8 }, { x: 9, y: 9 }],
  }).state;
  assert.match(battleship.applyMove(state, 0, {
    type: 'salvo',
    cells: [{ x: 5, y: 5 }, { x: 0, y: 9 }, { x: 1, y: 9 }, { x: 2, y: 9 }, { x: 3, y: 9 }],
  }).error, /already fired/i);
});

test('sinking the last ship inside a salvo ends the game', () => {
  const state = placedState('salvo');
  // Pre-hit everything on seat 1's board except the patrol cell (1,4).
  for (const ship of state.boards[1].ships) {
    ship.hits = ship.cells.filter((c) => !(c.x === 1 && c.y === 4)).map((c) => ({ x: c.x, y: c.y }));
  }
  const res = battleship.applyMove(state, 0, {
    type: 'salvo',
    cells: [{ x: 1, y: 4 }, { x: 9, y: 9 }, { x: 9, y: 8 }, { x: 9, y: 7 }, { x: 9, y: 6 }],
  });
  assert.ok(!res.error, res.error);
  assert.equal(res.state.phase, 'done');
  assert.deepEqual(battleship.getResult(res.state), {
    over: true, winner: 0, draw: false, scores: res.state.scores,
  });
});

test('radar scan still works in salvo mode', () => {
  const state = placedState('salvo');
  const res = battleship.applyMove(state, 0, { type: 'scan', x: 1, y: 1 });
  assert.ok(!res.error, res.error);
  assert.equal(res.state.scanResults[0].length, 1);
  assert.equal(res.state.turn, 1);
});
