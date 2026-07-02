import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme'));

test('default theme is the premium-console palette (cool near-black, blue accent)', () => {
  assert.match(root, /--bg:\s*#0a0d14/);
  assert.match(root, /--surface:\s*#12182a/);
  assert.match(root, /--blue:\s*#6c8cff/);
  assert.match(root, /--accent:\s*var\(--blue\)/);
  assert.match(root, /--panel-blur:\s*14px/);
  assert.match(root, /--glow:/);
});

test('legacy token names survive so existing rules keep resolving', () => {
  for (const name of ['--amber', '--teal', '--coral', '--green', '--red', '--grad', '--shadow-2', '--display']) {
    assert.match(root, new RegExp(`${name}:`), `${name} missing from :root`);
  }
});

test('light and arcade overrides define the blue accent too', () => {
  const light = css.slice(css.indexOf(":root[data-theme='light']"), css.indexOf(":root[data-theme='arcade']"));
  const arcade = css.slice(css.indexOf(":root[data-theme='arcade']"), css.indexOf('* { box-sizing'));
  assert.match(light, /--blue:/);
  assert.match(arcade, /--blue:/);
});
