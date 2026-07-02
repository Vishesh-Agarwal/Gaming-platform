# Shell Console Visuals (A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the platform shell (tokens, Home, game tiles, party screen, game chrome/post-match) into the approved "premium console" look — deep cool darks, glassy panels, cinematic per-game gradients, key-art tiles, hero banner, podium end screen.

**Architecture:** Evolve in place. All styling lives in `client/src/styles.css` token themes; we replace the default theme's token values (keeping token *names* so 5,600 existing lines keep working), then restructure `GameCard`, the Lobby home area (hero + rails), `LobbyModal` (party screen), and the `Game` post-match overlay (podium). Pure helpers for rail data go in a new `client/src/homeRails.js`. Progression UI hooks (level chip, podium XP stage) render only when progression data exists — A2 supplies it; A1 ships them dormant.

**Tech Stack:** React 18 + Vite, single styles.css with `:root` token themes (`default`/`light`/`arcade`), `node:test` for unit/CSS-assertion tests, Playwright for e2e.

## Global Constraints

- No external assets: no CDN fonts/images — all art is inline SVG/CSS (fonts Inter + Chakra Petch are already self-hosted/loaded; do not add more).
- Keep existing token *names* (`--bg`, `--surface`, `--amber`, `--teal`, `--grad`, …) so existing rules inherit the new palette; add new tokens rather than renaming.
- `light` and `arcade` themes must keep working (they are token overrides).
- Do not change the lazy-load of Karts in `client/src/games/registry.js` (Three.js chunk isolation).
- Client tests run with: `node --test client/test/`. Server tests: `npm test --prefix server`.
- Commit after every green task.

## File Structure

- `client/src/styles.css` — token rework + new component rules (tiles, hero, rails, party screen, podium).
- `client/src/components/GameCard.jsx` — premium key-art tile.
- `client/src/components/HeroBanner.jsx` — NEW: featured-game banner.
- `client/src/homeRails.js` — NEW: pure helpers (`pickFeaturedGame`, `recentGameIds`).
- `client/src/pages/Home.jsx` — fetch stats on mount (feeds hero/rails).
- `client/src/pages/Lobby.jsx` — console header + hero + rails layout.
- `client/src/components/LobbyModal.jsx` — party-screen slots.
- `client/src/pages/Game.jsx` — podium end screen.
- Tests: `client/test/consoleThemeCss.test.js`, `client/test/consoleTilesCss.test.js`, `client/test/homeRails.test.js`, `client/test/heroRailsCss.test.js`, `client/test/partyScreenCss.test.js`, `client/test/podiumCss.test.js`.

---

### Task 1: Console theme tokens

**Files:**
- Modify: `client/src/styles.css:1-118` (the `:root` block, theme overrides, body backdrop)
- Test: `client/test/consoleThemeCss.test.js`

**Interfaces:**
- Produces: new tokens available everywhere: `--blue` (platform accent), `--glow` (accent glow shadow), `--panel-blur` (blur radius). `--accent` becomes `var(--blue)`. Existing token names unchanged.

- [ ] **Step 1: Write the failing test**

```js
// client/test/consoleThemeCss.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/consoleThemeCss.test.js`
Expected: FAIL (`--bg: #0a0d14` not found).

- [ ] **Step 3: Replace the default theme tokens**

Replace the `:root` block's palette (keep the structure and every existing token name; values change; new tokens added):

