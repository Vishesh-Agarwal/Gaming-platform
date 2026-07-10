# Observability — Design

**Date:** 2026-07-10
**Status:** Approved
**Scope:** Priority 3 from the 2026-07-06 platform review (after reconnection grace and
game-state durability). Structured logging as the foundation, plus a live-status admin
surface. Single-instance LAN deployment — no external log/metrics stack.

## Goals

1. **Debugging after the fact** — when something breaks (a stuck room, a wrong forfeit),
   structured logs make it possible to reconstruct what happened.
2. **Live visibility** — see what the server is doing right now: rooms, lobbies, online
   players, grace timers, loop health, snapshot status.

Non-goals: external aggregation (Prometheus/Grafana/ELK), tracing, multi-instance
concerns, alerting, charts.

## Decisions made during brainstorming

- Log sink: **stdout + size-capped rolling file** (not SQLite, not stdout-only).
- Status surface: **JSON admin endpoint + a small React admin page** (not endpoint-only,
  not a terminal dashboard).
- Access: **`ADMIN_USERNAMES` env allowlist; any logged-in user qualifies in dev**
  (matches config.js zero-config-dev / strict-prod philosophy).
- Implementation: **hand-rolled, zero new dependencies** (approach A over pino) —
  consistent with the codebase's hand-rolled infra (security.js, reconnect.js,
  persistence.js).
- HTTP request logging: **error (status ≥ 400) and slow (> 250 ms) requests only**
  (healthy traffic is not logged; it is sampled for timing).

## Architecture

Two new pure server modules feed one new router and one new client page:

```
socketHandlers / rooms / realtime / turnclock / persistence / http middleware
        │  log.info(...)              │  metrics.count()/sample()
        ▼                             ▼
   server/src/log.js            server/src/metrics.js
   (stdout + file + ring)       (counters + samplers + lag)
        │                             │
        └────────────┬────────────────┘
                     ▼
          server/src/admin.js  ──►  GET /api/admin/status, /api/admin/logs
                     │               (also reads rooms/lobbies/presence/reconnect live)
                     ▼
          client AdminPage (poll 3s)
```

## Component 1: `server/src/log.js`

`createLogger(options)` factory with a default singleton export `log`. Options make it
unit-testable: `{ level, stream, filePath, maxFileBytes, now }` all injectable.

- **API:** `log.debug|info|warn|error(domain, event, fields)`.
  - `domain`: short subsystem string — `socket`, `room`, `lobby`, `persistence`,
    `http`, `auth`, `server`.
  - `event`: snake_case event name, e.g. `game_over`, `grace_expired`.
  - `fields`: flat object of JSON-serializable values.
- **Line shape:** `{ ts, level, domain, event, ...fields }` — one JSON line.
- **Stdout:** raw JSON line in production; in dev a compact colored single line
  (`12:04:31 INFO room game_over roomId=ab12 winner=3`). Dev pretty output is derived
  from the same record — no second formatting path for the file.
- **File sink:** appends the JSON line to `logs/server.log` (directory created lazily;
  `logs/` gitignored). When the file exceeds `maxFileBytes` (default 5 MB), rename to
  `server.log.1` (clobbering any previous `.1`) and start fresh. Bounded disk, no deps.
  File writes are best-effort: an fs error disables the file sink with one warn to
  stdout rather than crashing or spamming.
- **Level filter:** `LOG_LEVEL` env via config (default `info`); `debug` suppressed
  unless enabled.
- **Ring buffer:** the last 200 warn/error records kept in memory;
  `recentProblems()` returns them (newest first) for `/api/admin/logs`.

## Component 2: `server/src/metrics.js`

In-memory, resets on boot (uptime is reported alongside, so that is understood).

- **Counters** — `count(name, n=1)`:
  `socket_connects`, `socket_disconnects`, `matches_started`, `matches_finished`,
  `forfeits`, `moves`, `grace_scheduled`, `grace_saved`, `grace_expired`,
  `rate_limited`, `errors`.
- **Samplers** — `sample(name, ms)` keeping a rolling window (last 500 samples) with
  `{ count, avg, max, last }`: `tick_ms` (realtime step), `snapshot_ms` (persistence
  write), `http_ms` (every request, even though only problems are logged).
- **Event-loop lag:** a 500 ms `setInterval().unref()` measuring scheduling delay;
  exposes `{ current, max }`. Interval/clock injectable for tests.
- **`snapshot()`** returns `{ counters, samplers, lag, startedAt }` as plain JSON.
- Live gauges (rooms, lobbies, online, pending grace) are **not** duplicated here —
  the admin router reads them from their owning modules at request time so nothing
  can drift.

## Component 3: instrumentation points

The existing 8 `console.*` calls migrate to the logger. New events:

