# Full Progression (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XP + levels, achievements, daily challenges, leaderboards, and level-gated unlockables (avatars/frames/themes), computed server-side off the existing match-recording path and surfaced in the console shell (header level chip, podium XP sequence, profile badges, leaderboard view, challenges rail).

**Architecture:** A new `server/src/progression.js` orchestrates everything when a match records: XP award → achievement evaluation → challenge progress → per-user summary pushed over a registered notifier to Socket.IO as `progression:update`. All persistence goes through `db.js` (new tables `xp_events`, `achievements`, `challenge_progress`; new `users.xp`/`users.frame` columns). Level is a pure function of XP; the client never re-implements the curve — the server sends computed values. Progression failures are caught in `recordIfDone` and can never break match recording.

**Tech Stack:** better-sqlite3, Express, Socket.IO, `node:test` (server + client), React 18.

## Global Constraints

- Progression must be fail-safe: any thrown error inside progression is caught + logged; match recording and `game:over` flow unaffected.
- Level curve lives only on the server; clients render `{ level, xp, intoLevel, neededForNext }` sent to them.
- Unlocks are level-gated only — no currency, no shop.
- Bots never earn XP/achievements (match recording already filters bots — keep it that way).
- Client tests: `node --test client/test/`. Server tests: `npm test --prefix server`.
- Commit after every green task.

## File Structure

- `server/src/db.js` — schema additions + progression queries (single data-access layer, matching the existing pattern).
- `server/src/progression.js` — NEW: XP rules, level curve, match orchestration, leaderboards, notifier.
- `server/src/achievements.js` — NEW: achievement definitions + evaluation.
- `server/src/challenges.js` — NEW: daily challenge pool, deterministic generation, progress.
- `server/src/unlocks.js` — NEW: avatar/frame/theme catalog with level requirements.
- `server/src/rooms.js` — hook in `recordIfDone`.
- `server/src/socketHandlers.js` — register notifier → emit `progression:update`.
- `server/src/index.js` — REST: `/api/progression/me`, `/api/progression/challenges`, `/api/leaderboard`.
- `server/src/auth.js` — level-gated avatar/frame validation in profile patch.
- Client: `client/src/api.js` (new calls), `client/src/pages/Home.jsx` (fetch + socket listener), `client/src/pages/Lobby.jsx` (level chip, challenges rail, leaderboard modal), `client/src/pages/Game.jsx` (podium progression stage), `client/src/preferences.js` (avatar/frame catalog mirror).
- Tests: `server/test/progression.test.js`, `server/test/achievements.test.js`, `server/test/challenges.test.js`, `server/test/progressionHook.test.js`, `server/test/unlocks.test.js`, `client/test/progressionUi.test.js`.

---

### Task 1: Schema + XP core

**Files:**
- Modify: `server/src/db.js`
- Create: `server/src/progression.js`
- Test: `server/test/progression.test.js`

**Interfaces:**
- Produces (db.js): `addXp(userId, amount, reason, matchId)` (inserts xp_event + bumps `users.xp`, returns new total), `getXp(userId)`, `getRecentResults(userId, gameId, limit)` → `['win'|'loss'|'draw', …]` newest first (from `match_players` joined to `matches`).
- Produces (progression.js): `levelForXp(xp)` → `{ level, intoLevel, neededForNext }`; `xpForMatch({ won, draw, playerCount, streak })` → `{ total, breakdown: [{reason, amount}] }`.
- Level curve: cost of level *n* → *n+1* is `100 + 50 * (n - 1)` XP (L1→2 = 100, L2→3 = 150, …). Level 1 at 0 XP.
- XP rules: base play 20; win bonus 40; +5 per opponent beyond the first when winning (`(playerCount - 2) * 5`); streak bonus `10 * min(streak - 1, 5)` where `streak` counts consecutive wins including this one; draw = base + 10.

- [ ] **Step 1: Write the failing test**

```js
// server/test/progression.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { levelForXp, xpForMatch } from '../src/progression.js';

test('level curve: thresholds are cumulative 100, 150, 200…', () => {
  assert.deepEqual(levelForXp(0), { level: 1, intoLevel: 0, neededForNext: 100 });
  assert.deepEqual(levelForXp(99), { level: 1, intoLevel: 99, neededForNext: 100 });
  assert.deepEqual(levelForXp(100), { level: 2, intoLevel: 0, neededForNext: 150 });
  assert.deepEqual(levelForXp(260), { level: 3, intoLevel: 10, neededForNext: 200 });
});

test('xp: playing earns base, winning earns bonus, draws split', () => {
  assert.equal(xpForMatch({ won: false, draw: false, playerCount: 2, streak: 0 }).total, 20);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 1 }).total, 60);
  assert.equal(xpForMatch({ won: false, draw: true, playerCount: 2, streak: 0 }).total, 30);
});

test('xp: bigger lobbies and streaks pay more, streak bonus caps', () => {
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 8, streak: 1 }).total, 60 + 30);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 3 }).total, 60 + 20);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 99 }).total, 60 + 50);
});

test('xp breakdown lists each reason once', () => {
  const { breakdown, total } = xpForMatch({ won: true, draw: false, playerCount: 4, streak: 2 });
  assert.deepEqual(breakdown.map((b) => b.reason), ['played', 'won', 'big-lobby', 'streak']);
  assert.equal(breakdown.reduce((s, b) => s + b.amount, 0), total);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- --test-name-pattern level` (or plain `npm test --prefix server`)
Expected: FAIL (`progression.js` not found).

- [ ] **Step 3: Implement the pure core in progression.js**

```js
// Progression domain: XP rules + level curve + (later tasks) match orchestration.
// Level curve and XP amounts live ONLY here; clients render server-computed values.

const BASE_PLAY = 20;
const WIN_BONUS = 40;
const DRAW_BONUS = 10;
const PER_EXTRA_OPPONENT = 5;
const STREAK_STEP = 10;
const STREAK_CAP = 5;

// Cost of going from level n to n+1.
function costForLevel(n) {
  return 100 + 50 * (n - 1);
}

export function levelForXp(xp = 0) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (remaining >= costForLevel(level)) {
    remaining -= costForLevel(level);
    level += 1;
  }
  return { level, intoLevel: remaining, neededForNext: costForLevel(level) };
}

export function xpForMatch({ won = false, draw = false, playerCount = 2, streak = 0 } = {}) {
  const breakdown = [{ reason: 'played', amount: BASE_PLAY }];
  if (draw) breakdown.push({ reason: 'draw', amount: DRAW_BONUS });
  if (won) {
    breakdown.push({ reason: 'won', amount: WIN_BONUS });
    const extra = Math.max(0, playerCount - 2) * PER_EXTRA_OPPONENT;
    if (extra) breakdown.push({ reason: 'big-lobby', amount: extra });
    const streakBonus = STREAK_STEP * Math.min(Math.max(0, streak - 1), STREAK_CAP);
    if (streakBonus) breakdown.push({ reason: 'streak', amount: streakBonus });
  }
  return { breakdown, total: breakdown.reduce((s, b) => s + b.amount, 0) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server` → progression tests PASS (whole suite green).

- [ ] **Step 5: Add schema + XP queries to db.js**

