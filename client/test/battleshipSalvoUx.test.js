import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { requiresLandscape } from '../src/games/gameMeta.js';

const game = readFileSync(new URL('../src/games/Battleship.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('battleship plays in landscape on mobile', () => {
  assert.equal(requiresLandscape('battleship'), true);
  assert.match(css, /\.landscape-game-page \.bs-theater/);
});

test('salvo mode selects targets then fires them as one move', () => {
  assert.match(game, /state\.mode === 'salvo'/);
  assert.match(game, /type: 'salvo', cells/);
  assert.match(game, /Fire salvo/);
  assert.match(game, /pending/);
  assert.match(css, /\.bs-cell\.pending/);
});

test('salvo results highlight every cell of the last volley', () => {
  assert.match(game, /lastShot\.salvo/);
});
