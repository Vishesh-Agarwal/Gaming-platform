import test from 'node:test';
import assert from 'node:assert/strict';
import wordduel, { scoreGuess } from '../src/games/wordduel.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as an available game', () => {
  assert.equal(getGame('wordduel')?.name, 'Word Duel');
  assert.ok(listGames().some((game) => game.id === 'wordduel'));
});

test('scores duplicate letters correctly', () => {
  assert.deepEqual(scoreGuess('APPLE', 'ALLEY'), ['correct', 'absent', 'absent', 'present', 'present']);
});

test('hides answer until the match is over', () => {
  let state = wordduel.createInitialState({ seed: 1 });
  assert.equal(wordduel.publicState(state, 0).answer, null);
  state = { ...state, phase: 'done' };
  assert.equal(typeof wordduel.publicState(state, 0).answer, 'string');
});

test('rejects bad guesses and duplicate guesses', () => {
  let state = wordduel.createInitialState({ seed: 2 });
  assert.equal(wordduel.applyMove(state, 0, { guess: 'AB' }).error, 'Guess a 5-letter word.');
  state = wordduel.applyMove(state, 0, { guess: 'CRANE' }).state;
  assert.equal(wordduel.applyMove(state, 0, { guess: 'CRANE' }).error, 'You already tried that word.');
});

test('hints reveal viewer letters and penalize final score', () => {
  let state = wordduel.createInitialState({ seed: 3 });
  const answer = state.secret.answer;
  state = wordduel.applyMove(state, 1, { type: 'hint' }).state;
  assert.deepEqual(wordduel.publicState(state, 1).hints, [{ index: 0, letter: answer[0] }]);
  assert.deepEqual(wordduel.publicState(state, 0).hints, []);
  state = wordduel.applyMove(state, 1, { guess: answer }).state;
  assert.equal(wordduel.getResult(state).scores[1], 55);
});

test('first correct solve wins immediately', () => {
  let state = wordduel.createInitialState({ seed: 3 });
  const answer = state.secret.answer;
  state = wordduel.applyMove(state, 1, { guess: answer }).state;
  assert.deepEqual(wordduel.getResult(state), {
    over: true,
    winner: 1,
    draw: false,
    scores: [0, 60],
  });
});

test('both players exhausting guesses is a draw', () => {
  let state = wordduel.createInitialState({ seed: 4 });
  const wrongs = ['CRANE', 'SOUTH', 'MIDGE', 'PLUCK', 'BROWN', 'FAITH']
    .filter((guess) => guess !== state.secret.answer);
  for (let i = 0; i < 6; i += 1) state = wordduel.applyMove(state, 0, { guess: wrongs[i] }).state;
  assert.equal(wordduel.getResult(state).over, false);
  for (let i = 0; i < 6; i += 1) state = wordduel.applyMove(state, 1, { guess: wrongs[i] }).state;
  assert.deepEqual(wordduel.getResult(state), {
    over: true,
    winner: null,
    draw: true,
    scores: [0, 0],
  });
});
