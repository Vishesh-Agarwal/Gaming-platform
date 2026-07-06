import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');

test('game page carries the per-game accent colour as a CSS variable', () => {
  assert.match(game, /--game-accent/);
  assert.match(game, /def\.accent/);
});

test('an ambient accent glow + vignette sits behind the board', () => {
  const start = css.indexOf('/* ---- Game page ----');
  const sec = css.slice(start, css.indexOf('.game-header {'));
  assert.match(sec, /\.game-page::before/);
  assert.match(sec, /--game-accent/);
  assert.match(sec, /radial-gradient/);
  // the backdrop must not sit on top of the interactive board
  assert.match(sec, /pointer-events:\s*none/);
  assert.match(sec, /z-index:\s*0/);
});
