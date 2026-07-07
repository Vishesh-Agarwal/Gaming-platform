import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');

test('Home listens for game:peer and clears peer state on start/over', () => {
  assert.match(home, /socket\.on\('game:peer'/);
  assert.match(home, /setPeer/);
  assert.match(home, /peer=\{peer\}/); // passed to <Game>
});

test('Game renders an opponent-disconnected banner from the peer prop', () => {
  assert.match(game, /peer/); // prop in the signature
  assert.match(game, /game-peer-banner/);
});
