import test from 'node:test';
import assert from 'node:assert/strict';
import skribble from '../src/games/skribble.js';
import { createRoom, getRoomForUser, makeMove } from '../src/rooms.js';
import { getGame, listGames } from '../src/games/registry.js';
import { createUser } from '../src/db.js';

test('is registered as a multiplayer lobby game', () => {
  const game = getGame('skribble');
  assert.equal(game?.name, 'Skribble');
  assert.equal(game.maxPlayers, 6);
  assert.ok(listGames().some((g) => g.id === 'skribble'));
});

test('publicState reveals the word only to the active drawer', () => {
  let state = skribble.createInitialState({ seed: 123, choiceCount: 4, wordsPerPrompt: 2 }, 3);
  const drawerView = skribble.publicState(state, state.drawer);
  const guesserView = skribble.publicState(state, (state.drawer + 1) % 3);

  assert.equal(drawerView.word, null);
  assert.equal(drawerView.choices.length, 4);
  assert.ok(drawerView.choices.every((word) => word.split(/\s+/).length === 2));
  assert.deepEqual(guesserView.choices, []);
  assert.equal('secret' in guesserView, false);

  state = skribble.applyMove(state, state.drawer, { type: 'chooseWord', word: drawerView.choices[0] }).state;
  const drawingDrawerView = skribble.publicState(state, state.drawer);
  const drawingGuesserView = skribble.publicState(state, (state.drawer + 1) % 3);

  assert.equal(drawingDrawerView.word, state.secret.word);
  assert.equal(drawingGuesserView.word, null);
  assert.equal(drawingGuesserView.wordShape.length, state.secret.word.length);
  assert.equal('secret' in drawingGuesserView, false);
});

test('initial settings clamp rounds, choices, and word length', () => {
  const state = skribble.createInitialState({ rounds: 9, choiceCount: 9, wordsPerPrompt: 3, seed: 22 }, 2);
  const drawerView = skribble.publicState(state, state.drawer);

  assert.equal(state.maxRounds, 5);
  assert.equal(state.choiceCount, 5);
  assert.equal(state.wordsPerPrompt, 3);
  assert.ok(drawerView.choices.every((word) => word.split(/\s+/).length === 3));
});

test('custom prompt lists override the selected pack when they match word count', () => {
  const state = skribble.createInitialState({
    seed: 12,
    choiceCount: 3,
    wordsPerPrompt: 2,
    customWords: ['moon base', 'laser sword', 'street food', 'single'],
  }, 2);
  const drawerView = skribble.publicState(state, state.drawer);

  assert.equal(state.customWords.length, 4);
  assert.deepEqual(new Set(drawerView.choices), new Set(['moon base', 'laser sword', 'street food']));
});

test('only the drawer can choose the word', () => {
  const state = skribble.createInitialState({ seed: 3 }, 2);
  const word = state.secret.choices[0];

  assert.equal(skribble.applyMove(state, 1, { type: 'chooseWord', word }).error, 'Only the drawer can choose the word.');
  assert.equal(skribble.applyMove(state, 0, { type: 'chooseWord', word: 'not offered' }).error, 'Choose one of the offered words.');
});

