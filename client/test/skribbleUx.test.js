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
