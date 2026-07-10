import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skribble = readFileSync(new URL('../src/games/Skribble.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('skribble uses a persistent players-board-chat game table', () => {
  assert.match(skribble, /skrib-players/);
  assert.match(skribble, /skrib-board/);
  assert.match(skribble, /skrib-chat-panel/);
  assert.match(skribble, /skrib-chat-title/);
  assert.match(skribble, /skrib-rank/);
  assert.match(skribble, /skrib-avatar/);
  assert.match(skribble, /skrib-score-meta/);

  assert.match(css, /\.skrib\s*\{[\s\S]*grid-template-columns:\s*190px minmax\(0,\s*1fr\) 300px/);
  assert.match(css, /\.skrib-chat-panel\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(css, /\.skrib-chat-log\s*\{[\s\S]*min-height:\s*360px/);
  assert.match(css, /\.skrib-board\s*\{[\s\S]*background:\s*#f7f7f7/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.skrib\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

test('skribble streams drawing while the pointer is still down', () => {
  assert.match(skribble, /STREAM_POINTS/);
  assert.match(skribble, /flushDraftSegment/);
  assert.match(skribble, /lastFlushAt/);
  assert.doesNotMatch(skribble, /slice\(-160\)/);
});

test('skribble plays landscape on mobile with canvas and chat side by side', () => {
  const meta = readFileSync(new URL('../src/games/gameMeta.js', import.meta.url), 'utf8');
  assert.match(meta, /requiresLandscape\(gameId\)[\s\S]*'skribble'/);
  assert.match(css, /\.landscape-game-page \.skrib \{/);
  assert.match(css, /\.landscape-game-page \.skrib-chat-log/);
});

test('drawing never starts a native selection drag (page auto-scroll while stroking)', () => {
  // Without preventDefault, mousedown on the canvas starts a text-selection
  // drag; holding the stroke past the canvas edge then auto-scrolls the page.
  assert.match(skribble, /const startStroke = \(event\) => \{\s*if \(!canDraw\) return;[\s\S]{0,220}?event\.preventDefault\(\);[\s\S]{0,120}?setPointerCapture/);
  // Sibling drag surfaces (pool stick, karts controls) pair touch-action with
  // user-select — the skribble canvas needs both too.
  assert.match(css, /\.skrib-canvas\s*\{[^}]*touch-action:\s*none/);
  assert.match(css, /\.skrib-canvas\s*\{[^}]*user-select:\s*none/);
});
