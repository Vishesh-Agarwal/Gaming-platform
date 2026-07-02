import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('mobile game boards and controls have phone-specific layouts', () => {
  assert.match(css, /\.ttt-board\s*\{[\s\S]*width:\s*min\(92vw,\s*330px\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.hm-keyboard\s*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.ludo-table\s*\{[\s\S]*padding:\s*52px 4px 88px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.art-console\s*\{[\s\S]*padding:\s*10px/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.skrib-canvas\s*\{[\s\S]*aspect-ratio:\s*1 \/ 1/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.code-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.uno-hand\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.carrom-controls,\s*\.pool-controls\s*\{[\s\S]*display:\s*grid/);
});