| Where | Events |
| --- | --- |
| socketHandlers | `socket_connected` / `socket_disconnected` (userId, username); `game_started` (roomId, gameId, players, source: invite/lobby/rematch); `game_over` (roomId, gameId, durationMs, how: result/forfeit/timeout, winner); `grace_scheduled` / `grace_saved` / `grace_expired` (userId, roomId); `lobby_created` / `lobby_started` / `lobby_member_evicted`; `rate_limited` (warn; userId, event) |
| turnclock | `turn_timeout` (roomId) and `turn_clock_held` (mid-grace hold, debug) |
| realtime | per-tick duration → `tick_ms` sample only (no log line per tick) |
| persistence | `rehydrated` (rooms, lobbies counts); `snapshot_failed` (error); every write → `snapshot_ms` sample; skipped-unchanged writes are not logged |
| createApp middleware | `http_request` logged only when status ≥ 400 or duration > 250 ms (method, path, status, ms); **all** requests feed the `http_ms` sample |
| index.js | boot, rehydrate summary, listening, shutdown signal, final-snapshot failure — all through the logger |

Counter increments ride the same call sites. `grace_saved` = `cancelForfeit` returned
true on reconnect; `grace_expired` = the scheduled forfeit fired.

## Component 4: `server/src/admin.js` + config

- `config.js` gains `adminUsernames` (env `ADMIN_USERNAMES`, comma-separated,
  default `[]`) and `logLevel` (env `LOG_LEVEL`, default `info`).
- `requireAdmin` middleware (after `authMiddleware`): allow when `!config.isProd`
  (any authenticated user in dev) or `adminUsernames.includes(req.user.username)`.
  Otherwise 403. Unauthenticated stays 401 from authMiddleware.
- **`GET /api/admin/status`** assembles at request time:
  - `server`: uptime s, pid, node version, memory (rss, heapUsed), env, event-loop lag.
  - `live`: online users (count + usernames), rooms (id, gameId, status, players
    [username, bot], turnEndsAt, ageMs), lobbies (gameId, code, members, public),
    pending grace timers (username, msRemaining), realtime match count, bot timer count.
  - `metrics`: `metrics.snapshot()`.
  - `persistence`: last snapshot at/duration/rows, last rehydrate counts.
- **`GET /api/admin/logs`** → `{ problems: recentProblems() }`.
- New read-only exports where a view is missing (kept minimal): e.g.
  `reconnect.pendingSummary()` (userId → msRemaining), a presence online-usernames
  reader, `realtime.activeMatchCount()`, room age (createdAt already exists or is
  added at creation). No mutation surface — admin is strictly read-only in v1.
- Router mounts in `registerRoutes` under `/api/admin`, behind the existing apiLimiter.

## Component 5: client admin page

- Entry: an **Admin** item in the profile/header menu, shown only if a one-time probe
  of `/api/admin/status` returns 200 (403 hides it). Invisible to regular players.
- The page polls `/api/admin/status` every 3 s (and `/logs` every 10 s); polling stops
  on unmount. 403 mid-session shows "Not authorized".
- Layout in the existing console-dark style, no new deps, no charts in v1:
  - stat tiles: uptime, online players, active rooms, lobbies, event-loop lag;
  - live rooms table (game, players, status, turn deadline countdown, age);
  - lobbies list, grace-timer list;
  - counters grid + samplers (avg/max);
  - recent-problems tail (level, time, domain, event, fields).

## Error handling

- Logger file-sink failures: disable the sink, single stdout warning; never throw into
  a caller.
- Instrumentation must never break gameplay: log/metric calls at game call sites are
  plain synchronous calls into try/catch-safe modules (the logger catches its own IO);
  no instrumentation inside hot per-frame loops except the cheap `tick_ms` sample.
- Admin endpoints wrap assembly in try/catch → 500 with a logged error, never a crash.

## Testing

Same conventions as the existing suite (`node:test`, source-assertion where no harness):

- `log.js`: injected stream/clock — level filtering, JSON line shape, dev pretty
  toggle, rotation at the byte cap (temp dir via scratch), ring-buffer contents/order.
- `metrics.js`: counter math, sampler window stats, snapshot shape; lag sampler
  injectable and unref'd.
- `admin.js`: against `createApp()` with `loadConfig({...})` variants — 401 unauth,
  403 non-admin in prod config, 200 + payload shape for admin, dev-mode open access.
- Wiring: source-assertion tests that key call sites call `log.`/`metrics.` (pattern
  used by reconnectWiring/resumeBotsWiring tests).
- Client: build green + source-assertion test for the page; final manual browser
  verification against the live dev server.

## Out of scope / deferred

- Charts or history on the admin page (v1 is tables + numbers).
- Log shipping, external metrics, alerting, tracing.
- Admin actions (kill room, kick player) — read-only v1.
- Persisting metrics across restarts.
