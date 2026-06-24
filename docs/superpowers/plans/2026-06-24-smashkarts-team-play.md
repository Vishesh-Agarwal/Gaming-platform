# Smash Karts Team Play + Expanded Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2-team play (2v2/3v3/4v4) alongside free-for-all to Smash Karts — 8-player support, lobby team selection, team colors, team-aware combat (no friendly fire), team scoring, and a new 8-spawn `coliseum` map.

**Architecture:** Server-authoritative teams/combat/scoring in `server/src/games/karts.js`; lobby team selection in `server/src/lobbies.js` + a new `lobby:team` socket event; mode rides the existing host-only `lobby:options`. Teams ride the start payload as `options.teams` (aligned to `userIds`) → `createSim`/`createInitialState`. Client renders team colors + per-player markers, a team HUD, and a team end-overlay. The new map is data added to both byte-identical `kartMaps.js` copies.

**Tech Stack:** Node ESM, `node --test` (`npm test --prefix server`); React + Vite + Three.js client (`npm run build --prefix client`).

## Global Constraints

- Movement physics (`kartPhysics.js`) is untouched. `kartMaps.js` stays byte-identical between `server/src/games/kartMaps.js` and `client/src/games/karts/kartMaps.js` (parity test).
- FFA behavior is preserved exactly except the per-player palette grows from 4 to 8 colors.
- Modes: `ffa` (default for any unknown value) and `teams`. Friendly fire is OFF in Teams (teammates can't be MG-locked or damaged by rocket/mine; owner can still trigger own mine). Hazards self-damage unchanged; kill credit unchanged.
- Teams: red = team 0, blue = team 1. Each kart keeps a per-player marker so teammates differ.
- Teams start gate: both teams non-empty AND `|teamA − teamB| ≤ 1`.
- `maxPlayers` = 8, `minPlayers` = 2.
- `result`/`snapshot` add team data; the snapshot `proj`/`crates` shapes are unchanged.
- Original assets only; no new dependencies. Server suite stays green and gains coverage.
- Exact palettes: `COLORS = ['#ff5d6c','#5cc8ff','#8bd450','#ffd24a','#c87bff','#ff9f43','#2ee6c0','#f25fbf']`; `TEAM_COLORS = ['#ff5d6c','#5cc8ff']`.

---

### Task 1: Expanded `coliseum` map

**Files:**
- Modify: `server/src/games/kartMaps.js` (add `coliseum` to `MAPS`)
- Modify: `client/src/games/karts/kartMaps.js` (identical addition — keep byte-identical)
- Modify: `client/src/games/karts/materialParams.js` (add a `coliseum` ground-params entry)
- Test: `server/test/coliseum.test.js`

**Interfaces:**
- Consumes: `getMap`, `surfaceHeight`, `integrateKart`, `SIM_DT` (existing).
- Produces: a new map `coliseum` with `arena {w:110,d:110}`, 8 spawns (first 4 north `z<0` = side A, last 4 south `z>0` = side B), a central climbable plateau, 2 lava hazards, boosts, pillar/box cover, 6 pads.

- [ ] **Step 1: Write the failing test**

Create `server/test/coliseum.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../src/games/kartMaps.js';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';

test('coliseum exists with a 110x110 arena and 8 spawns', () => {
  const m = getMap('coliseum');
  assert.equal(m.id, 'coliseum');
  assert.equal(m.arena.w, 110);
  assert.equal(m.arena.d, 110);
  assert.equal(m.spawns.length, 8);
});

test('coliseum spawns are side-split: first 4 north (z<0), last 4 south (z>0)', () => {
  const m = getMap('coliseum');
  for (let i = 0; i < 4; i++) assert.ok(m.spawns[i].z < 0, `spawn ${i} should be north`);
  for (let i = 4; i < 8; i++) assert.ok(m.spawns[i].z > 0, `spawn ${i} should be south`);
});

test('coliseum has a central plateau at height 4 and ground at 0', () => {
  const m = getMap('coliseum');
  assert.equal(surfaceHeight(m, 0, 0), 4);   // plateau top
  assert.equal(surfaceHeight(m, 0, -46), 0); // spawn area is ground
});

test('coliseum central plateau is drive-up reachable via the north ramp', () => {
  const m = getMap('coliseum');
  // start just below the north ramp, drive straight forward (+z) up onto the plateau
  const k = { x: 0, z: -26, heading: 0, vel: 0, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 200 && k.z < 0; i++) {
    integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, m);
  }
  assert.ok(k.y >= 3.5, `expected to climb onto the plateau, got y=${k.y}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `getMap('coliseum')` falls back to `arena` (id mismatch, 4 spawns).

- [ ] **Step 3: Add the map to BOTH `kartMaps.js` copies (identical text)**

In `server/src/games/kartMaps.js`, add this entry to the `MAPS` object (after `launchpad`, before the closing `};`):

```js
  coliseum: {
    id: 'coliseum', name: 'Coliseum', arena: { w: 110, d: 110 },
    obstacles: [
      // pillar cover (LOS breaks for the auto-MG)
      { kind: 'cyl', x: -32, z: -16, r: 3 },
      { kind: 'cyl', x: 32, z: -16, r: 3 },
      { kind: 'cyl', x: -32, z: 16, r: 3 },
      { kind: 'cyl', x: 32, z: 16, r: 3 },
      // low box cover near each spawn zone
      { kind: 'box', x: 0, z: -34, w: 16, d: 4 },
      { kind: 'box', x: 0, z: 34, w: 16, d: 4 },
    ],
    ramps: [
      // central climbable plateau (x:-10..10, z:-10..10), height 4
      { kind: 'wedge', x: 0, z: 0, w: 20, d: 20, axis: 'z', loY: 4, hiY: 4 },
      // north connector ramp: high edge (4) abuts plateau z=-10
      { kind: 'wedge', x: 0, z: -17, w: 12, d: 14, axis: 'z', loY: 0, hiY: 4 },
      // south connector ramp: high edge (4) abuts plateau z=10
      { kind: 'wedge', x: 0, z: 17, w: 12, d: 14, axis: 'z', loY: 4, hiY: 0 },
    ],
    hazards: [
      { x: -28, z: 0, r: 7, dmg: 40 },
      { x: 28, z: 0, r: 7, dmg: 40 },
    ],
    boosts: [
      { x: 0, z: -42, r: 5, strength: 46 },
      { x: 0, z: 42, r: 5, strength: 46 },
    ],
    spawns: [
      { x: -30, z: -46, heading: 0 },
      { x: -10, z: -46, heading: 0 },
      { x: 10, z: -46, heading: 0 },
      { x: 30, z: -46, heading: 0 },
      { x: -30, z: 46, heading: 3.1416 },
      { x: -10, z: 46, heading: 3.1416 },
      { x: 10, z: 46, heading: 3.1416 },
      { x: 30, z: 46, heading: 3.1416 },
    ],
    pads: [[0, -22], [0, 22], [-42, 0], [42, 0], [-22, -22], [22, 22]],
  },
```

Then apply the **identical** addition to `client/src/games/karts/kartMaps.js` (same object, same place). The two files must stay byte-identical.

- [ ] **Step 4: Add a ground-params entry**

In `client/src/games/karts/materialParams.js`, add to the `GROUND_PARAMS` object:

```js
  coliseum:  { grassRatio: 0.28, asphalt: '#3a3c41', grass: '#4a6b32' },
```

- [ ] **Step 5: Run tests + parity + build**

Run: `npm test --prefix server`
Expected: PASS — coliseum tests green, and `mapsParity.test.js` still passes (both copies identical), `maps.test.js` still passes (valid shapes).

Run: `npm run build --prefix client`
Expected: `✓ built in <time>`.

- [ ] **Step 6: Commit**

```bash
git add server/src/games/kartMaps.js client/src/games/karts/kartMaps.js client/src/games/karts/materialParams.js server/test/coliseum.test.js
git commit -m "feat(karts): add 8-spawn coliseum map for team play"
```

---

### Task 2: Server teams core (state, modes, palettes, spawns)

**Files:**
- Modify: `server/src/games/karts.js` (`COLORS`, new `TEAM_COLORS`, modes, `createInitialState`, `createSim`, respawn, `maxPlayers`)
- Test: `server/test/teams.test.js`

**Interfaces:**
- Consumes: existing `getMap`, `surfaceHeight`.
- Produces:
  - `modes: [{id:'ffa',name:'Free-for-all'},{id:'teams',name:'Teams'}]` on the default export; `maxPlayers: 8`.
  - `createInitialState(options)` returns `{ arena, colors, teamColors, mode, teams, realtime:true, maxPlayers:8, mapId }`.
  - `createSim` sets per-kart `team` (0/1 or null) and `spawnIdx`; `sim.mode`. Teams spawn by side; FFA uses `i % len`. Respawn uses `kart.spawnIdx`.

- [ ] **Step 1: Write the failing test**

Create `server/test/teams.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

test('declares ffa + teams modes and 8 maxPlayers', () => {
  assert.equal(game.maxPlayers, 8);
  assert.deepEqual(game.modes.map((m) => m.id), ['ffa', 'teams']);
});

test('createInitialState resolves mode and exposes palettes', () => {
  const ffa = game.createInitialState({ map: 'coliseum' });
  assert.equal(ffa.mode, 'ffa');
  assert.equal(ffa.maxPlayers, 8);
  assert.equal(ffa.colors.length, 8);
  assert.equal(ffa.teamColors.length, 2);
  assert.equal(ffa.teams, null);

  const teams = game.createInitialState({ map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  assert.equal(teams.mode, 'teams');
  assert.deepEqual(teams.teams, [0, 1, 0, 1]);

  const bad = game.createInitialState({ map: 'coliseum', mode: 'nonsense' });
  assert.equal(bad.mode, 'ffa'); // unknown -> ffa
});

test('createSim assigns teams from options.teams and side-split spawns', () => {
  const players = [{}, {}, {}, {}];
  const sim = game.createSim(players, 0, { map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  assert.equal(sim.mode, 'teams');
  assert.deepEqual(sim.karts.map((k) => k.team), [0, 1, 0, 1]);
  // team 0 karts spawn north (z<0), team 1 south (z>0)
  assert.ok(sim.karts[0].z < 0 && sim.karts[2].z < 0);
  assert.ok(sim.karts[1].z > 0 && sim.karts[3].z > 0);
  // distinct spawn slots within a side
  assert.notEqual(sim.karts[0].spawnIdx, sim.karts[2].spawnIdx);
});

test('FFA createSim leaves team null and uses i % spawns', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'coliseum' });
  assert.equal(sim.mode, 'ffa');
  assert.deepEqual(sim.karts.map((k) => k.team), [null, null]);
  assert.equal(sim.karts[0].spawnIdx, 0);
  assert.equal(sim.karts[1].spawnIdx, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `game.maxPlayers` is 4, no `modes`, `mode`/`teamColors`/`teams`/`team`/`spawnIdx` undefined.

- [ ] **Step 3: Implement**

In `server/src/games/karts.js`:

(a) Replace the `COLORS` line and add team colors:

```js
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a', '#c87bff', '#ff9f43', '#2ee6c0', '#f25fbf'];
const TEAM_COLORS = ['#ff5d6c', '#5cc8ff'];
```

(b) Replace `createInitialState`:

```js
function createInitialState(options) {
  const map = getMap(options?.map);
  const mode = options?.mode === 'teams' ? 'teams' : 'ffa';
  const teams = mode === 'teams' && Array.isArray(options?.teams) ? options.teams : null;
  return { arena: map.arena, colors: COLORS, teamColors: TEAM_COLORS, mode, teams, realtime: true, maxPlayers: 8, mapId: map.id };
}
```

(c) Replace `createSim`:

```js
function createSim(players, now = Date.now(), options) {
  const map = getMap(options?.map);
  const mode = options?.mode === 'teams' ? 'teams' : 'ffa';
  const teams = mode === 'teams' && Array.isArray(options?.teams) ? options.teams : null;
  const h = Math.floor(map.spawns.length / 2);
  let aIdx = 0, bIdx = 0;
  const karts = players.map((p, i) => {
    const team = teams ? (teams[i] === 1 ? 1 : 0) : null;
    let spawnIdx;
    if (team === 0) { spawnIdx = aIdx % h; aIdx++; }
    else if (team === 1) { spawnIdx = h + (bIdx % (map.spawns.length - h)); bIdx++; }
    else { spawnIdx = i % map.spawns.length; }
    const s = map.spawns[spawnIdx];
    return {
      x: s.x, z: s.z, heading: s.heading, vel: 0,
      y: surfaceHeight(map, s.x, s.z), vy: 0, grounded: true,
      hp: HP_MAX, alive: true, respawnAt: 0, kills: 0,
      weapon: null, ammo: 0, shieldUntil: 0,
      prevFire: false, queue: [], nextShotAt: 0, gone: false, lastSeq: 0,
      team, spawnIdx,
    };
  });
  return {
    mapId: map.id,
    mode,
    karts,
    crates: map.pads.map(([x, z]) => ({ x, z, type: null, readyAt: now + COUNTDOWN_MS })),
    projectiles: [],
    nextPid: 1,
    startAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + MATCH_MS,
    over: false,
  };
}
```

(d) In `step`, the respawn block currently reads `const s = map.spawns[i % map.spawns.length];`. Replace that single line (inside the `if (now >= k.respawnAt)` block) with:

```js
        const s = map.spawns[k.spawnIdx];
```

(e) In the default export, change `maxPlayers: 4,` to `maxPlayers: 8,` and add the modes line after `name: 'Smash Karts',`:

```js
  modes: [{ id: 'ffa', name: 'Free-for-all' }, { id: 'teams', name: 'Teams' }],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — `teams` tests green; existing tests (incl. `prediction`, `projectiles3d`, `autoMg`) still green (FFA spawnIdx == i%len keeps respawn identical).

- [ ] **Step 5: Commit**

```bash
git add server/src/games/karts.js server/test/teams.test.js
git commit -m "feat(karts): team state, modes, 8 players, side-split spawns"
```

---

### Task 3: Team-aware combat + scoring

**Files:**
- Modify: `server/src/games/karts.js` (`sameTeam` helper, `nearestTarget`, rocket + mine hit-tests, `snapshot`, `result`)
- Test: `server/test/teamCombat.test.js`

**Interfaces:**
- Consumes: `team` on karts + `sim.mode` (Task 2).
- Produces: friendly-fire-off combat; `snapshot` karts carry `team`, snapshot adds `teams` totals (or null); `result` returns team winner in Teams mode.

- [ ] **Step 1: Write the failing test**

Create `server/test/teamCombat.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import game, { nearestTarget } from '../src/games/karts.js';

const openMap = { arena: { w: 120, d: 120 }, obstacles: [], ramps: [] };

function teamSim(positions, teams) {
  return {
    mode: 'teams',
    karts: positions.map(([x, z], i) => ({
      x, z, y: 0, alive: true, gone: false, team: teams[i], kills: 0,
    })),
  };
}

test('nearestTarget skips a teammate and locks an enemy', () => {
  // shooter 0 (team 0); kart 1 teammate at dist 3; kart 2 enemy at dist 6
  const sim = teamSim([[0, 0], [3, 0], [6, 0]], [0, 0, 1]);
  assert.equal(nearestTarget(sim, 0, openMap), 2);
});

test('nearestTarget returns null when only a teammate is in range', () => {
  const sim = teamSim([[0, 0], [3, 0]], [0, 0]);
  assert.equal(nearestTarget(sim, 0, openMap), null);
});

test('snapshot carries per-kart team and team totals; result picks the winning team', () => {
  const sim = game.createSim([{}, {}, {}, {}], 0, { map: 'coliseum', mode: 'teams', teams: [0, 1, 0, 1] });
  sim.karts[0].kills = 3; sim.karts[2].kills = 1; // team 0 total 4
  sim.karts[1].kills = 2; sim.karts[3].kills = 1; // team 1 total 3
  const snap = game.snapshot(sim, sim.startAt + 1000);
  assert.deepEqual(snap.karts.map((k) => k.team), [0, 1, 0, 1]);
  assert.deepEqual(snap.teams, [4, 3]);
  const r = game.result(sim);
  assert.equal(r.mode, 'teams');
  assert.equal(r.winner, 0);
  assert.equal(r.draw, false);
  assert.deepEqual(r.teams, [4, 3]);
});

test('FFA snapshot has null teams and result is unchanged', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'coliseum' });
  const snap = game.snapshot(sim, sim.startAt + 1000);
  assert.equal(snap.teams, null);
  const r = game.result(sim);
  assert.equal(r.mode, undefined);
  assert.ok('scores' in r);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — teammate not skipped; `snap.teams`/`k.team` undefined; `result` has no team branch.

- [ ] **Step 3: Implement**

In `server/src/games/karts.js`:

(a) Add a helper next to `damage`/`killKart` (e.g. just above `nearestTarget`):

```js
// Two karts are teammates only when both carry the same non-null team.
function sameTeam(a, b) { return a && b && a.team != null && a.team === b.team; }
```

(b) In `nearestTarget`, add a teammate skip — after the `if (!t.alive || t.gone) continue;` line:

```js
    if (sameTeam(k, t)) continue;
```

(c) Rocket hit-test (the `else if (!pr.cosmetic)` loop): after `if (i === pr.owner) continue;` add:

```js
          if (sameTeam(sim.karts[pr.owner], k)) continue; // no friendly fire
```

(d) Mine trigger loop (the `else if (now >= pr.armAt)` loop): after `if (!k.alive || k.gone) continue;` add:

```js
          if (i !== pr.owner && sameTeam(sim.karts[pr.owner], k)) continue; // teammates safe; owner can still self-trigger
```

(e) In `snapshot`, add `team: k.team ?? null,` to each kart entry object, and add a `teams` field to the returned object (after the `kills:` line):

```js
    teams: sim.mode === 'teams'
      ? [0, 1].map((t) => sim.karts.reduce((s, k) => s + (k.team === t ? k.kills : 0), 0))
      : null,
```

(f) Replace `result` with a team-aware version:

```js
function result(sim) {
  const kills = sim.karts.map((k) => k.kills);
  if (sim.mode === 'teams') {
    const teams = [0, 1].map((t) => sim.karts.reduce((s, k) => s + (k.team === t ? k.kills : 0), 0));
    const draw = teams[0] === teams[1];
    return { over: true, mode: 'teams', winner: draw ? null : (teams[0] > teams[1] ? 0 : 1), draw, teams, scores: kills };
  }
  let best = -1, winner = null, tie = false;
  for (let i = 0; i < sim.karts.length; i++) {
    if (sim.karts[i].gone) continue;
    if (kills[i] > best) { best = kills[i]; winner = i; tie = false; }
    else if (kills[i] === best) tie = true;
  }
  return { over: true, winner: tie ? null : winner, draw: tie, scores: kills };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — `teamCombat` green; `autoMg`/`autoMgSelect` (FFA, no `team`) still green because `sameTeam` is false when either kart lacks a team.

- [ ] **Step 5: Commit**

```bash
git add server/src/games/karts.js server/test/teamCombat.test.js
git commit -m "feat(karts): team-aware combat (no friendly fire) + team scoring"
```

---

### Task 4: Lobby team selection (server)

**Files:**
- Modify: `server/src/lobbies.js` (member `team`, default on join, `setMemberTeam`, `publicLobby`, `startLobby` validation + teams payload)
- Modify: `server/src/socketHandlers.js` (new `lobby:team` event)
- Test: `server/test/lobbyTeams.test.js`

**Interfaces:**
- Consumes: existing lobby functions.
- Produces:
  - members carry `team` (0/1); `publicLobby` includes it.
  - `setMemberTeam(userId, team) -> { lobby } | { error }`.
  - `startLobby` (Teams mode) blocks empty/unbalanced teams and returns `options.teams` aligned to `userIds`.

- [ ] **Step 1: Write the failing test**

Create `server/test/lobbyTeams.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobby, joinLobby, setReady, setMemberTeam, setLobbyOptions, startLobby, publicLobby } from '../src/lobbies.js';

const u = (id) => ({ id, username: `u${id}` });

test('host starts on team 0; joiners auto-place on the smaller team', () => {
  const { lobby } = createLobby(u(1), 'karts');
  assert.equal(lobby.members[0].team, 0);
  joinLobby(lobby.id, u(2)); // teams 1=0 -> smaller is team1 -> 0? counts a=1,b=0 -> place on b(1)
  joinLobby(lobby.id, u(3));
  joinLobby(lobby.id, u(4));
  const counts = [0, 1].map((t) => lobby.members.filter((m) => m.team === t).length);
  assert.deepEqual(counts, [2, 2]); // balanced by auto-place
  assert.ok(publicLobby(lobby).members.every((m) => m.team === 0 || m.team === 1));
});

test('setMemberTeam swaps a member team', () => {
  const { lobby } = createLobby(u(10), 'karts');
  joinLobby(lobby.id, u(11));
  const before = lobby.members.find((m) => m.id === 11).team;
  setMemberTeam(11, before === 0 ? 1 : 0);
  assert.notEqual(lobby.members.find((m) => m.id === 11).team, before);
});

test('teams-mode start blocks unbalanced teams and passes aligned teams on balance', () => {
  const { lobby } = createLobby(u(20), 'karts');
  joinLobby(lobby.id, u(21));
  joinLobby(lobby.id, u(22));
  joinLobby(lobby.id, u(23));
  setLobbyOptions(20, { mode: 'teams' });
  // force 3 vs 1
  for (const id of [20, 21, 22]) setMemberTeam(id, 0);
  setMemberTeam(23, 1);
  for (const m of lobby.members) setReady(m.id, true);
  const bad = startLobby(20);
  assert.ok(bad.error, 'unbalanced teams should be blocked');
  // rebalance 2v2
  setMemberTeam(22, 1);
  for (const m of lobby.members) setReady(m.id, true);
  const ok = startLobby(20);
  assert.ok(!ok.error, ok.error);
  assert.equal(ok.options.teams.length, ok.userIds.length);
  ok.options.teams.forEach((t) => assert.ok(t === 0 || t === 1));
});

test('ffa-mode start ignores team balance', () => {
  const { lobby } = createLobby(u(30), 'karts');
  joinLobby(lobby.id, u(31));
  for (const m of lobby.members) setReady(m.id, true);
  const out = startLobby(30); // default mode ffa
  assert.ok(!out.error, out.error);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --prefix server`
Expected: FAIL — `setMemberTeam` is not exported; members have no `team`.

- [ ] **Step 3: Implement in `server/src/lobbies.js`**

(a) In `createLobby`, give the host a team — change the `members:` line to:

```js
    members: [{ id: user.id, username: user.username, ready: false, team: 0 }],
```

(b) In `joinLobby`, default the new member to the smaller team. Replace the push line:

```js
  lobby.members.push({ id: user.id, username: user.username, ready: false });
```
with:
```js
  const a = lobby.members.filter((m) => m.team === 0).length;
  const b = lobby.members.filter((m) => m.team === 1).length;
  lobby.members.push({ id: user.id, username: user.username, ready: false, team: a <= b ? 0 : 1 });
```

(c) In `publicLobby`, include `team` — change the members map to:

```js
    members: lobby.members.map((m) => ({ id: m.id, username: m.username, ready: m.ready, team: m.team ?? 0 })),
```

(d) Add `setMemberTeam` (after `setReady`):

```js
export function setMemberTeam(userId, team) {
  const lobby = getLobbyForUser(userId);
  if (!lobby) return { error: 'You are not in a lobby.' };
  const m = lobby.members.find((x) => x.id === userId);
  if (m) m.team = team === 1 ? 1 : 0;
  return { lobby };
}
```

(e) In `startLobby`, after the existing ready check and before building `userIds`, add the teams-mode validation, and include `teams` in the options. Replace this block:

```js
  const userIds = lobby.members.map((m) => m.id);
  const out = { gameId: lobby.gameId, options: lobby.options, userIds };
```
with:
```js
  if (lobby.options?.mode === 'teams') {
    const a = lobby.members.filter((m) => (m.team ?? 0) === 0).length;
    const b = lobby.members.filter((m) => (m.team ?? 0) === 1).length;
    if (a === 0 || b === 0 || Math.abs(a - b) > 1) {
      return { error: 'Teams must be balanced (and non-empty).' };
    }
  }
  const userIds = lobby.members.map((m) => m.id);
  const teams = lobby.members.map((m) => m.team ?? 0);
  const out = { gameId: lobby.gameId, options: { ...(lobby.options || {}), teams }, userIds };
```

- [ ] **Step 4: Add the socket event in `server/src/socketHandlers.js`**

Import `setMemberTeam` — add it to the existing import from `./lobbies.js` (alongside `setReady`, `setLobbyOptions`, etc.).

Add this handler right after the `lobby:options` handler:

```js
    socket.on('lobby:team', (payload, ack) => {
      const { lobby, error } = setMemberTeam(me.id, Number(payload?.team));
      if (error) return ack?.({ error });
      broadcastLobby(lobby);
      ack?.({ ok: true });
    });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test --prefix server`
Expected: PASS — `lobbyTeams` green; existing `lobbyOptions` test still green.

- [ ] **Step 6: Commit**

```bash
git add server/src/lobbies.js server/src/socketHandlers.js server/test/lobbyTeams.test.js
git commit -m "feat(lobby): per-player team selection + balanced-teams start gate"
```

---

### Task 5: Lobby UI (mode selector + team picker)

**Files:**
- Modify: `client/src/components/LobbyModal.jsx` (mode selector + team UI)
- Modify: `client/src/pages/Lobby.jsx` (pass `modes`, `onSetMode`, `onSetTeam`)
- Modify: `client/src/pages/Home.jsx` (`onSetLobbyMode`, `onSetLobbyTeam` handlers + pass-through)

**Interfaces:**
- Consumes: `lobby.options.mode`, `lobby.members[].team` (from Task 4 `publicLobby`); the `lobby:options` and `lobby:team` events.
- Produces: host picks FFA/Teams; in Teams, each player picks their team.
- Verified by `npm run build --prefix client` + manual lobby check.

- [ ] **Step 1: Add handlers in `client/src/pages/Home.jsx`**

After `onSetLobbyMap` (which emits `lobby:options` with `{ map }`), add:

```js
  const onSetLobbyMode = async (mode) => {
    await emitAck('lobby:options', { options: { mode } });
  };
  const onSetLobbyTeam = async (team) => {
    await emitAck('lobby:team', { team });
  };
```

Pass them down to wherever `onSetLobbyMap` is passed (the `Lobby` page props): add `onSetLobbyMode={onSetLobbyMode}` and `onSetLobbyTeam={onSetLobbyTeam}` next to `onSetLobbyMap={onSetLobbyMap}`.

- [ ] **Step 2: Thread props through `client/src/pages/Lobby.jsx`**

Add `onSetLobbyMode` and `onSetLobbyTeam` to the `Lobby` component's destructured props (next to `onSetLobbyMap`). Then update the `<LobbyModal ... />` usage: add

```jsx
          modes={lobby.gameId === 'karts' ? [{ id: 'ffa', name: 'Free-for-all' }, { id: 'teams', name: 'Teams' }] : null}
          onSetMode={onSetLobbyMode}
          onSetTeam={onSetLobbyTeam}
```

(next to the existing `maps=` / `onSetMap=` props).

- [ ] **Step 3: Add mode + team UI in `client/src/components/LobbyModal.jsx`**

Update the component signature to accept the new props:

```jsx
export default function LobbyModal({ lobby, currentUser, friends, onlineIds, onInvite, onReady, onStart, onLeave, maps, onSetMap, modes, onSetMode, onSetTeam }) {
```

Add `const mode = lobby.options?.mode || 'ffa';` near the top (after `isHost`).

Add a mode selector block right after the closing `)}` of the existing `{maps && ( ... )}` block:

```jsx
      {modes && (
        <div className="lb-map">
          <span className="mode-label">Mode</span>
          <select value={mode} disabled={!isHost} onChange={(e) => onSetMode(e.target.value)}>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {!isHost && <span className="muted lb-map-hint">host picks the mode</span>}
        </div>
      )}

      {modes && mode === 'teams' && (
        <div className="lb-teams">
          {[0, 1].map((t) => (
            <div key={t} className="lb-team">
              <span className="mode-label">{t === 0 ? 'Team A' : 'Team B'}</span>
              {lobby.members.filter((m) => (m.team ?? 0) === t).map((m) => (
                <div key={m.id} className="lb-member">
                  <span className={`dot ${m.ready ? 'online' : 'offline'}`} />
                  <span className="friend-name">{m.id === currentUser.id ? 'You' : m.username}</span>
                </div>
              ))}
              {(me?.team ?? 0) !== t && (
                <button className="ghost" onClick={() => onSetTeam(t)}>Join {t === 0 ? 'A' : 'B'}</button>
              )}
            </div>
          ))}
        </div>
      )}
```

(`me` is already defined in the component. The plain members list above stays as the roster; the team columns show the split when in Teams mode.)

- [ ] **Step 4: Build**

Run: `npm run build --prefix client`
Expected: `✓ built in <time>`, no errors.

- [ ] **Step 5: Manual smoke check (optional but recommended)**

Run `npm run dev` (server `--watch` only; never also `npm start`). Open a Smash Karts lobby: confirm a Mode dropdown (host-only) and, in Teams mode, two team columns with a "Join A/B" button that moves you between teams and updates for all members.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/LobbyModal.jsx client/src/pages/Lobby.jsx client/src/pages/Home.jsx
git commit -m "feat(lobby-ui): mode selector + team picker for Smash Karts"
```

---

### Task 6: Client rendering — team colors, markers, HUD, end overlay

**Files:**
- Modify: `client/src/games/karts/kartModel.js` (`makeKart` accepts an accent-marker color)
- Modify: `client/src/games/Karts.jsx` (8-color FFA, team body colors, per-player accent, team HUD)
- Modify: `client/src/pages/Game.jsx` (team result message + standings)

**Interfaces:**
- Consumes: `cfg.mode`, `cfg.teams`, `cfg.colors` (8), `cfg.teamColors` (2) from `room.state`; `snapshot.karts[].team`, `snapshot.teams`; `room.result.mode/teams/winner`.
- Produces: karts colored by team (with a per-player accent), team HUD, team end overlay. Verified by build + manual.

- [ ] **Step 1: Add a per-player accent marker in `client/src/games/karts/kartModel.js`**

Change `makeKart(color)` to `makeKart(color, accent = color)` and add a small roof accent fin using `accent`. Insert this just before the `g.userData = ...` line:

```js
  // Per-player marker: a small roof fin in the player's accent color so
  // teammates sharing a team color stay distinguishable.
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.3, emissive: accent, emissiveIntensity: 0.25 });
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 1.0), accentMat);
  fin.position.set(0, 2.25, -0.3); fin.castShadow = true; g.add(fin);