After the existing `ensureColumn` calls:

```js
ensureColumn('users', 'xp', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'frame', "TEXT NOT NULL DEFAULT 'none'");

db.exec(`
  CREATE TABLE IF NOT EXISTS xp_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    match_id   INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id, id);

  CREATE TABLE IF NOT EXISTS achievements (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS challenge_progress (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day          TEXT NOT NULL,             -- YYYY-MM-DD (UTC)
    challenge_id TEXT NOT NULL,
    progress     INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (user_id, day, challenge_id)
  );
`);
```

In the users section add (and include `frame` in `publicUser` + `updateUserProfile` patch handling, mirroring `avatar`):

```js
export function addXp(userId, amount, reason, matchId = null) {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO xp_events (user_id, amount, reason, match_id) VALUES (?, ?, ?, ?)')
      .run(userId, amount, reason, matchId);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(amount, userId);
    return db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)?.xp ?? 0;
  });
  return tx();
}

export function getXp(userId) {
  return db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)?.xp ?? 0;
}

// Newest-first results for streak computation; gameId=null means across games.
export function getRecentResults(userId, gameId = null, limit = 20) {
  const rows = gameId
    ? db.prepare(
        `SELECT mp.result FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.user_id = ? AND m.game_id = ? ORDER BY m.id DESC LIMIT ?`
      ).all(userId, gameId, limit)
    : db.prepare(
        `SELECT mp.result FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.user_id = ? ORDER BY m.id DESC LIMIT ?`
      ).all(userId, limit);
  return rows.map((r) => r.result);
}
```

- [ ] **Step 6: Add db-level tests**

Append to `server/test/progression.test.js` (the existing server tests import `db.js` against the real data dir — follow whatever isolation pattern `server/test/launch.test.js` uses; if tests point at a temp DB via env, reuse that, otherwise exercise via public functions with a throwaway user):

```js
import { addXp, getXp, createUser } from '../src/db.js';

test('addXp bumps the user total and records an event', () => {
  const u = createUser(`xp_test_${Date.now()}`, 'hash');
  assert.equal(getXp(u.id), 0);
  const total = addXp(u.id, 60, 'won', null);
  assert.equal(total, 60);
  assert.equal(getXp(u.id), 60);
});
```

Run: `npm test --prefix server` → PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/db.js server/src/progression.js server/test/progression.test.js
git commit -m "Progression A2: schema, XP rules, level curve"
```

---

### Task 2: Achievements

**Files:**
- Create: `server/src/achievements.js`
- Modify: `server/src/db.js` (unlock queries)
- Test: `server/test/achievements.test.js`

**Interfaces:**
- Consumes (db.js additions): `getUnlockedAchievements(userId)` → `[ids]`, `unlockAchievement(userId, id)` (INSERT OR IGNORE, returns true if newly inserted), plus existing `getUserStats`.
- Produces: `ACHIEVEMENTS` — array of `{ id, name, desc, icon, xp, check(ctx) }`; `evaluateAchievements(ctx)` → newly unlocked defs (already-persisted). `ctx = { userId, gameId, won, draw, playerCount, streak, stats }` where `stats` is `getUserStats(userId).stats` *after* the match was recorded.
- XP for achievement unlocks is granted by the caller in Task 4 (so this module stays side-effect-light: it persists unlocks, not XP).

- [ ] **Step 1: Write the failing test**

```js
// server/test/achievements.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { ACHIEVEMENTS, evaluateAchievements } from '../src/achievements.js';
import { createUser } from '../src/db.js';

const baseCtx = (userId, over = {}) => ({
  userId, gameId: 'pool', won: true, draw: false, playerCount: 2, streak: 1,
  stats: [{ gameId: 'pool', played: 1, wins: 1, losses: 0, draws: 0 }],
  ...over,
});

test('catalog: ~25 unique, fully described achievements', () => {
  assert.ok(ACHIEVEMENTS.length >= 20);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  assert.equal(ids.size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.desc && a.icon && a.xp > 0 && typeof a.check === 'function', a.id);
  }
});

test('first win unlocks once and only once', () => {
  const u = createUser(`ach_${Date.now()}`, 'hash');
  const first = evaluateAchievements(baseCtx(u.id));
  assert.ok(first.some((a) => a.id === 'first-win'));
  const again = evaluateAchievements(baseCtx(u.id));
  assert.ok(!again.some((a) => a.id === 'first-win'));
});

test('losing does not unlock win achievements', () => {
  const u = createUser(`ach2_${Date.now()}`, 'hash');
  const got = evaluateAchievements(baseCtx(u.id, { won: false, stats: [{ gameId: 'pool', played: 1, wins: 0 }] }));
  assert.ok(!got.some((a) => a.id === 'first-win'));
});

test('streak and explorer achievements trigger on their conditions', () => {
  const u = createUser(`ach3_${Date.now()}`, 'hash');
  const got = evaluateAchievements(baseCtx(u.id, { streak: 5 }));
  assert.ok(got.some((a) => a.id === 'streak-5'));
  const explorer = evaluateAchievements(baseCtx(u.id, {
    stats: Array.from({ length: 10 }, (_, i) => ({ gameId: `g${i}`, played: 1, wins: 0 })),
  }));
  assert.ok(explorer.some((a) => a.id === 'explorer-10'));
});
```

- [ ] **Step 2: Run test to verify it fails** → `npm test --prefix server` FAIL.

- [ ] **Step 3: Implement achievements.js**

```js
// Achievement catalog + evaluation. check(ctx) answers "does the user qualify
// right now" — evaluateAchievements persists newly earned ones and returns them.
import { getUnlockedAchievements, unlockAchievement } from './db.js';

const sum = (stats, key) => stats.reduce((s, r) => s + (r[key] || 0), 0);
const forGame = (stats, gameId) => stats.find((r) => r.gameId === gameId);

