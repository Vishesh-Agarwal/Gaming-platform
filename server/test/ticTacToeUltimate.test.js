import test from 'node:test';
import assert from 'node:assert/strict';
import ttt from '../src/games/tictactoe.js';

const u = () => ttt.createInitialState({ mode: 'ultimate' });

test('ultimate: initial state has nine empty boards and a free first move', () => {
  const s = u();
  assert.equal(s.mode, 'ultimate');
  assert.equal(s.boards.length, 9);
  assert.equal(s.boards[0].length, 9);
  assert.deepEqual(s.won, Array(9).fill(null));
  assert.equal(s.active, null);
  assert.equal(s.turn, 0);
});

test('ultimate: the cell you play dictates the next board', () => {
  const { state } = ttt.applyMove(u(), 0, { board: 4, cell: 2 });
  assert.equal(state.boards[4][2], 0);
  assert.equal(state.active, 2); // opponent is sent to board 2
  assert.equal(state.turn, 1);
});

test('ultimate: you must play the highlighted board', () => {
  const s = ttt.applyMove(u(), 0, { board: 4, cell: 2 }).state; // active -> 2
  const r = ttt.applyMove(s, 1, { board: 5, cell: 0 });
  assert.ok(r.error);
});

test('ultimate: completing a small board assigns it to the winner', () => {
  const s = u();
  s.active = 0;
  s.boards[0] = [0, 0, null, 1, 1, null, null, null, null];
  const { state } = ttt.applyMove(s, 0, { board: 0, cell: 2 });
  assert.equal(state.won[0], 0);
  assert.equal(state.active, 2); // cell 2 -> board 2 (undecided)
});

test('ultimate: three small boards in a line wins the game', () => {
  const s = u();
  s.won = [0, 0, null, null, null, null, null, null, null];
  s.active = 2;
  s.boards[2] = [0, 0, null, 1, 1, null, null, null, null];
  const { state } = ttt.applyMove(s, 0, { board: 2, cell: 2 }); // wins board 2 -> line 0,1,2
  const res = ttt.getResult(state);
  assert.equal(res.over, true);
  assert.equal(res.winner, 0);
});

test('ultimate: being sent to a finished board frees the move (active null)', () => {
  const s = u();
  s.won[5] = 1;
  s.active = 0;
  const { state } = ttt.applyMove(s, 0, { board: 0, cell: 5 }); // cell 5 -> board 5 (decided)
  assert.equal(state.active, null);
});