```css
:root {
  /* Premium console — cool near-black surfaces, glassy panels, electric blue
     accent, restrained glow reserved for interactive states. */
  --bg: #0a0d14;            /* near-black cool base */
  --bg-soft: #0e1220;       /* gentle vignette tone */
  --surface: #12182a;       /* raised card/panel */
  --surface-2: #1a2138;     /* hover / nested surface */
  --panel: rgba(18, 24, 42, 0.62);
  --panel-solid: #12182a;
  --border: rgba(148, 170, 255, 0.10);
  --border-strong: rgba(148, 170, 255, 0.22);
  --glass: rgba(148, 170, 255, 0.05);
  --text: #edf1fc;
  --muted: #8e99b8;

  --blue: #6c8cff;          /* platform accent */
  --amber: #f5b452;
  --teal: #38d4c0;
  --coral: #ff7d68;
  --green: #52d489;
  --red: #ff5c74;
  --accent: var(--blue);

  --shadow-1: 0 1px 2px rgba(2, 4, 10, 0.5), 0 2px 6px rgba(2, 4, 10, 0.4);
  --shadow-2: 0 6px 16px rgba(2, 4, 10, 0.55), 0 2px 4px rgba(2, 4, 10, 0.45);
  --shadow-3: 0 18px 44px rgba(2, 4, 10, 0.65), 0 6px 14px rgba(2, 4, 10, 0.5);
  --glow: 0 0 0 1px rgba(108, 140, 255, 0.35), 0 0 24px rgba(108, 140, 255, 0.25);
  --panel-blur: 14px;

  /* legacy colour-named aliases so existing rules adopt the console palette */
  --cyan: var(--teal);
  --purple: var(--blue);
  --pink: var(--coral);

  --grad: linear-gradient(120deg, #6c8cff, #38d4c0);
  --grad-2: linear-gradient(125deg, #8ea4ff, #5f79ff);
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --display: 'Chakra Petch', var(--font);
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.4, 1);
  --dur: 0.18s;
}
```

Add `--blue` to both overrides: in `:root[data-theme='light']` add `--blue: #3757d6;` and in `:root[data-theme='arcade']` add `--blue: #4df4ff;`. Update the body backdrop gradients to the cool palette:

```css
body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  min-height: 100vh;
  background:
    radial-gradient(1100px 720px at 18% -10%, rgba(108, 140, 255, 0.10), transparent 60%),
    radial-gradient(1000px 760px at 100% 8%, rgba(56, 212, 192, 0.06), transparent 58%),
    linear-gradient(180deg, #0d1120, var(--bg) 60%);
  background-attachment: fixed;
}
```