export const ACHIEVEMENTS = [
  { id: 'first-game', name: 'Welcome to the Arena', desc: 'Play your first match.', icon: '🎮', xp: 25, check: (c) => sum(c.stats, 'played') >= 1 },
  { id: 'first-win', name: 'First Blood', desc: 'Win your first match.', icon: '🏆', xp: 50, check: (c) => c.won },
  { id: 'games-10', name: 'Regular', desc: 'Play 10 matches.', icon: '🕹️', xp: 40, check: (c) => sum(c.stats, 'played') >= 10 },
  { id: 'games-50', name: 'Veteran', desc: 'Play 50 matches.', icon: '🎖️', xp: 80, check: (c) => sum(c.stats, 'played') >= 50 },
  { id: 'games-200', name: 'No Life Left', desc: 'Play 200 matches.', icon: '💾', xp: 150, check: (c) => sum(c.stats, 'played') >= 200 },
  { id: 'wins-10', name: 'Contender', desc: 'Win 10 matches.', icon: '⚔️', xp: 60, check: (c) => sum(c.stats, 'wins') >= 10 },
  { id: 'wins-50', name: 'Champion', desc: 'Win 50 matches.', icon: '👑', xp: 120, check: (c) => sum(c.stats, 'wins') >= 50 },
  { id: 'wins-150', name: 'Legend', desc: 'Win 150 matches.', icon: '🌟', xp: 200, check: (c) => sum(c.stats, 'wins') >= 150 },
  { id: 'streak-3', name: 'Heating Up', desc: 'Win 3 in a row.', icon: '🔥', xp: 50, check: (c) => c.streak >= 3 },
  { id: 'streak-5', name: 'On Fire', desc: 'Win 5 in a row.', icon: '☄️', xp: 90, check: (c) => c.streak >= 5 },
  { id: 'streak-10', name: 'Unstoppable', desc: 'Win 10 in a row.', icon: '⚡', xp: 180, check: (c) => c.streak >= 10 },
  { id: 'explorer-5', name: 'Tourist', desc: 'Play 5 different games.', icon: '🧭', xp: 40, check: (c) => c.stats.filter((r) => r.played > 0).length >= 5 },
  { id: 'explorer-10', name: 'Explorer', desc: 'Play 10 different games.', icon: '🗺️', xp: 80, check: (c) => c.stats.filter((r) => r.played > 0).length >= 10 },
  { id: 'explorer-all', name: 'Completionist', desc: 'Play every game on the platform.', icon: '💯', xp: 150, check: (c) => c.stats.filter((r) => r.played > 0).length >= 19 },
  { id: 'party-8', name: 'Full House', desc: 'Play a match with 8 players.', icon: '🎉', xp: 50, check: (c) => c.playerCount >= 8 },
  { id: 'party-win', name: 'Crowd Killer', desc: 'Win a match with 4+ players.', icon: '🎯', xp: 60, check: (c) => c.won && c.playerCount >= 4 },
  { id: 'pool-shark', name: 'Pool Shark', desc: 'Win 10 Pool matches.', icon: '🎱', xp: 70, check: (c) => (forGame(c.stats, 'pool')?.wins || 0) >= 10 },
  { id: 'kart-champ', name: 'Podium Regular', desc: 'Win 10 Smash Karts matches.', icon: '🏎️', xp: 70, check: (c) => (forGame(c.stats, 'karts')?.wins || 0) >= 10 },
  { id: 'grandmaster', name: 'Grandmaster', desc: 'Win 10 Micro Chess matches.', icon: '♞', xp: 70, check: (c) => (forGame(c.stats, 'microchess')?.wins || 0) >= 10 },
  { id: 'wordsmith', name: 'Wordsmith', desc: 'Win 10 word-game matches (Boggle, Word Duel, Hangman, Skribble).', icon: '📚', xp: 70, check: (c) => ['boggle', 'wordduel', 'hangman', 'skribble'].reduce((s, g) => s + (forGame(c.stats, g)?.wins || 0), 0) >= 10 },
  { id: 'tactician', name: 'Tactician', desc: 'Win 10 board-game matches (Checkers, Reversi, Connect Four, Dots & Boxes).', icon: '🧠', xp: 70, check: (c) => ['checkers', 'reversi', 'connect4', 'dotsboxes'].reduce((s, g) => s + (forGame(c.stats, g)?.wins || 0), 0) >= 10 },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Win 10 aim-game matches (Tank Duel, Battleship).', icon: '💥', xp: 70, check: (c) => ['artillery', 'battleship'].reduce((s, g) => s + (forGame(c.stats, g)?.wins || 0), 0) >= 10 },
  { id: 'draw-artist', name: 'Peacekeeper', desc: 'Draw 5 matches.', icon: '🤝', xp: 40, check: (c) => sum(c.stats, 'draws') >= 5 },
  { id: 'night-owl', name: 'One More Game', desc: 'Play 25 matches of a single game.', icon: '🦉', xp: 60, check: (c) => c.stats.some((r) => r.played >= 25) },
  { id: 'dominator', name: 'Dominator', desc: 'Reach 20 wins in a single game.', icon: '🥇', xp: 100, check: (c) => c.stats.some((r) => r.wins >= 20) },
];

export function evaluateAchievements(ctx) {
  const have = new Set(getUnlockedAchievements(ctx.userId));
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch { ok = false; }
    if (ok && unlockAchievement(ctx.userId, a.id)) earned.push(a);
  }
  return earned;
}
```

- [ ] **Step 4: Add the two db.js queries**

```js
export function getUnlockedAchievements(userId) {
  return db.prepare('SELECT achievement_id FROM achievements WHERE user_id = ?').all(userId)
    .map((r) => r.achievement_id);
}

export function unlockAchievement(userId, achievementId) {
  const info = db.prepare(
    'INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)'
  ).run(userId, achievementId);
  return info.changes > 0;
}
```

- [ ] **Step 5: Run tests** → `npm test --prefix server` PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/achievements.js server/src/db.js server/test/achievements.test.js
git commit -m "Progression A2: achievement catalog + evaluation"
```

---

### Task 3: Daily challenges

**Files:**
- Create: `server/src/challenges.js`
- Modify: `server/src/db.js` (progress queries)
- Test: `server/test/challenges.test.js`

**Interfaces:**
- Consumes (db.js additions): `getChallengeProgress(userId, day)` → rows `{ challenge_id, progress, completed_at }`; `upsertChallengeProgress(userId, day, challengeId, progress, completed)`.
- Produces:
  - `challengesForDate(day)` → 3 challenge instances `{ id, name, desc, icon, xp, target, kind, gameId? }`, deterministic for a given `'YYYY-MM-DD'`.
  - `applyMatchToChallenges({ userId, day, gameId, won, draw, playedGameIdsToday })` → `{ updated: [{challenge, progress, completed}] , completed: [challenge] }`.
  - `getDailyChallenges(userId, day)` → the 3 challenges with the user's progress merged (for REST).
- Challenge kinds: `play-any` (play N matches), `win-any` (win N), `play-game` (play N of a specific game), `win-game` (win N of a specific game), `play-distinct` (play N different games today).

- [ ] **Step 1: Write the failing test**

```js
// server/test/challenges.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { challengesForDate, applyMatchToChallenges, getDailyChallenges } from '../src/challenges.js';
import { createUser } from '../src/db.js';

test('a day always yields the same 3 distinct challenges; days differ', () => {
  const a = challengesForDate('2026-07-02');
  const b = challengesForDate('2026-07-02');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((c) => c.id)).size, 3);
  const week = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']
    .map((d) => challengesForDate(d).map((c) => c.id).join());
  assert.ok(new Set(week).size >= 2, 'challenge sets should rotate across days');
});

test('match progress accumulates and completes exactly once', () => {
  const u = createUser(`ch_${Date.now()}`, 'hash');
  const day = '2026-07-02';
  const [first] = challengesForDate(day);
  // Drive matches until the first challenge completes; completion must be reported once.
  let completions = 0;
  for (let i = 0; i < first.target + 2; i++) {
    const res = applyMatchToChallenges({
      userId: u.id, day,
      gameId: first.gameId || 'pool',
      won: true, draw: false,
      playedGameIdsToday: ['pool'],
    });
    completions += res.completed.filter((c) => c.id === first.id).length;
  }
  assert.equal(completions, 1);
  const merged = getDailyChallenges(u.id, day);
  assert.equal(merged.length, 3);
  const done = merged.find((c) => c.id === first.id);
  assert.ok(done.completed);
  assert.equal(done.progress, done.target);
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement challenges.js**

```js
// Daily challenges: 3 per UTC day, deterministically drawn from a pool with a
// date-seeded PRNG. Progress persists per (user, day, challenge).
import { getChallengeProgress, upsertChallengeProgress } from './db.js';
import { listGames } from './games/registry.js';

