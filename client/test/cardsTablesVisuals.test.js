import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function section(name) {
  const start = css.indexOf(`/* ---- ${name} ----`);
  assert.ok(start >= 0, `missing CSS section ${name}`);
  const end = css.indexOf('/* ---- ', start + 10);
  return css.slice(start, end === -1 ? css.length : end);
}

test('uno: casino felt table, glossy oval-badge cards, hand hover-lift', () => {
  const sec = section('Color Cards');
  // felt: radial lamp + repeating weave on the table
  const table = sec.slice(sec.indexOf('.uno-table {'), sec.indexOf('.uno-card {'));
  assert.match(table, /repeating-linear-gradient/);
  // card face: the classic white oval + corner index depth
  const card = sec.slice(sec.indexOf('.uno-card {'));
  assert.match(sec, /\.uno-card::before/); // white oval badge
  assert.match(card, /transition/); // smooth hover
  assert.match(sec, /\.uno-hand \.uno-card:hover/); // hand cards lift on hover
  assert.match(sec, /translateY\(-/);
});

test('uno: freshly played card flies onto the discard pile', () => {
  const sec = section('Color Cards');
  assert.match(sec, /@keyframes uno-play/);
  assert.match(sec, /\.uno-pile \.uno-card/);
});

test('codenames: card-table felt, paper agent cards that flip on reveal', () => {
  const sec = section('Codenames Lite');
  const grid = sec.slice(sec.indexOf('.code-grid {'), sec.indexOf('.code-card {'));
  assert.match(grid, /perspective/); // gives the flip depth
  const card = sec.slice(sec.indexOf('.code-card {'));
  assert.match(card, /repeating-linear-gradient|repeating-radial-gradient/); // paper stock grain
  assert.match(sec, /@keyframes code-flip/);
  assert.match(sec, /rotateY/);
});

test('hangman: chalkboard slate stage with chalk tiles and slate keys', () => {
  const sec = section('Hangman');
  const stage = sec.slice(sec.indexOf('.hm-stage {'), sec.indexOf('.hm-stage {') + 600);
  assert.match(stage, /repeating-radial-gradient|repeating-linear-gradient|radial-gradient/); // slate + chalk dust
  const tile = sec.slice(sec.indexOf('.hm-tile {'));
  assert.match(tile, /text-shadow/); // chalky letter bloom
  assert.match(sec, /--chalk|#e8f0e8|#eef4ee/i); // chalk colour token/value
});
