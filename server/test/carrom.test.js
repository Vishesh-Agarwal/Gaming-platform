// server/test/carrom.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import carrom from '../src/games/carrom.js';

const { createInitialState } = carrom;

test('classic layout has 19 coins: 1 queen, 9 white, 9 black', () => {
  const s = createInitialState({ mode: 'classic' }, 2);
  assert.equal(s.coins.length, 19);
  assert.equal(s.coins.filter((c) => c.color === 'queen').length, 1);
  assert.equal(s.coins.filter((c) => c.color === 'white').length, 9);
  assert.equal(s.coins.filter((c) => c.color === 'black').length, 9);
  assert.equal(s.coinsPerColor, 9);
  assert.equal(s.mode, 'classic');
});

test('quick layout has 7 coins: 1 queen, 3 white, 3 black', () => {
  const s = createInitialState({ mode: 'quick' }, 2);
  assert.equal(s.coins.length, 7);
  assert.equal(s.coinsPerColor, 3);
});

test('points mode carries a target and starts scores at zero', () => {
  const s = createInitialState({ mode: 'points' }, 2);
  assert.equal(s.mode, 'points');
  assert.equal(s.target, 7);
  assert.deepEqual(s.scores, [0, 0]);
});

test('unknown mode falls back to classic', () => {
  const s = createInitialState({ mode: 'nope' }, 2);
  assert.equal(s.mode, 'classic');
});

const { applyMove } = carrom;

// A reliable "straight up the left rail into the top-left pocket" shot for seat 0.
const RAIL_X = 94;          // BOARD.inset(72) + strikerR(22)
const STRAIGHT_UP = { x: RAIL_X, dx: 0, dy: -1, power: 100 };
// A coin placed here on the rail is pocketed by STRAIGHT_UP while the striker
// transfers its momentum and stops short (so the striker itself is NOT pocketed).
const NEAR_Y = 300;

function freshClassic() {
  const s = createInitialState({ mode: 'classic' }, 2);
  s.coins = []; // tests place their own coins
  return s;
}

test('pocketing a coin claims that color for the shooter on first pocket', () => {
  const s = freshClassic();
  s.coins = [{ id: 5, color: 'white', x: RAIL_X, y: NEAR_Y }];
  const { state, error } = applyMove(s, 0, STRAIGHT_UP);
  assert.equal(error, undefined);
  assert.equal(state.colors[0], 'white');
  assert.equal(state.colors[1], 'black');
  assert.equal(state.pocketedByColor.white, 1);
});

test('pocketing your own coin keeps your turn', () => {
  const s = freshClassic();
  s.colors = { 0: 'white', 1: 'black' };
  s.coins = [{ id: 5, color: 'white', x: RAIL_X, y: NEAR_Y }];
  const { state } = applyMove(s, 0, STRAIGHT_UP);
  assert.equal(state.turn, 0);
  assert.equal(state.coins.length, 0);
});

test('a shot that pockets nothing passes the turn', () => {
  const s = freshClassic();
  s.colors = { 0: 'white', 1: 'black' };
  const { state } = applyMove(s, 0, { x: 450, dx: 0, dy: -1, power: 30 });
  assert.equal(state.turn, 1);
});

test('rejects a move when it is not your turn', () => {
  const s = freshClassic();
  const { error } = applyMove(s, 1, STRAIGHT_UP);
  assert.ok(error);
});

test('rejects aiming away from the board', () => {
  const s = freshClassic();
  const { error } = applyMove(s, 0, { x: 450, dx: 0, dy: 1, power: 50 }); // seat 0 must aim up
  assert.ok(error);
});
