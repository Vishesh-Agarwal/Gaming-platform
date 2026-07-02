import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const game = readFileSync(new URL('../src/games/GhostRider.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Ghost Rider uses forgiving stability instead of instant fragile crashes', () => {
  assert.match(game, /stability/i);
  assert.match(game, /damageLanding/);
  assert.match(game, /recoverStability/);
  assert.match(game, /bikeHealth/i);
});

test('Ghost Rider renders richer bike motion and road effects', () => {
  assert.match(game, /particles/);
  assert.match(game, /emitDust/);
  assert.match(game, /drawExhaustTrail/);
  assert.match(game, /suspension/i);
  assert.match(game, /drawHeadlight/);
});

test('Ghost Rider exposes compact HUD and mobile thumb controls', () => {
  assert.match(game, /gr-hud/);
  assert.match(game, /gr-hud__value/);
  assert.match(game, /gr-thumb-controls/);
  assert.match(css, /\.gr-hud/);
  assert.match(css, /\.gr-thumb-controls/);
  assert.match(css, /\.landscape-game-page \.gr-thumb-controls/);
});
