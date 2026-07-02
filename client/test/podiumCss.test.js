import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');

test('post-match overlay is a podium with ranked steps', () => {
  assert.match(game, /className={`podium-step/);
  assert.match(css, /\.podium\s*{[^}]*align-items:\s*flex-end/s);
  assert.match(css, /\.podium-step\.first\s+\.podium-block\s*{[^}]*var\(--amber\)/s);
});

test('podium keeps the rematch flow and reserves the progression slot', () => {
  assert.match(game, /podium-progression/);
  assert.match(game, /onRematch/);
});

test('overlay card is a glass panel', () => {
  assert.match(css, /\.overlay-card\s*{[^}]*backdrop-filter/s);
});
