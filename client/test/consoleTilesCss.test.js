import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/GameCard.jsx', import.meta.url), 'utf8');

test('game tiles are tall key-art tiles with a cinematic accent scene', () => {
  assert.match(css, /\.game-card\s*{[^}]*aspect-ratio:\s*3\s*\/\s*4/s);
  assert.match(css, /\.game-art\s*{[^}]*var\(--card-accent\)/s);
  assert.match(css, /\.game-card:hover[^{]*{[^}]*--glow/s);
});

test('tile info bar is a glass panel with name + chips', () => {
  assert.match(card, /className="game-tile-info"/);
  assert.match(card, /className="game-tile-chips"/);
  assert.match(css, /\.game-tile-info\s*{[^}]*backdrop-filter/s);
});
