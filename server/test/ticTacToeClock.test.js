import test from 'node:test';
import assert from 'node:assert/strict';
import ttt from '../src/games/tictactoe.js';

test('tictactoe declares a turn clock', () => {
  assert.equal(typeof ttt.turnTimeoutMs, 'number');
  assert.ok(ttt.turnTimeoutMs > 0);
  assert.equal(typeof ttt.onTimeout, 'function');
});

test('classic: timeout auto-plays a legal move and hands over the turn', () => {
  const s = ttt.createInitialState({ mode: 'classic' });
  const { state } = ttt.onTimeout(s);
  assert.equal(state.board.filter((c) => c === 0).length, 1); // exactly one X placed
  assert.equal(state.turn, 1); // turn passed to O
});

test('classic: timeout only fills empty cells', () => {
  let s = ttt.createInitialState({ mode: 'classic' });
  s = { ...s, board: [0, 1, 0, 1, null, 1, 0, 1, 0], turn: 0 };
  const { state } = ttt.onTimeout(s);
  assert.equal(state.board[4], 0); // the only empty cell got X
});

test('shifting: timeout slides one of the mover\'s pieces in the move phase', () => {
  // 0 has 0,1,5 ; 1 has 2,3,7 (no line for either); all 6 placed -> move phase
  const s = {
    mode: 'shifting',
    board: [0, 0, 1, 1, null, 0, null, 1, null],
    turn: 0,
  };
  const { state } = ttt.onTimeout(s);
  const mine = state.board.filter((c) => c === 0).length;
  assert.equal(mine, 3); // still three pieces — it slid, didn't add
  assert.equal(state.turn, 1);
});

test('ultimate: timeout plays inside the forced board', () => {
  let s = ttt.createInitialState({ mode: 'ultimate' });
  s = { ...s, active: 4, turn: 0 };
  const { state } = ttt.onTimeout(s);
  assert.equal(state.boards[4].filter((c) => c === 0).length, 1);
  assert.equal(state.turn, 1);
});