```

(Signature change is backward-compatible: existing single-arg calls still work, defaulting accent to the body color.)

- [ ] **Step 2: Color karts by mode/team in `client/src/games/Karts.jsx`**

(a) Replace the local fallback palette near the top to 8 colors:

```js
const COLORS = ['#ff5d6c', '#5cc8ff', '#8bd450', '#ffd24a', '#c87bff', '#ff9f43', '#2ee6c0', '#f25fbf'];
const TEAM_COLORS = ['#ff5d6c', '#5cc8ff'];
```

(b) In the setup effect, after `const colors = cfg.colors || COLORS;`, add:

```js
    const teamColors = cfg.teamColors || TEAM_COLORS;
    const teamMode = cfg.mode === 'teams' && Array.isArray(cfg.teams);
    const bodyColor = (i) => (teamMode ? teamColors[cfg.teams[i] === 1 ? 1 : 0] : colors[i % colors.length]);
```

(c) Replace the kart-creation line `const k = makeKart(colors[i % colors.length]);` with:

```js
      const k = makeKart(bodyColor(i), colors[i % colors.length]);
```

(d) The HUD player rows currently color the dot with `colors[k.i % colors.length]`. Change the HUD-builder (the `players:` map inside the `hudTimer`) to color by team in team mode:

```js
        players: s.karts.map((k) => ({ i: k.i, name: names[k.i] || `P${k.i + 1}`, kills: k.kills, hp: k.hp, alive: k.alive, gone: k.gone, color: teamMode ? teamColors[k.team === 1 ? 1 : 0] : colors[k.i % colors.length] })),