(Keep the `body::before` / `body::after` texture layers as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test client/test/consoleThemeCss.test.js` → PASS.
Then run the whole client suite to catch regressions in existing CSS assertions: `node --test client/test/` — existing tests that asserted old *palette values* (not names) may fail; update only assertions about theme colour values, never weaken structural/UX assertions.

- [ ] **Step 5: Visual sanity check**

Start the app (`npm run dev`, client on :5173 — beware the stale-server-on-:3001 gotcha) and eyeball Home in default/light/arcade themes.

- [ ] **Step 6: Commit**

```bash
git add client/src/styles.css client/test/consoleThemeCss.test.js
git commit -m "Shell A1: premium-console default theme tokens"
```

---

### Task 2: Premium key-art game tiles

**Files:**
- Modify: `client/src/components/GameCard.jsx`
- Modify: `client/src/styles.css` (`.game-card` family)
- Test: `client/test/consoleTilesCss.test.js`

**Interfaces:**
- Consumes: registry entries (`game.accent`, `game.thumbnail`, `game.modes`) and existing handlers `onClick(game)`, `onQuickPlay(game)`.
- Produces: tile DOM contract used by CSS + tests: `.game-card > .game-art > (thumb svg, .game-art-glow, .play-cta, .quick-cta)` and `.game-card > .game-tile-info > (.game-tile-name, .game-tile-chips)`.

- [ ] **Step 1: Write the failing test**

```js
// client/test/consoleTilesCss.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/GameCard.jsx', import.meta.url), 'utf8');

test('game tiles are tall key-art tiles with a cinematic accent scene', () => {
  assert.match(css, /\.game-card\s*{[^}]*aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(css, /\.game-art\s*{[^}]*background:[^}]*var\(--card-accent\)/s);
  assert.match(css, /\.game-card:hover[^{]*{[^}]*--glow/s);
});

test('tile info bar is a glass panel with name + chips', () => {
  assert.match(card, /className="game-tile-info"/);
  assert.match(card, /className="game-tile-chips"/);
  assert.match(css, /\.game-tile-info\s*{[^}]*backdrop-filter/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/consoleTilesCss.test.js` → FAIL.

- [ ] **Step 3: Restructure GameCard.jsx**

Keep the pointer-parallax handlers, `role="button"`, keyboard handler, and Quick Play behavior exactly as they are. Replace the returned JSX below the handlers with:

```jsx
return (
  <div
    ref={ref}
    className="game-card"
    role="button"
    tabIndex={0}
    style={{ '--card-accent': game.accent || 'var(--accent)' }}
    onClick={() => onClick(game)}
    onKeyDown={onCardKeyDown}
    onMouseMove={onMove}
    onMouseLeave={reset}
  >
    <div className="game-art">
      {Thumb ? <Thumb /> : <div className="game-thumb-fallback">🎮</div>}
      <span className="game-art-glow" aria-hidden />
      <span className="play-cta">▶ Play</span>
      {onQuickPlay && (
        <button
          type="button"
          className={`quick-cta${searching ? ' searching' : ''}`}
          disabled={searching}
          title={searching ? 'Searching for players' : 'Match with anyone online'}
          onClick={(e) => { e.stopPropagation(); if (!searching) onQuickPlay(game); }}
        >
          {searching ? 'Searching…' : 'Quick Play'}
        </button>
      )}
    </div>
    <div className="game-tile-info">
      <span className="game-tile-name">{game.name}</span>
      <span className="game-tile-chips">
        <span className="tile-chip">{playerCountLabel(game)}</span>
        {summary && <span className="tile-chip">{summary}</span>}
      </span>
    </div>
  </div>
);
```

(If the current file renders extra elements — mode lists, rules text — inside the card, drop them; the tile is art + info bar only. The invite flow modal still shows details.)

- [ ] **Step 4: Restyle the tile in styles.css**

Replace the `.game-card` / `.game-thumb` rule family (search for `.game-card` and `.game-thumb`) with the key-art treatment. Rename `.game-thumb` rules to `.game-art`; grep for other `.game-thumb` usages first (`grep -n "game-thumb" client/src -r`) and keep `.game-thumb-fallback`. Core rules:

```css
.game-card {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  cursor: pointer;
  transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transition: box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease);
  display: flex;
  flex-direction: column;
}
.game-card:hover, .game-card:focus-visible {
  border-color: color-mix(in srgb, var(--card-accent) 55%, transparent);
  box-shadow: var(--shadow-3), var(--glow);
}
.game-art {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 14%;
  background:
    radial-gradient(120% 90% at var(--mx, 50%) var(--my, 20%),
      color-mix(in srgb, var(--card-accent) 34%, transparent), transparent 70%),
    linear-gradient(165deg,
      color-mix(in srgb, var(--card-accent) 26%, #0c1020),
      #0b0f1c 72%);
}
.game-art svg { width: 100%; height: 100%; filter: drop-shadow(0 10px 22px rgba(2, 4, 10, 0.55)); }
.game-art-glow {
  position: absolute; inset: auto 0 0 0; height: 55%;
  background: linear-gradient(180deg, transparent, rgba(2, 4, 10, 0.55));
  pointer-events: none;
}
.game-tile-info {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px;
  background: var(--panel);
  backdrop-filter: blur(var(--panel-blur));
  border-top: 1px solid var(--border);
}
.game-tile-name { font-family: var(--display); font-weight: 700; letter-spacing: 0.02em; }
.game-tile-chips { display: flex; gap: 6px; }
.tile-chip {
  font-size: 11px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px;
  white-space: nowrap;
}
```

Keep/adapt the existing `.play-cta` and `.quick-cta` rules so they overlay `.game-art` (they previously overlaid `.game-thumb`; update those selectors). Update the games grid to fit taller tiles (find `.games-grid`): `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px;`.

- [ ] **Step 5: Run tests, fix fallout**

Run: `node --test client/test/` — update any existing tests that assert `.game-thumb` structure (e.g. `gameMeta.test.js` or css tests) to the new class names only where the assertion was purely structural.

- [ ] **Step 6: Visual check + commit**

Eyeball the grid at desktop + 390px-wide mobile viewport.

```bash
git add client/src/components/GameCard.jsx client/src/styles.css client/test/consoleTilesCss.test.js
git commit -m "Shell A1: premium key-art game tiles"
```

---

### Task 3: Home rail helpers (featured pick + recents)

**Files:**
- Create: `client/src/homeRails.js`
- Modify: `client/src/pages/Home.jsx` (fetch stats on mount, pass to Lobby)
- Test: `client/test/homeRails.test.js`

**Interfaces:**
- Consumes: `api.getStats(token)` → `{ stats: [{gameId, played, wins, ...}], recent: [{gameId, created_at, ...}] }` (existing endpoint `/api/stats/me`).
- Produces:
  - `pickFeaturedGame(registryIds, stats, daySeed)` → gameId. Most-played game if any stats; otherwise deterministic daily rotation `registryIds[daySeed % registryIds.length]`.
  - `recentGameIds(recent, registryIds, limit = 6)` → deduped gameIds, most recent first, only ids present in the registry.

- [ ] **Step 1: Write the failing test**

```js
// client/test/homeRails.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { pickFeaturedGame, recentGameIds } from '../src/homeRails.js';

const ids = ['pool', 'karts', 'uno'];

test('featured game is the most-played game when stats exist', () => {
  const stats = [
    { gameId: 'uno', played: 3 },
    { gameId: 'pool', played: 9 },
  ];
  assert.equal(pickFeaturedGame(ids, stats, 5), 'pool');
});

test('featured game rotates daily (deterministic) with no stats', () => {
  assert.equal(pickFeaturedGame(ids, [], 4), ids[4 % 3]);
  assert.equal(pickFeaturedGame(ids, null, 4), ids[4 % 3]);
});

test('featured falls back to rotation when the most-played id is not in the registry', () => {
  assert.equal(pickFeaturedGame(ids, [{ gameId: 'gone', played: 5 }], 1), 'karts');
});

test('recent rail dedupes, keeps order, filters unknown ids, and caps at limit', () => {
  const recent = [
    { gameId: 'uno' }, { gameId: 'pool' }, { gameId: 'uno' },
    { gameId: 'ghost' }, { gameId: 'karts' },
  ];
  assert.deepEqual(recentGameIds(recent, ids, 2), ['uno', 'pool']);
  assert.deepEqual(recentGameIds(recent, ids), ['uno', 'pool', 'karts']);
  assert.deepEqual(recentGameIds(null, ids), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/homeRails.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement homeRails.js**

```js
// Pure helpers for the Home rails: which game to feature in the hero and
// which games go in the "Continue playing" rail. Kept UI-free for testing.
export function pickFeaturedGame(registryIds = [], stats = [], daySeed = 0) {
  const rows = Array.isArray(stats) ? stats.filter((s) => registryIds.includes(s.gameId)) : [];
  if (rows.length) {
    return rows.reduce((top, s) => (s.played > top.played ? s : top), rows[0]).gameId;
  }
  if (!registryIds.length) return null;
  return registryIds[Math.abs(daySeed) % registryIds.length];
}

export function recentGameIds(recent = [], registryIds = [], limit = 6) {
  const out = [];
  for (const m of Array.isArray(recent) ? recent : []) {
    if (registryIds.includes(m.gameId) && !out.includes(m.gameId)) out.push(m.gameId);
    if (out.length >= limit) break;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test client/test/homeRails.test.js` → PASS.

- [ ] **Step 5: Load stats on mount in Home.jsx**

In `Home.jsx`, after the socket-connection `useEffect`, add a stats prefetch (reuses existing `stats` state; `onShowStats` keeps refreshing it):

```jsx
useEffect(() => {
  if (!token) return;
  api.getStats(token).then(setStats).catch(() => {});
}, [token]);
```

- [ ] **Step 6: Commit**

```bash
git add client/src/homeRails.js client/test/homeRails.test.js client/src/pages/Home.jsx
git commit -m "Shell A1: home rail helpers + stats prefetch"
```

---

### Task 4: Console header, hero banner, and rails on Home

**Files:**
- Create: `client/src/components/HeroBanner.jsx`
- Modify: `client/src/pages/Lobby.jsx` (games-area layout + topbar)
- Modify: `client/src/styles.css`
- Test: `client/test/heroRailsCss.test.js`

**Interfaces:**
- Consumes: `pickFeaturedGame` / `recentGameIds` from Task 3; registry via `listGames()`-equivalent already used by Lobby (`games` array it renders); `onInvite`-flow entry `onClick(game)` and `onQuickPlay(game)` handlers already passed to GameCard.
- Produces: `<HeroBanner game={def} onPlay={fn} onQuickPlay={fn} searching={bool} />`; DOM contract `.hero-banner > .hero-art + .hero-copy > (.hero-kicker, h2, .hero-actions)`; rails `.home-rail` with `.home-rail-title`, horizontal scroll container `.rail-scroll`.

- [ ] **Step 1: Write the failing test**

```js
// client/test/heroRailsCss.test.js
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

test('rails collapse to horizontal scroll on mobile', () => {
  assert.match(css, /@media[^{]*max-width[^{]*{[^]*\.hero-banner[^}]*grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/heroRailsCss.test.js` → FAIL.

- [ ] **Step 3: Implement HeroBanner.jsx**

```jsx
// Featured-game banner at the top of Home: big key art over a cinematic
// accent gradient, with Play / Quick Play CTAs.
export default function HeroBanner({ game, onPlay, onQuickPlay, searching = false }) {
  if (!game) return null;
  const Thumb = game.thumbnail;
  return (
    <section className="hero-banner" style={{ '--card-accent': game.accent || 'var(--accent)' }}>
      <div className="hero-copy">
        <span className="hero-kicker">Featured</span>
        <h2>{game.name}</h2>
        {game.rules && <p>{game.rules}</p>}
        <div className="hero-actions">
          <button type="button" onClick={() => onPlay(game)}>▶ Play</button>
          {onQuickPlay && (
            <button type="button" className="ghost" disabled={searching} onClick={() => onQuickPlay(game)}>
              {searching ? 'Searching…' : 'Quick Play'}
            </button>
          )}
        </div>
      </div>
      <div className="hero-art" aria-hidden>{Thumb ? <Thumb /> : null}</div>
    </section>
  );
}
```

- [ ] **Step 4: Rework the Lobby games-area**

In `Lobby.jsx` (the `<main className="games-area">` block around line 281):

```jsx
import HeroBanner from '../components/HeroBanner.jsx';
import { pickFeaturedGame, recentGameIds } from '../homeRails.js';
```

Inside the component, before `return` (Lobby already receives `stats`; `games` is the registry array it maps over):

```jsx
const gameIds = games.map((g) => g.id);
const daySeed = Math.floor(Date.now() / 86400000);
const featuredId = pickFeaturedGame(gameIds, stats?.stats, daySeed);
const featured = games.find((g) => g.id === featuredId) || null;
const recentIds = recentGameIds(stats?.recent, gameIds).filter((id) => id !== featuredId);
const recentGames = recentIds.map((id) => games.find((g) => g.id === id));
```

Replace the main block with:

```jsx
<main className="games-area">
  <HeroBanner
    game={featured}
    onPlay={(g) => openInviteFor(g)}
    onQuickPlay={(g) => onQuickPlay(g)}
    searching={quickSearch?.gameId === featured?.id}
  />
  {recentGames.length > 0 && (
    <section className="home-rail">
      <h3 className="home-rail-title">Continue playing</h3>
      <div className="rail-scroll">
        {recentGames.map((g) => (
          <GameCard key={g.id} game={g} onClick={openInviteFor}
            onQuickPlay={onQuickPlay} searching={quickSearch?.gameId === g.id} />
        ))}
      </div>
    </section>
  )}
  <section className="home-rail">
    <h3 className="home-rail-title">All games</h3>
    <div className="games-grid">…existing grid mapping unchanged…</div>
  </section>
</main>
```

`openInviteFor` = whatever handler the existing grid passes as `onClick` to `GameCard` (match the current name in the file). Keep the intro `<p className="muted">` copy only if it fits; the hero replaces the old `h2`.

Topbar: restyle only (CSS) — `.topbar` becomes a glass console header: `background: var(--panel); backdrop-filter: blur(var(--panel-blur)); border-bottom: 1px solid var(--border);` and `.brand` uses `font-family: var(--display)`. Leave the buttons/menu logic alone. (The level chip lands in A2.)

- [ ] **Step 5: Add hero/rail CSS**

```css
.hero-banner {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  align-items: center;
  gap: 18px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--card-accent) 35%, var(--border));
  padding: clamp(18px, 4vw, 34px);
  min-height: 200px;
  background:
    radial-gradient(90% 130% at 85% 20%, color-mix(in srgb, var(--card-accent) 38%, transparent), transparent 65%),
    linear-gradient(120deg, color-mix(in srgb, var(--card-accent) 22%, #0b0f1c), #0b0f1c 75%);
  box-shadow: var(--shadow-3);
  overflow: hidden;
}
.hero-kicker {
  font-family: var(--display); font-size: 12px; letter-spacing: 0.22em;
  text-transform: uppercase; color: color-mix(in srgb, var(--card-accent) 80%, white);
}
.hero-copy h2 { font-family: var(--display); font-size: clamp(26px, 4vw, 40px); margin: 6px 0 8px; }
.hero-copy p { color: var(--muted); max-width: 46ch; margin: 0 0 14px; }
.hero-actions { display: flex; gap: 10px; }
.hero-art { max-height: 220px; aspect-ratio: 1; filter: drop-shadow(0 16px 30px rgba(2,4,10,0.6)); }
.home-rail { margin-top: 22px; }
.home-rail-title { font-family: var(--display); letter-spacing: 0.04em; margin: 0 0 10px; }
.rail-scroll {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(160px, 200px);
  gap: 14px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin;
}
@media (max-width: 760px) {
  .hero-banner { grid-template-columns: 1fr; min-height: 0; }
  .hero-art { display: none; }
}
```

- [ ] **Step 6: Run tests, visual check, commit**

Run: `node --test client/test/` → PASS (fix structural fallout only). Check desktop + mobile viewports + all three themes.

```bash
git add client/src/components/HeroBanner.jsx client/src/pages/Lobby.jsx client/src/styles.css client/test/heroRailsCss.test.js
git commit -m "Shell A1: console header, hero banner, home rails"
```

---

### Task 5: Party screen (LobbyModal slots)

**Files:**
- Modify: `client/src/components/LobbyModal.jsx` (members block only)
- Modify: `client/src/styles.css`
- Test: `client/test/partyScreenCss.test.js`

**Interfaces:**
- Consumes: `lobby.members` (`{id, username, ready}`), `lobby.maxPlayers`, `lobby.hostId`, existing option/map/mode/bots controls (unchanged).
- Produces: DOM contract `.party-slots > .party-slot[.filled|.empty][.ready] > (.party-avatar, .party-name, .party-status)`.

- [ ] **Step 1: Write the failing test**

```js
// client/test/partyScreenCss.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/LobbyModal.jsx', import.meta.url), 'utf8');

test('lobby renders console-style player slot cards up to maxPlayers', () => {
  assert.match(modal, /className={`party-slot/);
  assert.match(modal, /party-slot empty/);
  assert.match(css, /\.party-slots\s*{[^}]*grid/s);
  assert.match(css, /\.party-slot\.ready\s*{[^}]*var\(--green\)/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/partyScreenCss.test.js` → FAIL.

- [ ] **Step 3: Replace the members list with slot cards**

In `LobbyModal.jsx`, replace the `.lb-members` block with:

```jsx
<div className="lb-members">
  <span className="mode-label">Players {lobby.members.length}/{lobby.maxPlayers}</span>
  <div className="party-slots">
    {lobby.members.map((m) => (
      <div key={m.id} className={`party-slot filled${m.ready ? ' ready' : ''}`}>
        <span className="party-avatar">{(m.username || '?').charAt(0).toUpperCase()}</span>
        <span className="party-name">
          {m.id === currentUser.id ? 'You' : m.username}
          {m.id === lobby.hostId && <span className="lb-host">host</span>}
        </span>
        <span className="party-status">{m.ready ? '✓ Ready' : 'Not ready'}</span>
      </div>
    ))}
    {Array.from({ length: Math.max(0, (lobby.maxPlayers || 2) - lobby.members.length) }).map((_, i) => (
      <div key={`empty-${i}`} className="party-slot empty">
        <span className="party-avatar">+</span>
        <span className="party-name">Open slot</span>
        <span className="party-status">Invite a friend</span>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Add slot CSS**

```css
.party-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 8px; }
.party-slot {
  display: grid; justify-items: center; gap: 4px; text-align: center;
  padding: 14px 10px; border-radius: 14px;
  border: 1px solid var(--border); background: var(--surface-2);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.party-slot.ready { border-color: color-mix(in srgb, var(--green) 60%, transparent); box-shadow: 0 0 16px color-mix(in srgb, var(--green) 25%, transparent); }
.party-slot.empty { border-style: dashed; opacity: 0.65; }
.party-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center;
  font-family: var(--display); font-weight: 700;
  background: var(--grad); color: #0a0d14;
}
.party-slot.empty .party-avatar { background: var(--glass); color: var(--muted); }
.party-name { font-weight: 600; font-size: 13px; }
.party-status { font-size: 11px; color: var(--muted); }
.party-slot.ready .party-status { color: var(--green); }
```

Also restyle (CSS only, same class names): `.lb-code` as a big display-font code chip, and the Ready/Start buttons in this modal get accent treatment via existing button styles — no JSX change.

- [ ] **Step 5: Run tests + visual check + commit**

Run `node --test client/test/`. Open a lobby (create with bots) and eyeball slots.

```bash
git add client/src/components/LobbyModal.jsx client/src/styles.css client/test/partyScreenCss.test.js
git commit -m "Shell A1: party-screen player slots in lobby"
```

---

### Task 6: Podium end screen

**Files:**
- Modify: `client/src/pages/Game.jsx` (result overlay)
- Modify: `client/src/styles.css`
- Test: `client/test/podiumCss.test.js`

**Interfaces:**
- Consumes: `room.result` (`winner`, `draw`, `forfeit`, `scores`, `mode`, `teams`), `room.players`, `youAreIndex`, `rematch`, `onRematch`, `onLeave` — all existing.
- Produces: DOM contract `.podium > .podium-step[.first|.second|.third]`; a dormant slot `{progression && <div className="podium-progression">…}` that A2 fills (Game gains an optional `progression` prop, default `null`).

- [ ] **Step 1: Write the failing test**

```js
// client/test/podiumCss.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');

test('post-match overlay is a podium with ranked steps', () => {
  assert.match(game, /className={`podium-step/);
  assert.match(css, /\.podium\s*{[^}]*align-items:\s*flex-end/s);
  assert.match(css, /\.podium-step\.first\s*{[^}]*var\(--amber\)/s);
});

test('podium keeps the rematch flow and reserves the progression slot', () => {
  assert.match(game, /podium-progression/);
  assert.match(game, /onRematch/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test client/test/podiumCss.test.js` → FAIL.

- [ ] **Step 3: Build the podium ranking**

In `Game.jsx`, accept the dormant prop: `export default function Game({ …existing…, progression = null })`. Above the overlay JSX, derive placements (works with or without scores):

```jsx
const placements = (() => {
  if (!room.result) return [];
  const scores = room.result.scores;
  const rows = room.players.map((p) => ({
    idx: p.index,
    name: p.index === youAreIndex ? 'You' : p.username,
    score: scores?.[p.index] ?? null,
    won: !room.result.draw && (room.result.mode === 'teams'
      ? room.result.winner === (room.state?.teams?.[p.index] ?? 0)
      : room.result.winner === p.index),
  }));
  if (scores) rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  else rows.sort((a, b) => Number(b.won) - Number(a.won));
  return rows;
})();
```

Replace the overlay-card body (keep `.overlay` wrapper, `outcomeClass`, headline `resultMessage()`, team score line, rematch actions block, and rematch hint) — swap `.overlay-standings`/`.overlay-timeline` for:

```jsx
<div className="podium">
  {placements.slice(0, 3).map((row, i) => (
    <div key={row.idx} className={`podium-step ${['first', 'second', 'third'][i]}${row.idx === youAreIndex ? ' you' : ''}`}>
      <span className="podium-medal">{['🥇', '🥈', '🥉'][i]}</span>
      <span className="podium-name">{row.name}</span>
      {row.score != null && <b className="podium-score">{row.score}</b>}
      <span className="podium-block" aria-hidden />
    </div>
  ))}
</div>
{placements.length > 3 && (
  <div className="podium-rest">
    {placements.slice(3).map((row, i) => (
      <span key={row.idx} className={row.idx === youAreIndex ? 'you' : ''}>{i + 4}. {row.name}{row.score != null ? ` — ${row.score}` : ''}</span>
    ))}
  </div>
)}
{progression && <div className="podium-progression">{/* A2: XP tick, level-up, achievements */}</div>}
```

Podium order on screen: render 2nd–1st–3rd via CSS `order` (`.second{order:1}.first{order:2}.third{order:3}`). For 1v1 games this naturally shows winner-tall / loser-short; draws show equal steps (when `room.result.draw`, add class `draw` to `.podium` and equal heights).

- [ ] **Step 4: Podium CSS**

```css
.podium { display: flex; align-items: flex-end; justify-content: center; gap: 12px; margin: 14px 0 4px; }
.podium-step { display: grid; justify-items: center; gap: 4px; min-width: 84px; }
.podium-step .podium-block { width: 100%; border-radius: 10px 10px 4px 4px; background: var(--surface-2); border: 1px solid var(--border); }
.podium-step.first  { order: 2; } .podium-step.first  .podium-block { height: 76px; border-color: color-mix(in srgb, var(--amber) 65%, transparent); box-shadow: 0 0 22px color-mix(in srgb, var(--amber) 30%, transparent); }
.podium-step.second { order: 1; } .podium-step.second .podium-block { height: 52px; }
.podium-step.third  { order: 3; } .podium-step.third  .podium-block { height: 36px; }
.podium.draw .podium-block { height: 52px; }
.podium-medal { font-size: 22px; }
.podium-name { font-weight: 700; font-size: 13px; }
.podium-step.you .podium-name { color: var(--accent); }
.podium-score { font-family: var(--display); }
.podium-rest { display: grid; gap: 2px; color: var(--muted); font-size: 13px; margin-top: 6px; }
.podium-rest .you { color: var(--text); font-weight: 600; }
```

Also modernize `.overlay-card` (glass: `background: var(--panel); backdrop-filter: blur(var(--panel-blur));`, bigger radius, `--glow` on `.win`).

- [ ] **Step 5: Run all client tests + fix fallout**

Run: `node --test client/test/` — `rematchUx.test.js` and others assert against Game.jsx; keep their contracts (rematch button labels, hint) intact.

- [ ] **Step 6: Full verification + commit**

Play a bot game end-to-end (e.g. TicTacToe vs bot) and see the podium; run server tests too (`npm test --prefix server`, should be untouched).

```bash
git add client/src/pages/Game.jsx client/src/styles.css client/test/podiumCss.test.js
git commit -m "Shell A1: podium end screen with dormant progression slot"
```

---

### Task 7: A1 verification sweep

**Files:**
- Possibly touch: `client/src/styles.css` (fix-ups only)

- [ ] **Step 1: Run everything**

```bash
node --test client/test/
npm test --prefix server
```
Expected: all PASS.

- [ ] **Step 2: Browser sweep (use the Playwright MCP tools or `npm run test:e2e` if the existing e2e suite covers these pages)**

Check: Home (hero, rails, tiles) at 1440px and 390×844; a multi-player lobby; one full bot match to the podium; themes default/light/arcade; landscape game entry (Pool) unaffected.

- [ ] **Step 3: Commit any fix-ups**

```bash
git add -A && git commit -m "Shell A1: verification fix-ups"
```