// mulberry32 — tiny seeded PRNG, good enough for daily rotation.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDay(day) {
  return [...day].reduce((s, ch) => Math.imul(s, 33) + ch.charCodeAt(0), 5381) >>> 0;
}

const FIXED = [
  { kind: 'play-any', name: 'Warm Up', desc: 'Play {n} matches.', icon: '🎯', targets: [2, 3, 4], xpPer: 15 },
  { kind: 'win-any', name: 'Victory Lap', desc: 'Win {n} matches.', icon: '🏁', targets: [1, 2, 3], xpPer: 30 },
  { kind: 'play-distinct', name: 'Variety Pack', desc: 'Play {n} different games.', icon: '🎲', targets: [2, 3], xpPer: 25 },
];

export function challengesForDate(day) {
  const rand = rng(seedFromDay(day));
  const games = listGames();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const out = [];

  const c1 = pick(FIXED);
  const t1 = pick(c1.targets);
  out.push({ id: `${c1.kind}-${t1}`, kind: c1.kind, name: c1.name, icon: c1.icon, target: t1, xp: c1.xpPer * t1, desc: c1.desc.replace('{n}', t1) });

  const g2 = pick(games);
  out.push({ id: `play-game-${g2.id}`, kind: 'play-game', gameId: g2.id, name: `${g2.name} Time`, icon: '🕹️', target: 2, xp: 40, desc: `Play 2 matches of ${g2.name}.` });

  const g3 = pick(games.filter((g) => g.id !== g2.id));
  out.push({ id: `win-game-${g3.id}`, kind: 'win-game', gameId: g3.id, name: `${g3.name} Winner`, icon: '🏆', target: 1, xp: 50, desc: `Win a match of ${g3.name}.` });

  return out;
}

function matchCounts(ch, { gameId, won, draw, playedGameIdsToday }) {
  switch (ch.kind) {
    case 'play-any': return 1;
    case 'win-any': return won ? 1 : 0;
    case 'play-game': return gameId === ch.gameId ? 1 : 0;
    case 'win-game': return won && gameId === ch.gameId ? 1 : 0;
    case 'play-distinct': return 0; // handled from the distinct set below
    default: return 0;
  }
}

export function applyMatchToChallenges({ userId, day, gameId, won, draw, playedGameIdsToday = [] }) {
  const defs = challengesForDate(day);
  const existing = new Map(getChallengeProgress(userId, day).map((r) => [r.challenge_id, r]));
  const updated = [];
  const completed = [];
  for (const ch of defs) {
    const row = existing.get(ch.id);
    if (row?.completed_at) continue;
    const prev = row?.progress || 0;
    const next = ch.kind === 'play-distinct'
      ? Math.min(ch.target, new Set(playedGameIdsToday).size)
      : Math.min(ch.target, prev + matchCounts(ch, { gameId, won, draw, playedGameIdsToday }));
    if (next === prev) continue;
    const isDone = next >= ch.target;
    upsertChallengeProgress(userId, day, ch.id, next, isDone);
    updated.push({ challenge: ch, progress: next, completed: isDone });
    if (isDone) completed.push(ch);
  }
  return { updated, completed };
}

export function getDailyChallenges(userId, day) {
  const progress = new Map(getChallengeProgress(userId, day).map((r) => [r.challenge_id, r]));
  return challengesForDate(day).map((ch) => {
    const row = progress.get(ch.id);
    return { ...ch, progress: row?.progress || 0, completed: !!row?.completed_at };
  });
}