```

and add team totals to the HUD state object (same `setHud` call): add `teamMode,` and `teams: s.teams || null,`.

(e) In the HUD render JSX, show team totals in team mode. Replace the `<div className="kt-scores"> ... </div>` block with:

```jsx
          {hud.teamMode ? (
            <div className="kt-scores kt-teamscores">
              <div className="kt-score"><span className="kt-dot" style={{ background: TEAM_COLORS[0] }} /><span className="kt-name">Team A</span><span className="kt-kills">{hud.teams?.[0] ?? 0}</span></div>
              <div className="kt-score"><span className="kt-dot" style={{ background: TEAM_COLORS[1] }} /><span className="kt-name">Team B</span><span className="kt-kills">{hud.teams?.[1] ?? 0}</span></div>
            </div>
          ) : (
            <div className="kt-scores">
              {hud.players.map((p) => (
                <div key={p.i} className={`kt-score ${p.gone ? 'gone' : ''}`}>
                  <span className="kt-dot" style={{ background: p.color }} />
                  <span className="kt-name">{p.i === youAreIndex ? 'You' : p.name}</span>
                  <span className="kt-kills">{p.kills}</span>
                </div>
              ))}
            </div>
          )}
```

(Make sure `hud` initial state includes `teamMode: false, teams: null` to avoid undefined reads — update the `useState({ phase: ... })` initializer accordingly.)

- [ ] **Step 3: Team end overlay in `client/src/pages/Game.jsx`**

Update `resultMessage()` to handle Teams by inserting a teams branch right after the `if (!r) return '';` line, leaving the existing FFA copy untouched. The function becomes exactly:

```js
  const resultMessage = () => {
    const r = room.result;
    if (!r) return '';
    if (r.mode === 'teams') {
      if (r.draw) return "It's a draw!";
      const myTeam = room.state?.teams?.[youAreIndex] ?? 0;
      return r.winner === myTeam ? 'Your team wins! 🎉' : 'Your team lost.';
    }
    if (r.draw) return "It's a draw!";
    if (r.winner === youAreIndex) {
      return r.forfeit ? 'Opponent left — you win!' : 'You won! 🎉';
    }
    return r.forfeit ? 'You forfeited.' : 'You lost.';
  };
