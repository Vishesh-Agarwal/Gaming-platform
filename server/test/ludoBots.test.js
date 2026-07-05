import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotMove, supportsRoomBots } from '../src/bots.js';
import ludo, { applyRoll } from '../src/games/ludo.js';

test('ludo supports room bots', () => {
  assert.equal(supportsRoomBots('ludo'), true);
});

test('bot rolls in the roll phase and moves a legal token in the move phase', () => {
  let state = ludo.createInitialState({}, 2);
  const roll = chooseBotMove(ludo, state, 0);
  assert.deepEqual(roll, { action: 'roll' });

  // Force a move phase: a 6 always yields at least one movable token (leave base).
  state = applyRoll(state, 6);
  assert.equal(state.phase, 'move');
  const move = chooseBotMove(ludo, state, 0);
  assert.equal(move.action, 'move');
  assert.ok(state.movable.includes(move.token), `token ${move.token} should be movable`);
  const applied = ludo.applyMove(state, 0, move);
  assert.ok(!applied.error, applied.error);
});

test('two bots can play a full game to completion', () => {
  let state = ludo.createInitialState({}, 2);
  for (let i = 0; i < 5000; i += 1) {
    const result = ludo.getResult(state);
    if (result.over) {
      assert.ok(result.winner === 0 || result.winner === 1);
      return;
    }
    const seat = state.current;
    const move = chooseBotMove(ludo, state, seat);
    assert.ok(move, `bot found no move at turn ${i} (phase ${state.phase})`);
    const applied = ludo.applyMove(state, seat, move);
    assert.ok(!applied.error, `move ${JSON.stringify(move)} failed: ${applied.error}`);
    state = applied.state;
  }
  assert.fail('game did not finish within 5000 bot moves');
});
