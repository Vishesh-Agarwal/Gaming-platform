# Smash Karts — Team Play + Expanded Map (Sub-project 3) Design

**Date:** 2026-06-24
**Status:** Approved design — ready for implementation plan
**Sub-project:** 3 of 3 in the Smash Karts visual + combat + team-play initiative
(order: 1. realistic visuals ✅ → 2. proximity auto-MG ✅ → 3. team play + expanded map).

## Goal

Add 2-team play (2v2 / 3v3 / 4v4) to Smash Karts alongside the existing
free-for-all: raise the player cap to 8, let players **choose and swap teams in
the lobby**, color karts by team with a per-player marker, make combat
team-aware (no friendly fire), score by team, and ship a large new map built for
8-player team battles.

## Locked decisions (from brainstorming)

- **Modes:** `ffa` (free-for-all, today's behavior) and `teams` (two teams).
  Selected in the lobby like the map.
- **Team assignment:** **manual** — players pick/swap their team in the lobby
  (NOT auto-balanced). New members are auto-placed on the smaller team as a
  default, then free to switch.
- **Colors:** FFA uses 8 distinct per-player colors; Teams uses Team A = red,
  Team B = blue, each kart with a small per-player marker (roof number/accent)
  so teammates stay distinguishable.
- **Friendly fire:** OFF in Teams (teammates can't be locked/damaged).
- **Scoring:** Teams → team with most combined kills wins (tie = draw).
- **Map:** one new large map, `coliseum`, with 8 side-split spawns.

## Non-goals

- No change to other games. No matchmaking/ranking. No team voice/chat.
- No per-team weapon balancing beyond friendly-fire-off.
- No spectators. No mid-match team switching (teams are fixed at start).
- FFA behavior (combat, colors ≤4 today extended to 8, scoring) stays as-is
  except the palette extension.

## Constraints (binding)

- Combat/teams/scoring logic is server-authoritative in
  `server/src/games/karts.js`; movement physics (`kartPhysics.js`) is untouched.
- `kartMaps.js` stays byte-identical between server and `client/.../kartMaps.js`
  (parity test); the new map is added to both.
- The realtime engine (`rooms.js`) and lobby (`lobbies.js`) are extended, not
  rewritten; existing turn-based and FFA flows must keep working.
- Original assets only; no new dependencies.
- Server suite must stay green and gain coverage for teams/scoring/combat/map.

## Architecture

### Modes (`server/src/games/karts.js`)

- Declare `modes: [{ id: 'ffa', name: 'Free-for-all' }, { id: 'teams', name: 'Teams' }]`.
- `createInitialState(options)` resolves `mode = options.mode === 'teams' ? 'teams' : 'ffa'`
  (defaults to `ffa` for any unknown value) and returns it (plus `maxPlayers: 8`,
  the color palettes, and `mapId`).
- `maxPlayers: 8`, `minPlayers: 2` (unchanged).

### Lobby team selection (`server/src/lobbies.js` + client `LobbyModal.jsx`)

- Each lobby member gains a `team` field (`0` or `1`).
- On join (`joinLobby`), default the new member's `team` to the **smaller** team
  (ties → team 0). Host on `createLobby` defaults to team 0.
- New action `setMemberTeam(userId, team)` → sets that member's `team` to `0`/`1`;
  returns `{ lobby }`. Exposed via a new socket event `lobby:team`
  (payload `{ team }`), broadcasting `lobby:update` like the other lobby actions.
- `publicLobby` includes each member's `team`.
- `startLobby` validation:
  - FFA mode: unchanged (≥ minPlayers, all ready).
  - Teams mode: additionally require **both teams non-empty** and **balanced**
    (`|teamA − teamB| ≤ 1`); otherwise `{ error: 'Teams must be balanced (and non-empty).' }`.
  - `startLobby` assembles final options: `{ ...lobby.options, teams }` where
    `teams = members.map(m => m.team)` aligned to `userIds = members.map(m => m.id)`.
    (Teams ride the start payload, not the persisted host-only `lobby.options`.)
- `LobbyModal`: a **mode selector** (FFA / Teams, host-only, like the map
  selector) and, when mode is Teams, two team columns (Team A / Team B) with a
  "Switch team" control for the current user; FFA hides the team UI.

### Sim & spawns (`server/src/games/karts.js`)

- `createSim(players, now, options)`:
  - `mode` resolved as above.
  - Per kart `i`: `team = mode === 'teams' ? (options.teams?.[i] ?? 0) : null`.
  - **Spawn by side** in Teams: split the map's `spawns` into side A
    (`spawns[0 .. h-1]`) and side B (`spawns[h .. ]`), `h = floor(len/2)`. Assign
    the k-th Team A kart to side A's k-th spawn (wrap), the k-th Team B kart to
    side B's k-th spawn (wrap). FFA keeps `spawns[i % len]`.
  - Store `sim.mode`.
- Respawn uses the same per-kart spawn slot logic (record each kart's assigned
  spawn index at createSim and reuse it on respawn, so karts respawn on their
  side).

### Team-aware combat (`server/src/games/karts.js`)

- Helper `sameTeam(a, b)` → `a.team != null && a.team === b.team`.
- `nearestTarget`: also skip a candidate when `sameTeam(shooter, candidate)`.
- Rocket projectile hit-test: skip a victim when `sameTeam(owner, victim)` (in
  addition to the existing `i === owner` skip).
- Mine trigger: skip a kart when `sameTeam(ownerKart, kart)`. The owner can still
  trigger their own mine (unchanged FFA behavior).
- Hazards: self-damage unchanged. Kill credit unchanged (`killKart`).

### Scoring & snapshot (`server/src/games/karts.js`)

- `snapshot`: each kart entry adds `team` (0/1 or null). Add a top-level
  `teams` field: in Teams mode `[sumKillsTeam0, sumKillsTeam1]`, else `null`.
  Also keep the existing `kills` array.
- `result`:
  - Teams: `winner` = team index with the higher combined kills (`0`/`1`),
    `draw` on equal; include `teams: [scoreA, scoreB]` and `mode: 'teams'`.
  - FFA: unchanged.
- The realtime engine and `Game.jsx` already surface `result`; `Game.jsx` shows a
  team result line in Teams mode.

### Colors & rendering (client `Karts.jsx`, `kartModel.js`, HUD)

- Server exposes two palettes in state: `colors` (8 entries, FFA) and
  `teamColors` (2 entries: red, blue). The client picks a kart's body color:
  Teams → `teamColors[team]`; FFA → `colors[i]`.
- `kartModel.makeKart` accepts/render a small **per-player marker** (e.g., a roof
  number or accent) derived from the kart's per-team index, so teammates sharing
  a color are distinguishable. (`updateKart` contract preserved.)
- HUD (`Karts.jsx`): Teams mode shows **Team A score vs Team B score**; FFA keeps
  the individual scoreboard. Uses `snapshot.teams` / `snapshot.karts[].team`.

### Expanded map `coliseum` (`server/src/games/kartMaps.js` + client copy)

A large 110×110 arena built for 8 players / 4v4, authored as original procedural
geometry (no ripped assets). Features:

- **Central climbable mesa** (flat wedge plateau) reached by two ramps (one per
  side) — contested high ground.
- **Two team spawn zones** at opposite ends (north = side A spawns 0-3, south =
  side B spawns 4-7), each with nearby box cover.
- **Two lava hazard pits** flanking the center.
- **Boost lanes** along the long axis.
- **Pillars (cyl) + box cover** scattered for line-of-sight breaks (matters for
  the new auto-MG).
- **6 crate pads** spread across the arena.

Add a `groundParamsFor('coliseum')` entry in `materialParams.js` (else it falls
back to the default and still renders). The realistic scene (sub-project 1) draws
it automatically from the data.

## Data flow

Lobby members pick teams (`lobby:team`) → `startLobby` emits `userIds` +
`options.teams` (aligned) → `createRoom(gameId, options, userIds)` →
`createSim(players, now, options)` reads `options.mode` + `options.teams`, assigns
`kart.team` + side spawns → `step` applies team-aware combat → `snapshot` carries
`team` + `teams` → client colors karts by team and shows team HUD → `result`
declares the winning team.

## Edge cases

- **FFA unchanged:** `team = null`, no friendly-fire logic, per-player colors,
  individual scoreboard, `spawns[i % len]`.
- **Unbalanced/empty team at start:** blocked by `startLobby` validation.
- **A player leaves mid-match (Teams):** existing `dropPlayer` marks the kart
  `gone`; their team simply has fewer karts. Team scores still computed from
  remaining `kills`. Match still ends when <2 karts remain (existing rule).
- **Mode/teams absent or malformed in options:** default to FFA / team 0.
- **>4 players on an old 4-spawn map:** spawns wrap (tolerable); the `coliseum`
  map provides 8 proper side-split spawns for real 8-player play.
- **Lobby member toggles team after readying:** allowed; readiness unaffected
  (only the start gate checks balance).

## Testing

Server-deterministic logic gets real `node --test` coverage:
- **Lobby:** `setMemberTeam` sets/swaps team; join auto-places on the smaller
  team; `startLobby` blocks unbalanced/empty teams in Teams mode and passes a
  correct aligned `teams` array + `userIds`; FFA start unaffected.
- **Sim:** `createSim` assigns `kart.team` from `options.teams`; Teams spawns come
  from the correct side; FFA leaves `team = null` and uses `i % len`.
- **Combat:** MG won't lock a teammate but locks an enemy; rocket/mine don't
  damage teammates but do damage enemies; owner can still trigger own mine;
  hazards still self-damage.
- **Scoring:** `result` picks the higher-combined-kills team, draw on equal;
  `snapshot.teams` sums per team; FFA `result` unchanged.
- **Map:** `coliseum` present in both copies (parity test), has 8 spawns, valid
  obstacle/ramp/hazard/boost/pad shapes, plateau reachable (reuse the existing
  reachability-simulation pattern if a ramp+plateau is added).

Client rendering (team colors, per-player markers, mode/team lobby UI, team HUD,
team end overlay) is verified by `npm run build` + manual playtest, per the
established pattern (no client render/UI harness).

## Out-of-scope / future

- Manual team-pick polish (drag between columns, lock teams), team auto-balance
  button, captain/party systems.
- Team-colored map territory, per-team objectives (CTF/zones).
- Raising the cap beyond 8.