export function utcDay(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Add db.js queries**

```js
export function getChallengeProgress(userId, day) {
  return db.prepare(
    'SELECT challenge_id, progress, completed_at FROM challenge_progress WHERE user_id = ? AND day = ?'
  ).all(userId, day);
}

export function upsertChallengeProgress(userId, day, challengeId, progress, completed) {
  db.prepare(
    `INSERT INTO challenge_progress (user_id, day, challenge_id, progress, completed_at)
     VALUES (?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
     ON CONFLICT(user_id, day, challenge_id) DO UPDATE SET
       progress = excluded.progress,
       completed_at = COALESCE(challenge_progress.completed_at, excluded.completed_at)`
  ).run(userId, day, challengeId, progress, completed ? 1 : 0);
}
```

- [ ] **Step 5: Run tests** → `npm test --prefix server` PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/challenges.js server/src/db.js server/test/challenges.test.js
git commit -m "Progression A2: deterministic daily challenges"
```

---

### Task 4: Match hook + live delivery

**Files:**
- Modify: `server/src/progression.js` (orchestrator + notifier)
- Modify: `server/src/rooms.js:53-63` (`recordIfDone`)
- Modify: `server/src/socketHandlers.js` (register notifier)
- Modify: `server/src/db.js` (one query: distinct games played today)
- Test: `server/test/progressionHook.test.js`

**Interfaces:**
- Consumes: `saveMatchResult` return value (matchId), room shape `{ id, gameId, players: [{index, user:{id, bot}}], result: {winner, draw, forfeit, scores?, mode?} }`, `xpForMatch`/`levelForXp` (Task 1), `evaluateAchievements` (Task 2), `applyMatchToChallenges`/`utcDay` (Task 3).
- Produces:
  - `processMatch({ matchId, gameId, playerCount, players, result })` → `Map<userId, summary>` where `summary = { xpGained, breakdown, xp, level: {level, intoLevel, neededForNext}, leveledUp, achievements: [{id,name,desc,icon,xp}], challenges: [{id,name,desc,icon,progress,target,completed,xp}] }`.
  - `setProgressionNotifier(fn)` — `fn(userId, summary)`; called once per human player after processing.
  - db.js: `getGamesPlayedOnDay(userId, day)` → distinct gameIds.
- Socket event: `progression:update` with the summary payload (client Task 7 consumes it).

- [ ] **Step 1: Write the failing test**

```js
// server/test/progressionHook.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { processMatch, setProgressionNotifier } from '../src/progression.js';
import { createUser, getXp, saveMatchResult } from '../src/db.js';

function fakePlayers(u1, u2) {
  return [
    { index: 0, user: { id: u1.id, username: u1.username } },
    { index: 1, user: { id: u2.id, username: u2.username } },
  ];
}

test('processMatch awards XP to every human and reports level info', () => {
  const a = createUser(`ph_a_${Date.now()}`, 'hash');
  const b = createUser(`ph_b_${Date.now()}`, 'hash');
  const players = fakePlayers(a, b);
  const result = { winner: 0, draw: false, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r1', gameId: 'pool', gameName: 'Pool', players, result });
  const out = processMatch({ matchId, gameId: 'pool', playerCount: 2, players, result });
  const winner = out.get(a.id);
  const loser = out.get(b.id);
  assert.ok(winner.xpGained >= 60, 'winner gets play+win');
  assert.equal(loser.xpGained >= 20, true);
  assert.equal(winner.level.level >= 1, true);
  assert.ok(winner.achievements.some((x) => x.id === 'first-win'));
  assert.equal(getXp(a.id) >= winner.xpGained, true, 'achievement XP also lands in the total');
});

test('bots are skipped', () => {
  const a = createUser(`ph_c_${Date.now()}`, 'hash');
  const players = [
    { index: 0, user: { id: a.id, username: a.username } },
    { index: 1, user: { id: -5, username: 'Bot Nova', bot: true } },
  ];
  const result = { winner: 1, draw: false, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r2', gameId: 'pool', gameName: 'Pool', players, result });
  const out = processMatch({ matchId, gameId: 'pool', playerCount: 2, players, result });
  assert.ok(out.has(a.id));
  assert.ok(!out.has(-5));
});

test('notifier receives one call per human', () => {
  const a = createUser(`ph_d_${Date.now()}`, 'hash');
  const b = createUser(`ph_e_${Date.now()}`, 'hash');
  const calls = [];
  setProgressionNotifier((userId, summary) => calls.push([userId, summary.xpGained]));
  const players = fakePlayers(a, b);
  const result = { winner: null, draw: true, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r3', gameId: 'uno', gameName: 'Uno', players, result });
  processMatch({ matchId, gameId: 'uno', playerCount: 2, players, result });
  setProgressionNotifier(null);
  assert.deepEqual(calls.map(([id]) => id).sort(), [a.id, b.id].sort());
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement the orchestrator in progression.js**

Append:

```js
import {
  addXp, getXp, getRecentResults, getUserStats, getGamesPlayedOnDay,
} from './db.js';
import { evaluateAchievements } from './achievements.js';
import { applyMatchToChallenges, utcDay } from './challenges.js';

let notifier = null;
export function setProgressionNotifier(fn) { notifier = fn; }

function winStreak(userId) {
  // Consecutive wins, newest first, including the just-recorded match.
  const results = getRecentResults(userId, null, 25);
  let n = 0;
  for (const r of results) {
    if (r === 'win') n += 1;
    else break;
  }
  return n;
}

export function processMatch({ matchId, gameId, playerCount, players, result }) {
  const out = new Map();
  const humans = players.filter((p) => !p.user.bot);
  const day = utcDay();
  for (const p of humans) {
    const userId = p.user.id;
    const won = !result.draw && (result.mode === 'teams' ? false : result.winner === p.index);
    // Team games: fall back to per-player result from match_players semantics —
    // saveMatchResult already decided win/loss per seat; recompute the same way:
    const wonFinal = !result.draw && result.winner === p.index;
    const streak = wonFinal ? winStreak(userId) : 0;
    const { total, breakdown } = xpForMatch({ won: wonFinal, draw: !!result.draw, playerCount, streak });
    const before = getXp(userId);
    let xpTotal = addXp(userId, total, 'match', matchId);

    const stats = getUserStats(userId).stats;
    const earned = evaluateAchievements({ userId, gameId, won: wonFinal, draw: !!result.draw, playerCount, streak, stats });
    for (const a of earned) xpTotal = addXp(userId, a.xp, `achievement:${a.id}`, matchId);

    const playedToday = getGamesPlayedOnDay(userId, day);
    const chal = applyMatchToChallenges({ userId, day, gameId, won: wonFinal, draw: !!result.draw, playedGameIdsToday: playedToday });
    for (const ch of chal.completed) xpTotal = addXp(userId, ch.xp, `challenge:${ch.id}`, matchId);

    const summary = {
      xpGained: xpTotal - before,
      breakdown,
      xp: xpTotal,
      level: levelForXp(xpTotal),
      leveledUp: levelForXp(xpTotal).level > levelForXp(before).level,
      achievements: earned.map(({ check, ...a }) => a),
      challenges: chal.updated.map((u) => ({ ...u.challenge, progress: u.progress, completed: u.completed })),
    };
    out.set(userId, summary);
    try { notifier?.(userId, summary); } catch { /* notifier must never break processing */ }
  }
  return out;
}
```

(Note the `won`/`wonFinal` duplication above is a bug trap — implement **only** `wonFinal` exactly as `saveMatchResult` does: `!result.draw && result.winner === p.index`. For team games `result.winner` is a team id, not a seat; mirror `saveMatchResult`'s current behavior and leave team nuance as-is so XP matches recorded stats.)

db.js addition:

```js
export function getGamesPlayedOnDay(userId, day) {
  return db.prepare(
    `SELECT DISTINCT m.game_id FROM match_players mp JOIN matches m ON m.id = mp.match_id
     WHERE mp.user_id = ? AND date(m.created_at) = ?`
  ).all(userId, day).map((r) => r.game_id);
}
```

- [ ] **Step 4: Hook recordIfDone + socket emit**

`server/src/rooms.js` — replace `recordIfDone`:

```js
import { processMatch } from './progression.js';

function recordIfDone(room) {
  if (room.status === 'over' && room.result) {
    const matchId = saveMatchResult({
      roomId: room.id,
      gameId: room.gameId,
      gameName: room.game.name,
      players: room.players,
      result: room.result,
    });
    if (matchId) {
      try {
        processMatch({
          matchId,
          gameId: room.gameId,
          playerCount: room.players.length,
          players: room.players,
          result: room.result,
        });
      } catch (err) {
        console.error('[progression] failed (match still recorded):', err);
      }
    }
  }
}
```

`server/src/socketHandlers.js` — where the io wiring starts (top-level setup function), register once:

```js
import { setProgressionNotifier } from './progression.js';
// inside the setup function, after emitToUser is available:
setProgressionNotifier((userId, summary) => emitToUser(io, userId, 'progression:update', summary));
```

- [ ] **Step 5: Run all server tests** → `npm test --prefix server` PASS (including a new assertion in `progressionHook.test.js` if desired that a throwing notifier doesn't propagate).

- [ ] **Step 6: Commit**

```bash
git add server/src/progression.js server/src/rooms.js server/src/socketHandlers.js server/src/db.js server/test/progressionHook.test.js
git commit -m "Progression A2: match hook, orchestration, progression:update"
```

---

### Task 5: REST endpoints + leaderboards

**Files:**
- Modify: `server/src/progression.js` (leaderboard queries via db)
- Modify: `server/src/db.js` (leaderboard SQL)
- Modify: `server/src/index.js` (routes)
- Test: `server/test/leaderboards.test.js`

**Interfaces:**
- Produces (db.js):
  - `topByXp(limit)` → `[{ id, username, display_name, avatar, xp }]`
  - `topByGameWins(gameId, limit)` → `[{ id, username, display_name, avatar, wins }]`
  - `topByWeeklyWins(limit)` → wins from matches in the last 7 days.
- Produces (routes, all `authMiddleware`):
  - `GET /api/progression/me` → `{ xp, level: {level,intoLevel,neededForNext}, achievements: [ids], unlocks: <Task 6> }`
  - `GET /api/progression/challenges` → `{ day, challenges: [{…, progress, completed}] }`
  - `GET /api/leaderboard?board=xp|weekly|game&gameId=` → `{ board, rows: [{rank, userId, name, avatar, value, you}] }`

- [ ] **Step 1: Write the failing test**

```js
// server/test/leaderboards.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser, addXp, saveMatchResult, topByXp, topByGameWins, topByWeeklyWins } from '../src/db.js';

test('XP leaderboard ranks by xp desc and includes profile fields', () => {
  const a = createUser(`lb_a_${Date.now()}`, 'hash');
  addXp(a.id, 999999, 'test', null);
  const rows = topByXp(5);
  assert.equal(rows[0].id, a.id);
  assert.ok('username' in rows[0] && 'avatar' in rows[0] && 'xp' in rows[0]);
});

test('per-game and weekly leaderboards count wins', () => {
  const a = createUser(`lb_b_${Date.now()}`, 'hash');
  const b = createUser(`lb_c_${Date.now()}`, 'hash');
  const players = [
    { index: 0, user: { id: a.id, username: a.username } },
    { index: 1, user: { id: b.id, username: b.username } },
  ];
  for (let i = 0; i < 3; i++) {
    saveMatchResult({ roomId: `lb${i}`, gameId: 'boggle', gameName: 'Boggle', players, result: { winner: 0, draw: false, forfeit: false } });
  }
  const game = topByGameWins('boggle', 5);
  assert.equal(game[0].id, a.id);
  assert.equal(game[0].wins >= 3, true);
  const weekly = topByWeeklyWins(5);
  assert.ok(weekly.some((r) => r.id === a.id));
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement db.js leaderboard queries**

```js
export function topByXp(limit = 20) {
  return db.prepare(
    `SELECT id, username, display_name, avatar, xp FROM users
     WHERE xp > 0 ORDER BY xp DESC, id ASC LIMIT ?`
  ).all(limit);
}

export function topByGameWins(gameId, limit = 20) {
  return db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar, ps.wins
     FROM player_stats ps JOIN users u ON u.id = ps.user_id
     WHERE ps.game_id = ? AND ps.wins > 0
     ORDER BY ps.wins DESC, u.id ASC LIMIT ?`
  ).all(gameId, limit);
}

export function topByWeeklyWins(limit = 20) {
  return db.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar, COUNT(*) AS wins
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     JOIN users u ON u.id = mp.user_id
     WHERE mp.result = 'win' AND m.created_at >= datetime('now', '-7 days')
     GROUP BY u.id ORDER BY wins DESC, u.id ASC LIMIT ?`
  ).all(limit);
}
```

- [ ] **Step 4: Routes in index.js**

```js
import { levelForXp } from './progression.js';
import { getDailyChallenges, utcDay } from './challenges.js';
import { getXp, getUnlockedAchievements, topByXp, topByGameWins, topByWeeklyWins } from './db.js';

app.get('/api/progression/me', authMiddleware, (req, res) => {
  const xp = getXp(req.user.id);
  res.json({ xp, level: levelForXp(xp), achievements: getUnlockedAchievements(req.user.id) });
});

app.get('/api/progression/challenges', authMiddleware, (req, res) => {
  const day = utcDay();
  res.json({ day, challenges: getDailyChallenges(req.user.id, day) });
});

app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const board = String(req.query.board || 'xp');
  let rows;
  if (board === 'game') rows = topByGameWins(String(req.query.gameId || ''), 20).map((r) => ({ ...r, value: r.wins }));
  else if (board === 'weekly') rows = topByWeeklyWins(20).map((r) => ({ ...r, value: r.wins }));
  else rows = topByXp(20).map((r) => ({ ...r, value: r.xp }));
  res.json({
    board,
    rows: rows.map((r, i) => ({
      rank: i + 1, userId: r.id, name: r.display_name || r.username,
      avatar: r.avatar, value: r.value, you: r.id === req.user.id,
    })),
  });
});
```

- [ ] **Step 5: Run tests** → `npm test --prefix server` PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.js server/src/index.js server/test/leaderboards.test.js
git commit -m "Progression A2: leaderboards + progression REST endpoints"
```

---

### Task 6: Level-gated unlockables

**Files:**
- Create: `server/src/unlocks.js`
- Modify: `server/src/auth.js` (validation), `server/src/index.js` (include unlocks in `/api/progression/me`)
- Modify: `client/src/preferences.js` (catalog mirror), profile modal in `client/src/pages/Lobby.jsx`
- Test: `server/test/unlocks.test.js`

**Interfaces:**
- Produces (unlocks.js):
  - `AVATARS` — existing six at `minLevel: 1` plus `{ id: 'flame', label: 'Flame', minLevel: 3 }, { id: 'ace', label: 'Ace', minLevel: 5 }, { id: 'rocket', label: 'Rocket', minLevel: 8 }, { id: 'gem', label: 'Gem', minLevel: 12 }, { id: 'dragon', label: 'Dragon', minLevel: 16 }, { id: 'mythic', label: 'Mythic', minLevel: 20 }`.
  - `FRAMES` — `none` (1), `bronze` (4), `silver` (7), `gold` (10), `neon` (14), `legend` (18).
  - `THEMES` — `default`/`light` (1), `arcade` (6).
  - `canUseAvatar(id, level)`, `canUseFrame(id, level)`, `unlocksForLevel(level)` → `{ avatars: [{id,label,minLevel,unlocked}], frames: […], themes: […] }`.
- auth.js: avatar/frame patch validation checks catalog + user level (`levelForXp(getXp(id))`); replaces the hardcoded `AVATAR_IDS` set.
- Client mirrors the catalog for display (locked items greyed with "Lv N" badge); server remains the enforcer.

- [ ] **Step 1: Write the failing test**

```js
// server/test/unlocks.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATARS, FRAMES, canUseAvatar, canUseFrame, unlocksForLevel } from '../src/unlocks.js';

test('original six avatars stay available at level 1', () => {
  for (const id of ['pilot', 'bolt', 'crown', 'target', 'spark', 'shield']) {
    assert.ok(canUseAvatar(id, 1), id);
  }
});

test('gated items unlock at their level and not before', () => {
  assert.ok(!canUseAvatar('dragon', 15));
  assert.ok(canUseAvatar('dragon', 16));
  assert.ok(!canUseFrame('gold', 9));
  assert.ok(canUseFrame('gold', 10));
  assert.ok(!canUseAvatar('nonexistent', 99));
});

test('unlocksForLevel flags each item', () => {
  const u = unlocksForLevel(7);
  assert.ok(u.avatars.find((a) => a.id === 'ace').unlocked);
  assert.ok(!u.avatars.find((a) => a.id === 'rocket').unlocked);
  assert.ok(u.frames.find((f) => f.id === 'silver').unlocked);
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement unlocks.js**

```js
// Level-gated cosmetics catalog. The server is the enforcer; the client
// mirrors this list for display only.
export const AVATARS = [
  { id: 'pilot', label: 'Pilot', minLevel: 1 },
  { id: 'bolt', label: 'Bolt', minLevel: 1 },
  { id: 'crown', label: 'Crown', minLevel: 1 },
  { id: 'target', label: 'Target', minLevel: 1 },
  { id: 'spark', label: 'Spark', minLevel: 1 },
  { id: 'shield', label: 'Shield', minLevel: 1 },
  { id: 'flame', label: 'Flame', minLevel: 3 },
  { id: 'ace', label: 'Ace', minLevel: 5 },
  { id: 'rocket', label: 'Rocket', minLevel: 8 },
  { id: 'gem', label: 'Gem', minLevel: 12 },
  { id: 'dragon', label: 'Dragon', minLevel: 16 },
  { id: 'mythic', label: 'Mythic', minLevel: 20 },
];

export const FRAMES = [
  { id: 'none', label: 'None', minLevel: 1 },
  { id: 'bronze', label: 'Bronze', minLevel: 4 },
  { id: 'silver', label: 'Silver', minLevel: 7 },
  { id: 'gold', label: 'Gold', minLevel: 10 },
  { id: 'neon', label: 'Neon', minLevel: 14 },
  { id: 'legend', label: 'Legend', minLevel: 18 },
];

export const THEMES = [
  { id: 'default', label: 'Console', minLevel: 1 },
  { id: 'light', label: 'Daylight', minLevel: 1 },
  { id: 'arcade', label: 'Arcade', minLevel: 6 },
];

const can = (list) => (id, level) => {
  const item = list.find((x) => x.id === id);
  return !!item && level >= item.minLevel;
};
export const canUseAvatar = can(AVATARS);
export const canUseFrame = can(FRAMES);

export function unlocksForLevel(level) {
  const mark = (list) => list.map((x) => ({ ...x, unlocked: level >= x.minLevel }));
  return { avatars: mark(AVATARS), frames: mark(FRAMES), themes: mark(THEMES) };
}
```

- [ ] **Step 4: Enforce in auth.js + expose in /api/progression/me**

In `auth.js` replace the `AVATAR_IDS` set usage inside `profilePatch` — `profilePatch(body, level)` now takes the caller's level:

```js
import { canUseAvatar, canUseFrame } from './unlocks.js';
// avatar branch:
if (!canUseAvatar(avatar, level)) return { error: 'That avatar is locked.' };
// new frame branch (same shape as avatar):
if (Object.prototype.hasOwnProperty.call(body, 'frame')) {
  const frame = String(body.frame || '').trim();
  if (!canUseFrame(frame, level)) return { error: 'That frame is locked.' };
  patch.frame = frame;
}
```

In the PATCH route compute level first:

```js
import { levelForXp } from './progression.js';
import { getXp } from './db.js';
// in router.patch('/me/profile'):
const level = levelForXp(getXp(req.user.id)).level;
const { patch, error } = profilePatch(req.body || {}, level);
```

`db.js`: add `frame` to `publicUser` (`frame: user.frame || 'none'`) and to `updateUserProfile`'s patch fields (mirror `avatar`). `index.js`: extend `/api/progression/me` response with `unlocks: unlocksForLevel(levelForXp(xp).level)`.

- [ ] **Step 5: Client catalog mirror + profile UI**

`client/src/preferences.js`: extend `PROFILE_AVATARS` with the six new entries (icons: Flame 'F', Ace 'A', Rocket 'R', Gem 'G', Dragon 'D', Mythic 'M') and add `PROFILE_FRAMES` with the six frame ids/labels; keep `normalizeSettings` accepting any catalog avatar. In the Lobby profile modal, render avatar/frame options from the `/api/progression/me` `unlocks` payload when available (fall back to all-unlocked when absent): locked items get class `locked`, a `Lv {minLevel}` badge, and `disabled`.

CSS:

```css
.avatar-option.locked { opacity: 0.45; filter: grayscale(0.8); position: relative; }
.avatar-option .lock-badge {
  position: absolute; bottom: -4px; right: -4px;
  font-size: 9px; padding: 1px 5px; border-radius: 999px;
  background: var(--surface-2); border: 1px solid var(--border); color: var(--muted);
}
.profile-avatar.frame-bronze { box-shadow: 0 0 0 2px #b0793f; }
.profile-avatar.frame-silver { box-shadow: 0 0 0 2px #b9c4d6; }
.profile-avatar.frame-gold   { box-shadow: 0 0 0 2px var(--amber), 0 0 12px color-mix(in srgb, var(--amber) 40%, transparent); }
.profile-avatar.frame-neon   { box-shadow: 0 0 0 2px var(--teal), 0 0 14px color-mix(in srgb, var(--teal) 50%, transparent); }
.profile-avatar.frame-legend { box-shadow: 0 0 0 2px transparent; background-image: var(--grad); }
```

Apply `frame-{id}` class wherever `.profile-avatar` renders from a user object (topbar chip, party slots, podium names later).

- [ ] **Step 6: Run tests (both suites) + commit**

`npm test --prefix server && node --test client/test/` → PASS.

```bash
git add server/src/unlocks.js server/src/auth.js server/src/index.js server/src/db.js client/src/preferences.js client/src/pages/Lobby.jsx client/src/styles.css server/test/unlocks.test.js
git commit -m "Progression A2: level-gated avatars, frames, themes"
```

---

### Task 7: Client progression UI

**Files:**
- Modify: `client/src/api.js`, `client/src/pages/Home.jsx`, `client/src/pages/Lobby.jsx`, `client/src/pages/Game.jsx`, `client/src/styles.css`
- Test: `client/test/progressionUi.test.js`

**Interfaces:**
- Consumes: `GET /api/progression/me`, `GET /api/progression/challenges`, `GET /api/leaderboard`, socket `progression:update` (Task 4 payload), podium slot `.podium-progression` (A1 Task 6).
- Produces: `progression` state in Home `{ xp, level, achievements }` + `lastMatchProgression` (from the socket event, cleared on leaving a game); Lobby props `progression`, `challenges`, `onShowLeaderboard`; Game prop `progression` (the per-match summary).

- [ ] **Step 1: Write the failing test**

```js
// client/test/progressionUi.test.js
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
  assert.match(lobby, /className="level-chip"/);
  assert.match(css, /\.level-chip\s*{/);
  assert.match(css, /\.xp-ring\s*{[^}]*conic-gradient/s);
});

test('podium fills the progression slot with XP + level-up + achievements', () => {
  assert.match(game, /podium-xp/);
  assert.match(game, /level-up/);
  assert.match(css, /\.podium-progression\s*{/);
});

test('home shows the daily challenges rail', () => {
  assert.match(lobby, /className="challenge-card"/);
  assert.match(css, /\.challenge-bar\s*{/);
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: api.js additions**

Follow the existing `api` object call style in `client/src/api.js`:

```js
getProgression: (token) => request('/api/progression/me', { token }),
getChallenges: (token) => request('/api/progression/challenges', { token }),
getLeaderboard: (token, board = 'xp', gameId = '') =>
  request(`/api/leaderboard?board=${board}${gameId ? `&gameId=${gameId}` : ''}`, { token }),
```

(Match the file's actual helper name/signature — read it before editing.)

- [ ] **Step 4: Home.jsx state + socket wiring**

```jsx
const [progression, setProgression] = useState(null);       // { xp, level, achievements, unlocks }
const [challenges, setChallenges] = useState(null);         // { day, challenges }
const [lastMatchProgression, setLastMatchProgression] = useState(null);

useEffect(() => {
  if (!token) return;
  api.getProgression(token).then(setProgression).catch(() => {});
  api.getChallenges(token).then(setChallenges).catch(() => {});
}, [token]);
```

In the socket-wiring effect add:

```jsx
socket.on('progression:update', (summary) => {
  setLastMatchProgression(summary);
  setProgression((prev) => prev ? { ...prev, xp: summary.xp, level: summary.level } : prev);
  api.getChallenges(token).then(setChallenges).catch(() => {});
});
```

Clear it in `onLeave` (`setLastMatchProgression(null)`) and on `game:start`. Pass `progression={lastMatchProgression}` to `<Game>`, and `progression={progression}` + `challenges={challenges}` + `onShowLeaderboard` (fetch + open modal state, mirroring `onShowStats`) to `<Lobby>`.

- [ ] **Step 5: Lobby header chip + challenges rail + leaderboard modal**

Header chip (next to the profile chip; render only when `progression`):

```jsx
{progression && (
  <button className="level-chip ghost" onClick={onShowLeaderboard} title="Leaderboards">
    <span className="xp-ring" style={{ '--xp-pct': `${Math.round(100 * progression.level.intoLevel / progression.level.neededForNext)}%` }}>
      <b>{progression.level.level}</b>
    </span>
    <span className="level-chip-copy">
      <b>Level {progression.level.level}</b>
      <small>{progression.level.intoLevel}/{progression.level.neededForNext} XP</small>
    </span>
  </button>
)}
```

Challenges rail on Home (between hero and Continue playing; render when `challenges?.challenges?.length`):

```jsx
<section className="home-rail">
  <h3 className="home-rail-title">Daily challenges</h3>
  <div className="challenge-row">
    {challenges.challenges.map((c) => (
      <div key={c.id} className={`challenge-card${c.completed ? ' done' : ''}`}>
        <span className="challenge-icon">{c.icon}</span>
        <span className="challenge-copy">
          <b>{c.name}</b>
          <small>{c.desc}</small>
          <span className="challenge-bar"><i style={{ width: `${Math.min(100, 100 * c.progress / c.target)}%` }} /></span>
        </span>
        <span className="challenge-xp">{c.completed ? '✓' : `+${c.xp} XP`}</span>
      </div>
    ))}
  </div>
</section>
```

Leaderboard modal (new modal in Lobby, using the existing `Modal` component + tabs `XP / Weekly / Per-game` where per-game shows a game `<select>` of registry games; rows show rank, avatar initial, name, value; highlight `you`).

Profile badges: in the existing profile modal, add a "Badges" section listing unlocked achievements (`progression.achievements` ids mapped against a client mirror of `{id, name, icon}` — export `ACHIEVEMENT_META` from a new tiny `client/src/achievementMeta.js` kept in sync with the server catalog's id/name/icon/desc fields) rendered as `.badge-tile` chips; locked ones are not shown (badges are earned, not browsed).

CSS:

```css
.level-chip { display: flex; align-items: center; gap: 8px; }
.xp-ring {
  width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center;
  background:
    radial-gradient(circle, var(--panel-solid) 58%, transparent 59%),
    conic-gradient(var(--accent) var(--xp-pct, 0%), var(--surface-2) 0);
  font-family: var(--display);
}
.level-chip-copy { display: grid; text-align: left; line-height: 1.15; }
.level-chip-copy small { color: var(--muted); font-size: 10px; }
.challenge-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.challenge-card {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 12px; border-radius: 14px;
  border: 1px solid var(--border); background: var(--panel);
  backdrop-filter: blur(var(--panel-blur));
}
.challenge-card.done { border-color: color-mix(in srgb, var(--green) 55%, transparent); }
.challenge-copy { flex: 1; display: grid; gap: 3px; }
.challenge-copy small { color: var(--muted); }
.challenge-bar { height: 5px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.challenge-bar i { display: block; height: 100%; background: var(--grad); border-radius: 99px; transition: width 0.4s var(--ease); }
.challenge-xp { font-family: var(--display); color: var(--accent); font-size: 12px; white-space: nowrap; }
.leaderboard-row.you { background: color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 8px; }
```

- [ ] **Step 6: Podium progression stage in Game.jsx**

Fill the dormant `.podium-progression` slot (A1 Task 6). `progression` here is the per-match summary from `progression:update`:

```jsx
{progression && (
  <div className="podium-progression">
    <div className="podium-xp">
      <span>+{progression.xpGained} XP</span>
      <span className="podium-xp-bar">
        <i style={{ width: `${Math.round(100 * progression.level.intoLevel / progression.level.neededForNext)}%` }} />
      </span>
      <small>Level {progression.level.level} · {progression.level.intoLevel}/{progression.level.neededForNext}</small>
    </div>
    {progression.leveledUp && <div className="level-up">⬆ Level {progression.level.level}!</div>}
    {progression.achievements?.length > 0 && (
      <div className="podium-achievements">
        {progression.achievements.map((a) => (
          <span key={a.id} className="achievement-pop" title={a.desc}>{a.icon} {a.name} <small>+{a.xp} XP</small></span>
        ))}
      </div>
    )}
  </div>
)}
```

CSS (bar animates in via the same width-transition trick as `.challenge-bar`; `.level-up` gets a spring scale-in keyframe; `.achievement-pop` staggered `animation-delay`):

```css
.podium-progression { display: grid; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.podium-xp { display: grid; gap: 4px; }
.podium-xp > span:first-child { font-family: var(--display); color: var(--accent); font-size: 18px; }
.podium-xp-bar { height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.podium-xp-bar i { display: block; height: 100%; background: var(--grad); transition: width 0.9s var(--ease); }
.level-up {
  font-family: var(--display); font-size: 20px; color: var(--amber);
  animation: levelPop 0.6s var(--ease-spring);
}
@keyframes levelPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.achievement-pop {
  display: inline-flex; gap: 6px; align-items: center;
  padding: 6px 10px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--amber) 45%, transparent);
  background: color-mix(in srgb, var(--amber) 10%, transparent);
  animation: levelPop 0.5s var(--ease-spring) backwards;
}
.podium-achievements .achievement-pop:nth-child(2) { animation-delay: 0.15s; }
.podium-achievements .achievement-pop:nth-child(3) { animation-delay: 0.3s; }
```

- [ ] **Step 7: Run everything, play a match, commit**

```bash
node --test client/test/ && npm test --prefix server
```
Then play a bot match end-to-end in the browser: podium shows +XP with the bar filling, header chip updates, challenges rail progresses, leaderboard modal lists you.

```bash
git add client/src client/test/progressionUi.test.js
git commit -m "Progression A2: level chip, challenges rail, leaderboards, podium XP"
```

---

### Task 8: A2 verification sweep

- [ ] **Step 1:** `npm test --prefix server && node --test client/test/` → all PASS.
- [ ] **Step 2:** Browser sweep: fresh account → play matches vs bot → watch XP/level/achievements/challenges accumulate; verify locked avatar rejected via devtools PATCH; leaderboard boards render; mobile viewport for the chip/rail.
- [ ] **Step 3:** Commit fix-ups: `git add -A && git commit -m "Progression A2: verification fix-ups"`.
