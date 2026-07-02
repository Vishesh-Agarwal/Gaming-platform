import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../src/components/HeroBanner.jsx', import.meta.url), 'utf8');
const lobby = readFileSync(new URL('../src/pages/Lobby.jsx', import.meta.url), 'utf8');

test('hero banner: cinematic accent backdrop with kicker, title, and CTAs', () => {
  assert.match(hero, /className="hero-banner"/);
  assert.match(hero, /className="hero-kicker"/);
  assert.match(hero, /className="hero-actions"/);
  assert.match(css, /\.hero-banner\s*{[^}]*--card-accent/s);
  assert.match(css, /\.hero-banner\s*{[^}]*border-radius/s);
});

test('home renders hero + continue-playing rail above the games grid', () => {
  assert.match(lobby, /<HeroBanner/);
  assert.match(lobby, /className="home-rail"/);
  assert.match(css, /\.rail-scroll\s*{[^}]*overflow-x:\s*auto/s);
});

test('rails collapse to a single column hero on mobile', () => {
  assert.match(css, /@media[^{]*max-width[^{]*{[^]*?\.hero-banner\s*{[^}]*grid-template-columns:\s*1fr/);
});

test('topbar is a glass console header', () => {
  assert.match(css, /\.topbar\s*{[^}]*backdrop-filter:\s*blur\(var\(--panel-blur\)\)/s);
});
