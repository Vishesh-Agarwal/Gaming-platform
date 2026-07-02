import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

test('Battleship ship sprites are clipped to their logical grid span', () => {
  assert.match(ruleFor('.bs-vessel'), /overflow:\s*hidden/);
  assert.match(ruleFor('.bs-vessel-img'), /position:\s*absolute/);
  assert.match(ruleFor('.bs-vessel-img'), /inset:\s*0/);
  assert.match(ruleFor('.bs-vessel-img'), /object-fit:\s*fill/);
});

test('Battleship targeted cells glow after being fired on', () => {
  assert.match(ruleFor('.bs-cell.targeted'), /box-shadow:/);
  assert.match(ruleFor('.bs-cell.targeted::before'), /animation:\s*bs-target-glow/);
  assert.match(css, /@keyframes\s+bs-target-glow/);
});
