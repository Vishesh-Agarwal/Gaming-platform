import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const c4 = readFileSync(new URL('../src/games/ConnectFour.jsx', import.meta.url), 'utf8');

function section(name) {
  const start = css.indexOf(`/* ---- ${name} ----`);
  assert.ok(start >= 0, `missing CSS section ${name}`);
  const end = css.indexOf('/* ---- ', start + 10);
  return css.slice(start, end === -1 ? css.length : end);
}

test('connect four: discs fall from above the board with a gravity bounce', () => {
  // the landing cell carries how far the disc fell so the animation is distance-aware
  assert.match(c4, /--fall-cells/);
  const sec = section('Connect Four');
  assert.match(sec, /var\(--fall-cells/);
  assert.match(sec, /@keyframes c4-drop/);
  assert.match(sec, /overflow: hidden/); // the column clips the disc while it falls in
});

test('connect four: lacquer cabinet with sheen and deep punched wells', () => {
  const sec = section('Connect Four');
  assert.match(sec, /repeating-linear-gradient/); // vertical gloss sheen on the panel
  const board = sec.slice(sec.indexOf('.c4-board {'), sec.indexOf('.c4-col {'));
  assert.ok((board.match(/gradient/g) || []).length >= 3, 'board should layer several gradients');
});

test('checkers: wood board with lacquered ridged pieces and crowned kings', () => {
  const sec = section('Checkers');
  assert.match(sec, /repeating-linear-gradient/); // wood grain on the squares
  assert.match(sec, /repeating-conic-gradient/); // ridged piece rims
  assert.match(sec, /@keyframes chk-settle/); // pieces settle in when placed
  assert.match(sec, /\.chk-piece\.king|\.chk-piece b/); // crowned king styling
});