test('only the drawer can draw and clear', () => {
  let state = skribble.createInitialState({ seed: 1 }, 2);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;

  assert.equal(skribble.applyMove(state, 1, { type: 'stroke', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).error, 'Only the drawer can draw.');
  state = skribble.applyMove(state, 0, {
    type: 'stroke',
    color: '#3fc7ad',
    size: 9,
    points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
  }).state;
  assert.equal(state.strokes.length, 1);
  assert.equal(state.strokes[0].color, '#3fc7ad');

  state = skribble.applyMove(state, 0, { type: 'clear' }).state;
  assert.equal(state.strokes.length, 0);
});

test('streamed drawing segments retain enough strokes for a full turn', () => {
  let state = skribble.createInitialState({ seed: 1 }, 2);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;

  for (let i = 0; i < 420; i += 1) {
    const x = (i % 100) / 100;
    const nextX = ((i + 1) % 100) / 100;
    state = skribble.applyMove(state, 0, {
      type: 'stroke',
      color: '#18151c',
      size: 5,
      points: [{ x, y: 0.2 }, { x: nextX, y: 0.21 }],
    }).state;
  }

  assert.equal(state.strokes.length, 420);
});

test('wrong guesses are chat messages and correct guesses score', () => {
  let state = skribble.createInitialState({ seed: 7 }, 3);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;
  const answer = state.secret.word;

  state = skribble.applyMove(state, 1, { type: 'guess', text: 'not it' }).state;
  assert.equal(state.chat.at(-1).text, 'not it');
  assert.equal(state.scores[1], 0);

  state = skribble.applyMove(state, 1, { type: 'guess', text: answer.toUpperCase() }).state;
  assert.equal(state.chat.at(-1).correct, true);
  assert.equal(state.chat.at(-1).text, undefined);
  assert.equal(state.scores[1], 100);
  assert.equal(state.scores[state.drawer], 35);
  assert.equal(state.guessed[1], true);
  assert.equal(skribble.applyMove(state, 1, { type: 'guess', text: answer }).error, 'You already guessed this word.');
});

test('timer changes between choosing and drawing phases', () => {
  let state = skribble.createInitialState({ seed: 5 }, 2);
  assert.equal(skribble.turnTimeoutMs(state), 20000);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;
  assert.equal(skribble.turnTimeoutMs(state), 90000);
});

test('advances to the next drawer when all guessers are correct', () => {
  let state = skribble.createInitialState({ seed: 9, rounds: 1 }, 2);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;
  const firstWord = state.secret.word;
  state = skribble.applyMove(state, 1, { type: 'guess', text: firstWord }).state;

  assert.equal(state.drawer, 1);
  assert.equal(state.turnNo, 1);
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'choosing');
  assert.equal(state.secret.word, null);
  assert.equal(state.strokes.length, 0);
});

test('timeout advances turns and ends after the final drawer', () => {
  let state = skribble.createInitialState({ seed: 11, rounds: 1 }, 2);
  state = skribble.onTimeout(state).state;
  assert.equal(state.phase, 'drawing');
  assert.equal(state.drawer, 0);

  state = skribble.onTimeout(state).state;
  assert.equal(state.phase, 'choosing');
  assert.equal(state.drawer, 1);

  state = skribble.onTimeout(state).state;
  assert.equal(state.phase, 'drawing');
  assert.equal(state.drawer, 1);

  state = skribble.onTimeout(state).state;
  assert.equal(state.phase, 'over');
  assert.deepEqual(skribble.getResult(state), { over: true, winner: null, draw: true, scores: [0, 0] });
});

test('room snapshots are tailored per player for hidden words', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const a = createUser(`skribble_a_${suffix}`, 'x');
  const b = createUser(`skribble_b_${suffix}`, 'x');
  const created = createRoom('skribble', { seed: 123, rounds: 1 }, [a.id, b.id]);
  assert.equal(created.error, undefined);
  const drawerRoom = getRoomForUser(created.room.id, a.id);
  const guesserRoom = getRoomForUser(created.room.id, b.id);

  assert.equal(drawerRoom.state.word, null);
  assert.equal(drawerRoom.state.choices.length, 3);
  assert.equal(guesserRoom.state.word, null);
  assert.deepEqual(guesserRoom.state.choices, []);

  const picked = makeMove(created.room.id, a.id, { type: 'chooseWord', word: drawerRoom.state.choices[0] });
  assert.equal(picked.error, undefined);
  const firstWord = picked.rooms.get(a.id).state.word;
  assert.equal(picked.rooms.get(b.id).state.word, null);

  const moved = makeMove(created.room.id, b.id, { type: 'guess', text: firstWord });
  assert.equal(moved.error, undefined);
  assert.equal(moved.rooms.get(a.id).state.word, null);
  assert.equal(moved.rooms.get(b.id).state.word, null);
  assert.equal(moved.rooms.get(b.id).state.choices.length, 3);
});

test('a full drawing turn of nonstop strokes never loses its earliest lines', () => {
  // The client streams ~14 segments/sec; a 90s turn can produce ~1300. The
  // stroke cap must hold a whole turn so drawings don't erase themselves.
  let state = skribble.createInitialState({ seed: 7 }, 2);
  state = skribble.applyMove(state, 0, { type: 'chooseWord', word: state.secret.choices[0] }).state;
  const seg = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }];
  for (let i = 0; i < 1300; i += 1) {
    state = skribble.applyMove(state, 0, { type: 'stroke', points: seg }).state;
  }
  assert.equal(state.strokes.length, 1300, 'every segment of the turn is retained');
});
