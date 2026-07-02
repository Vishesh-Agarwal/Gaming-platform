import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const microChess = readFileSync(new URL('../src/games/MicroChess.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('micro chess renders chess glyphs instead of letter labels', () => {
  assert.match(microChess, /pieceGlyph/);
  assert.match(microChess, /white:\s*'♔'/);
  assert.match(microChess, /black:\s*'♚'/);
  assert.match(microChess, /aria-label=\{pieceName\(piece\)\}/);
  assert.doesNotMatch(microChess, /labels\s*=\s*\{\s*king:\s*'K'/);
});

test('micro chess piece styling supports real chess glyphs', () => {
  assert.match(css, /\.mc-piece-glyph/);
  assert.match(css, /font-family:\s*Georgia,\s*'Times New Roman',\s*serif/);
  assert.match(css, /line-height:\s*1/);
});

test('micro chess board keeps a stable size before and after moves', () => {
  assert.match(css, /\.mc-board\s*\{[\s\S]*width:\s*min\(92vw,\s*560px\)/);
  assert.doesNotMatch(css, /\.mc-board\s*\{[\s\S]*width:\s*min\(76vh/);
  assert.match(css, /\.mc-board\s*\{[\s\S]*grid-template-rows:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.mc\s+\.move-tray\s*\{[\s\S]*min-height:\s*40px/);
  assert.match(css, /\.mc\s+\.history-strip\s*\{[\s\S]*min-height:\s*32px/);
  assert.match(css, /\.mc\s+\.history-strip\s*\{[\s\S]*overflow:\s*hidden/);
});
