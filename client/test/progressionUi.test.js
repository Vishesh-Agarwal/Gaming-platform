import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const home = read('../src/pages/Home.jsx');
const lobby = read('../src/pages/Lobby.jsx');
const game = read('../src/pages/Game.jsx');
const css = read('../src/styles.css');
const api = read('../src/api.js');

test('home subscribes to progression and fetches it on mount', () => {
  assert.match(home, /progression:update/);
  assert.match(api, /\/api\/progression\/me/);
  assert.match(api, /\/api\/leaderboard/);
});

test('header shows a level chip with an XP ring', () => {
  assert.match(lobby, /className="level-chip/);
  assert.match(css, /\.level-chip\s*{/);
  assert.match(css, /\.xp-ring\s*{[^}]*conic-gradient/s);
});

test('podium fills the progression slot with XP + level-up + achievements', () => {
  assert.match(game, /podium-xp/);
  assert.match(game, /level-up/);
  assert.match(css, /\.podium-progression\s*{/);
});

test('home shows the daily challenges rail', () => {
  assert.match(lobby, /className={`challenge-card/);
  assert.match(css, /\.challenge-bar\s*{/);
});

test('profile lists earned achievement badges', () => {
  assert.match(lobby, /badge-tile/);
});

test('achievement metadata mirror stays aligned with the server catalog', () => {
  const clientMeta = read('../src/achievementMeta.js');
  const serverCatalog = read('../../server/src/achievements.js');
  const clientIds = [...clientMeta.matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  const serverIds = [...serverCatalog.matchAll(/\{ id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(clientIds.sort(), serverIds.sort());
});
