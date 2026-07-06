import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const ttt = readFileSync(new URL('../src/games/TicTacToe.jsx', import.meta.url), 'utf8');

test('tic-tac-toe: marks are stroke-drawn SVGs, not text glyphs', () => {
  assert.match(ttt, /function Mark\(/);
  assert.match(ttt, /pathLength="100"/); // normalizes dash animation across shapes
  assert.match(css, /@keyframes ttt-draw/);
  assert.match(css, /stroke-dashoffset/);
});

test('tic-tac-toe: winning line sweeps across the board as a laser', () => {
  assert.match(ttt, /ttt-winline/);
  assert.match(css, /\.ttt-winline/);
  assert.match(css, /@keyframes ttt-laser/);
});

test('dots & boxes: blueprint sheet with drawn lines and hatched claims', () => {
  const start = css.indexOf('/* ---- Dots and Boxes ----');
  const sec = css.slice(start, css.indexOf('/* ---- ', start + 10));
  assert.ok((sec.match(/repeating-linear-gradient/g) || []).length >= 3, 'graph grid + hatch fills');
  assert.match(sec, /@keyframes dbx-draw/); // taken edges draw themselves
  assert.match(sec, /transform-origin/); // lines grow from their start
  assert.match(sec, /@keyframes dbx-claim/); // boxes pop when claimed
});