```

(Only the `if (r.mode === 'teams') { ... }` block is added; the FFA lines below it are unchanged from the original.)

Add a team standings line in the overlay. Right after the `<h3>{resultMessage()}</h3>` line, add:

```jsx
            {room.result?.mode === 'teams' && room.result.teams && (
              <p className="overlay-scores">
                Team A: <b>{room.result.teams[0]}</b> · Team B: <b>{room.result.teams[1]}</b>
              </p>
            )}
```

- [ ] **Step 4: Build**

Run: `npm run build --prefix client`
Expected: `✓ built in <time>`, no errors.

- [ ] **Step 5: Manual smoke check (optional but recommended)**

With `npm run dev`, run a Teams match on `coliseum`: confirm two team colors (red/blue) with distinct roof fins per teammate, a Team A vs Team B HUD score, no friendly-fire, and a team result overlay. Confirm FFA still shows 8 individual colors + the individual scoreboard.

- [ ] **Step 6: Commit**

```bash
git add client/src/games/karts/kartModel.js client/src/games/Karts.jsx client/src/pages/Game.jsx
git commit -m "feat(karts-ui): team colors + per-player markers, team HUD + end overlay"
```

---

## Self-Review

**Spec coverage:**
- Modes ffa/teams + lobby selection → Task 2 (declare/resolve) + Task 5 (UI, via existing `lobby:options`). ✓
- Manual team pick/swap + auto-place on smaller team + balance start gate → Task 4 (server) + Task 5 (UI). ✓
- 8 players + side-split spawns + respawn by slot → Task 2. ✓
- FFA 8 colors; Teams red/blue + per-player marker → Task 2 (palettes), Task 6 (rendering + fin). ✓
- Friendly fire off (MG/rocket/mine), owner self-mine kept, hazards/credit unchanged → Task 3. ✓
- Team scoring: snapshot `teams`, result winner/draw → Task 3; HUD + end overlay → Task 6. ✓
- Expanded coliseum map (features, 8 side-split spawns, ground params) → Task 1. ✓
- Testing: server logic via node tests (Tasks 1-4), client build+manual (Tasks 5-6). ✓
- kartMaps byte-identical → Task 1 (identical addition; `mapsParity` guards). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; tests have real assertions.

**Type consistency:** `createInitialState` returns `{mode, teams, colors, teamColors}` (Task 2) consumed by client `cfg.*` (Task 6). `kart.team`/`sim.mode`/`kart.spawnIdx` set in Task 2, read in Tasks 3 (combat/snapshot/result) and 6 (rendering). `sameTeam(a,b)` (Task 3) used in nearestTarget + rocket + mine. `setMemberTeam(userId,team)` (Task 4) used by `lobby:team` handler + client `onSetLobbyTeam`. `startLobby` returns `options.teams` aligned to `userIds` (Task 4) consumed by `createSim`/`createInitialState` (Task 2). `makeKart(color, accent)` (Task 6 kartModel) called with `(bodyColor(i), colors[i])` (Task 6 Karts.jsx). HUD state keys `teamMode`/`teams` set + read in Task 6. `room.result.mode/teams/winner` (Task 3) read in Game.jsx (Task 6).

**Note for implementers:** Tasks 2 and 3 edit the same file (`karts.js`) sequentially; Task 3's base is Task 2's head. Task 6's HUD edit assumes the `useState` HUD initializer is extended with `teamMode:false, teams:null` (called out in Task 6 Step 2e).
