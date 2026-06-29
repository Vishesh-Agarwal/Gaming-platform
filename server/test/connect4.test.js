import test from 'node:test';
import assert from 'node:assert/strict';
import connect4 from '../src/games/connect4.js';
import { getGame, listGames } from '../src/games/registry.js';

function play(state, seat, col) {
  const out = connect4.applyMove(state, seat, { col });
  assert.equal(out.error, undefined);
  return out.state;
}

test('is registered as an available game', () => {
  assert.equal(getGame('connect4')?.name, 'Connect Four');
  assert.ok(getGame('connect4')?.modes?.some((mode) => mode.id === 'popout'));
  assert.ok(listGames().some((game) => game.id === 'connect4'));
});

test('creates mode-specific initial state', () => {
  const classic = connect4.createInitialState();
  const five = connect4.createInitialState({ mode: 'five' });

  assert.equal(classic.mode, 'classic');
  assert.equal(classic.target, 4);
  assert.equal(five.mode, 'five');
  assert.equal(five.target, 5);
});

test('rejects moves out of turn and outside the board', () => {
  const state = connect4.createInitialState();
  assert.equal(connect4.applyMove(state, 1, { col: 0 }).error, 'Not your turn.');
  assert.equal(connect4.applyMove(state, 0, { col: -1 }).error, 'Choose a valid column.');
  assert.equal(connect4.applyMove(state, 0, { col: 7 }).error, 'Choose a valid column.');
});

test('drops discs bottom-up and keeps the previous state immutable', () => {
  const state = connect4.createInitialState();
  const next = play(state, 0, 3);

  assert.deepEqual(state.board[3], []);
  assert.deepEqual(next.board[3], [0]);
  assert.deepEqual(next.lastDrop, { col: 3, row: 0, by: 0, action: 'drop' });
  assert.equal(next.turn, 1);
  assert.equal(next.seq, 1);
});

test('rejects a full column', () => {
  let state = connect4.createInitialState();
  for (let i = 0; i < 6; i += 1) state = play(state, i % 2, 0);

  assert.equal(connect4.applyMove(state, 0, { col: 0 }).error, 'Column is full.');
});

test('four in a column wins', () => {
  let state = connect4.createInitialState();
  for (let i = 0; i < 3; i += 1) {
    state = play(state, 0, 0);
    state = play(state, 1, 1);
  }
  state = play(state, 0, 0);

  assert.deepEqual(connect4.getResult(state).line, [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }]);
  assert.deepEqual({ ...connect4.getResult(state), line: undefined }, { over: true, winner: 0, draw: false, line: undefined });
  assert.equal(connect4.applyMove(state, 1, { col: 1 }).error, 'Game is over.');
});

test('five-in-a-row requires five connected discs', () => {
  let state = connect4.createInitialState({ mode: 'five' });
  for (let i = 0; i < 4; i += 1) {
    state = play(state, 0, i);
    state = play(state, 1, i);
  }
  assert.equal(connect4.getResult(state).over, false);
  state = play(state, 0, 4);
  assert.equal(connect4.getResult(state).winner, 0);
});

test('popout allows popping only your own bottom disc', () => {
  let state = connect4.createInitialState({ mode: 'popout' });
  state = play(state, 0, 0);
  state = play(state, 1, 0);

  state = connect4.applyMove(state, 0, { col: 0, action: 'pop' }).state;
  assert.deepEqual(state.board[0], [1]);
  state = connect4.applyMove(state, 1, { col: 0, action: 'pop' }).state;
  assert.deepEqual(state.board[0], []);
});

test('pop action is rejected outside popout mode', () => {
  let state = connect4.createInitialState();
  state = play(state, 0, 0);
  state = play(state, 1, 1);
  assert.equal(connect4.applyMove(state, 0, { col: 0, action: 'pop' }).error, 'PopOut is not enabled.');
});

test('four across a row wins', () => {
  let state = connect4.createInitialState();
  state = play(state, 0, 0);
  state = play(state, 1, 0);
  state = play(state, 0, 1);
  state = play(state, 1, 1);
  state = play(state, 0, 2);
  state = play(state, 1, 2);
  state = play(state, 0, 3);

  assert.equal(connect4.getResult(state).winner, 0);
});

test('four on a diagonal wins', () => {
  let state = connect4.createInitialState();
  state = play(state, 0, 0);
  state = play(state, 1, 1);
  state = play(state, 0, 1);
  state = play(state, 1, 2);
  state = play(state, 0, 3);
  state = play(state, 1, 2);
  state = play(state, 0, 2);
  state = play(state, 1, 3);
  state = play(state, 0, 4);
  state = play(state, 1, 3);
  state = play(state, 0, 3);

  assert.equal(connect4.getResult(state).winner, 0);
});

test('full board without four connected discs is a draw', () => {
  const board = [
    [0, 0, 1, 1, 0, 0],
    [1, 1, 0, 0, 1, 1],
    [0, 0, 1, 1, 0, 0],
    [1, 1, 0, 0, 1, 1],
    [0, 0, 1, 1, 0, 0],
    [1, 1, 0, 0, 1, 1],
    [0, 0, 1, 1, 0, 0],
  ];
  const state = { ...connect4.createInitialState(), board };

  assert.deepEqual(connect4.getResult(state), { over: true, winner: null, draw: true });
});
