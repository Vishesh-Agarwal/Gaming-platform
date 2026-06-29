import test from 'node:test';
import assert from 'node:assert/strict';
import battleship, { FLEET } from '../src/games/battleship.js';
import { getGame, listGames } from '../src/games/registry.js';

const fleet = (offsetY = 0) => FLEET.map((ship, i) => ({
  id: ship.id,
  cells: Array.from({ length: ship.size }, (_, x) => ({ x, y: i + offsetY })),
}));

test('is registered as an available game', () => {
  assert.equal(getGame('battleship')?.name, 'Battleship');
  assert.ok(listGames().some((game) => game.id === 'battleship'));
});

test('validates placed fleets', () => {
  const state = battleship.createInitialState();
  assert.equal(battleship.applyMove(state, 0, { type: 'place', ships: [] }).error, 'Place every ship.');
  const bad = fleet();
  bad[0] = { id: 'carrier', cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }] };
  assert.equal(battleship.applyMove(state, 0, { type: 'place', ships: bad }).error, 'Carrier must be straight.');
});

test('moves from setup to playing after both fleets are ready', () => {
  let state = battleship.createInitialState();
  state = battleship.applyMove(state, 0, { type: 'place', ships: fleet() }).state;
  assert.equal(state.phase, 'setup');
  assert.deepEqual(state.boards.map((b) => b.ready), [true, false]);
  state = battleship.applyMove(state, 1, { type: 'place', ships: fleet() }).state;
  assert.equal(state.phase, 'playing');
  assert.equal(state.turn, 0);
});

test('fires, records hits, alternates turns, and rejects repeat shots', () => {
  let state = battleship.createInitialState();
  state = battleship.applyMove(state, 0, { type: 'place', ships: fleet() }).state;
  state = battleship.applyMove(state, 1, { type: 'place', ships: fleet() }).state;

  state = battleship.applyMove(state, 0, { type: 'fire', x: 0, y: 0 }).state;
  assert.deepEqual(state.lastShot, { by: 0, x: 0, y: 0, result: 'hit', sunk: null });
  assert.equal(state.turn, 1);
  assert.equal(battleship.applyMove(state, 0, { type: 'fire', x: 1, y: 0 }).error, 'Not your turn.');
  assert.equal(battleship.applyMove(state, 1, { type: 'fire', x: 0, y: 0 }).state.lastShot.result, 'hit');
});

test('publicState hides opponent ships until game over', () => {
  let state = battleship.createInitialState();
  state = battleship.applyMove(state, 0, { type: 'place', ships: fleet() }).state;
  state = battleship.applyMove(state, 1, { type: 'place', ships: fleet() }).state;
  const view = battleship.publicState(state, 0);
  assert.equal(view.ownBoard.ships.length, 5);
  assert.deepEqual(view.revealedEnemyShips, []);
});

test('sinking all enemy ships wins', () => {
  let state = battleship.createInitialState();
  state = battleship.applyMove(state, 0, { type: 'place', ships: fleet() }).state;
  state = battleship.applyMove(state, 1, { type: 'place', ships: fleet() }).state;

  const targets = fleet().flatMap((ship) => ship.cells);
  const targetKeys = new Set(targets.map((c) => `${c.x},${c.y}`));
  const misses = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10) }))
    .filter((c) => !targetKeys.has(`${c.x},${c.y}`));
  let missIndex = 0;
  for (const target of targets) {
    state = battleship.applyMove(state, state.turn, { type: 'fire', ...target }).state;
    if (state.phase !== 'done') {
      state = battleship.applyMove(state, state.turn, { type: 'fire', ...misses[missIndex] }).state;
      missIndex += 1;
    }
  }
  assert.equal(state.phase, 'done');
  assert.deepEqual(battleship.getResult(state), { over: true, winner: 0, draw: false, scores: [17, 0] });
  assert.equal(battleship.publicState(state, 0).revealedEnemyShips.length, 5);
});
