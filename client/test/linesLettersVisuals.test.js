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

test('word duel: scored rows flip like tile reveals and keys press down', () => {
  assert.match(css, /@keyframes wd-flip/);
  assert.match(css, /rotateX/);
  assert.match(css, /\.wd-tile[^{]*nth-child\(2\)/); // staggered cascade across the row
  assert.match(css, /\.wd-key:active/);
});

test('boggle: wooden tray shakes on deal, dice are engraved cubes, finds pop', () => {
  const start = css.indexOf('/* ---- Boggle Race ----');
  const sec = css.slice(start, css.indexOf('/* ---- ', start + 10));
  assert.match(sec, /@keyframes bog-shake/); // tray shake when the board appears
  assert.match(sec, /@keyframes bog-found-pop/);
  const tile = sec.slice(sec.indexOf('.bog-tile {'));
  assert.match(tile, /text-shadow/); // engraved letters
  assert.match(sec, /repeating-linear-gradient/); // wood tray grain
});
