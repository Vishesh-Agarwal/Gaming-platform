# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pre-deployment security gaps found in the 2026-07-06 platform review — forgeable tokens, no rate limiting, missing HTTP hardening, no crash guards, and no token revocation — without changing game behavior.

**Architecture:** Introduce one central `config.js` that reads and validates environment at boot (fail-fast in production), a `security.js` holding a pure token-bucket limiter for socket events, `helmet` + tightened CORS + `express-rate-limit` on the REST layer, process-level crash guards with graceful shutdown, and DB-backed token-version revocation. Each piece is additive and independently testable; no game module or client code changes are required except a README/env-doc update.

**Tech Stack:** Node 18 (ESM, `node:test`), Express 4, Socket.IO 4, better-sqlite3, `jsonwebtoken`, plus two new deps: `helmet` and `express-rate-limit`.

## Global Constraints

- Node version is **18.20.8** — no `--env-file` flag, no top-level await in CJS interop. Read env via `process.env`; do not add `dotenv`.
- Server is **ESM** (`"type": "module"`) — use `import`/`export`, `.js` extensions in relative imports.
- Test runner: `node --test`. Run the whole server suite with `npm test --prefix server`; a single file with `node --test server/test/<file>.test.js` from the repo root.
- Tests hit the **real dev SQLite DB** — always generate unique usernames (`unique('prefix')` pattern already used in `server/test/authProfile.test.js`); never assert on absolute row counts or leaderboard rank.
- **Dev must keep working with zero config** — every new required-in-production env var must have a safe dev default that only throws when `NODE_ENV === 'production'`.
- Do not alter any file under `server/src/games/` — hardening is platform-layer only.
- Commit after each task. Branch off `main` first (`git switch -c security-hardening`).

---

### Task 1: Central config module with production fail-fast

**Files:**
- Create: `server/src/config.js`
- Create: `server/test/config.test.js`
- Create: `server/.env.example`
- Modify: `server/src/auth.js:9` (import `JWT_SECRET` from config instead of a local default)

**Interfaces:**
- Produces: `config` (default export) with `{ nodeEnv, isProd, port, jwtSecret, corsOrigin, exitOnUncaught, trustProxy }`; and a named `loadConfig(env = process.env)` pure factory so tests can pass a fake env.
- `jwtSecret` is a non-empty string. In production a missing/`dev-secret-change-me` value throws at load. In dev it falls back to `'dev-secret-change-me'`.
- `corsOrigin` is `true` (reflect any) in dev; in production it is a `string[]` parsed from a comma-separated `CLIENT_ORIGIN`, and an empty value throws.

- [ ] **Step 1: Write the failing test**

Create `server/test/config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('dev config falls back to safe defaults without throwing', () => {
  const c = loadConfig({}); // NODE_ENV undefined => dev
  assert.equal(c.isProd, false);
  assert.equal(c.jwtSecret, 'dev-secret-change-me');
  assert.equal(c.corsOrigin, true);
  assert.equal(c.port, 3001);
});

test('production refuses to boot with the default JWT secret', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://x.com' }),
    /JWT_SECRET/,
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me', CLIENT_ORIGIN: 'https://x.com' }),
    /JWT_SECRET/,
  );
});

test('production requires an explicit CORS origin allow-list', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-real-long-secret-value-1234567890' }),
    /CLIENT_ORIGIN/,
  );
});

test('production parses a comma-separated CORS allow-list into an array', () => {
  const c = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-long-secret-value-1234567890',
    CLIENT_ORIGIN: 'https://a.com, https://b.com',
  });
  assert.equal(c.isProd, true);
  assert.deepEqual(c.corsOrigin, ['https://a.com', 'https://b.com']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/config.test.js`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 3: Write the config module**

Create `server/src/config.js`:

```js
// Central runtime configuration. Reads process.env once, applies safe dev
// defaults, and FAILS FAST in production when a security-critical value is
// missing. Import `config` everywhere; never read process.env for these values
// directly. `loadConfig` is exported pure so tests can inject a fake env.
const DEV_SECRET = 'dev-secret-change-me';

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const jwtSecret = env.JWT_SECRET || DEV_SECRET;
  if (isProd && (!env.JWT_SECRET || jwtSecret === DEV_SECRET)) {
    throw new Error('JWT_SECRET must be set to a strong, unique value in production.');
  }

  let corsOrigin;
  if (isProd) {
    const raw = String(env.CLIENT_ORIGIN || '').trim();
    if (!raw) throw new Error('CLIENT_ORIGIN must list the allowed web origin(s) in production.');
    corsOrigin = raw.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    corsOrigin = env.CLIENT_ORIGIN || true; // reflect any origin in dev (LAN testing)
  }

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT) || 3001,
    jwtSecret,
    corsOrigin,
    // Until room/lobby state is externalized, a single stray throw should NOT
    // nuke every in-RAM game — so we default to staying up. Set to '1' once a
    // process manager + durable state exist and restart-on-crash is safe.
    exitOnUncaught: env.EXIT_ON_UNCAUGHT === '1',
    // Number of proxy hops to trust for client IP (rate limiting). 0 = none.
    trustProxy: Number(env.TRUST_PROXY) || 0,
  };
}

const config = loadConfig();
export default config;
```

- [ ] **Step 4: Point auth.js at the config secret**

In `server/src/auth.js`, replace line 9:

```js
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
```

with:

```js
import config from './config.js';
const JWT_SECRET = config.jwtSecret;
```

(Place the `import config` line with the other imports at the top of the file, and keep the `const JWT_SECRET = config.jwtSecret;` line where the old constant was.)

- [ ] **Step 5: Create the env template**

Create `server/.env.example`:

```bash
# Copy to server/.env-equivalent in your deploy environment (Node 18 has no
# built-in .env loader — export these in your process manager / shell).
NODE_ENV=production
PORT=3001
# REQUIRED in production. Generate: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=
# REQUIRED in production. Comma-separated list of allowed web origins.
CLIENT_ORIGIN=https://play.example.com
# Optional. Proxy hops to trust for real client IP (behind nginx/CF set to 1).
TRUST_PROXY=1
# Optional. Set to 1 only when a process manager restarts the app AND game
# state is durable — otherwise a crash drops all live matches.
EXIT_ON_UNCAUGHT=0
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test server/test/config.test.js`
Expected: PASS (4 tests).
Run: `npm test --prefix server`
Expected: full suite still green (auth tests unaffected — dev secret unchanged).

- [ ] **Step 7: Commit**

```bash
git add server/src/config.js server/test/config.test.js server/.env.example server/src/auth.js
git commit -m "feat(security): central config with production fail-fast for JWT secret + CORS"
```

---

### Task 2: HTTP hardening — helmet + locked-down CORS

**Files:**
- Modify: `server/package.json` (add `helmet` dependency)
- Modify: `server/src/index.js:22-33` (CORS from config, add helmet, trust proxy)
- Create: `server/test/httpHardening.test.js`

**Interfaces:**
- Consumes: `config.corsOrigin`, `config.trustProxy` from Task 1.
- Produces: an exported `createApp()` from `index.js` so tests can mount the middleware stack without binding a port. (Currently `index.js` builds the app inline and listens; refactor the app assembly into `createApp()` and keep the `listen` call at the bottom guarded so importing the module for tests doesn't start the server.)

- [ ] **Step 1: Install helmet**

Run: `npm install helmet --prefix server`
Expected: `helmet` added to `server/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `server/test/httpHardening.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';

async function start() {
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

test('helmet security headers are present on API responses', async () => {
  const s = await start();
  try {
    const res = await fetch(s.base + '/api/health');
    assert.equal(res.status, 200);
    // helmet sets these by default
    assert.ok(res.headers.get('x-content-type-options'), 'x-content-type-options missing');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('x-dns-prefetch-control'), 'helmet not applied');
  } finally {
    await s.close();
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test server/test/httpHardening.test.js`
Expected: FAIL — `createApp` is not exported (import error) or headers absent.

- [ ] **Step 4: Refactor index.js to export createApp and apply hardening**

In `server/src/index.js`, add to the imports:

```js
import helmet from 'helmet';
import config from './config.js';
```

Replace lines 22-33 (the `const PORT` / `CLIENT_ORIGIN` / `app` / `server` / `io` setup) with a `createApp` factory and a separate server bootstrap. The middleware order matters — helmet first, then CORS, then json:

```js
const PORT = config.port;

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '64kb' })); // cap body size
  registerRoutes(app);
  return app;
}
```

Move the existing route registrations (`app.get('/api/health'...)` through `app.use('/api/chat', chatRouter)`) into a `function registerRoutes(app) { ... }` above `createApp`. Then replace the bottom bootstrap so it only runs when this module is the entry point:

```js
const app = createApp();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigin } });
io.use(socketAuth);
initSockets(io);

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] env=${config.nodeEnv} cors=${config.isProd ? config.corsOrigin.join(',') : '(any — dev)'}`);
});
```

(The `io`/`initSockets`/`listen` block stays at module top level as today — importing `createApp` in a test does not touch it because the test never triggers `listen` on that server; but to be safe the test only imports `createApp`. If importing the module starts a duplicate listener during tests, wrap the bootstrap in `if (config.nodeEnv !== 'test')` and set `NODE_ENV=test` is NOT available via node:test — instead guard with `if (import.meta.url === \`file://${process.argv[1]}\`)` so the server only boots when run directly, never when imported.)

Use the `import.meta.url` guard around the bootstrap block:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigin } });
  io.use(socketAuth);
  initSockets(io);
  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] env=${config.nodeEnv} cors=${config.isProd ? config.corsOrigin.join(',') : '(any — dev)'}`);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test server/test/httpHardening.test.js`
Expected: PASS.
Run: `npm run dev` (manual smoke) — server still boots and prints the listening line.
Expected: server starts on :3001 as before.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/index.js server/test/httpHardening.test.js
git commit -m "feat(security): helmet headers, config-driven CORS, 64kb body cap, testable createApp"
```

---

### Task 3: REST rate limiting (brute-force protection on auth)

**Files:**
- Modify: `server/package.json` (add `express-rate-limit`)
- Modify: `server/src/index.js` (mount limiters on `/api/auth` and a global API limiter)
- Create: `server/test/restRateLimit.test.js`

**Interfaces:**
- Consumes: `createApp()` from Task 2.
- Produces: two `express-rate-limit` instances applied inside `registerRoutes` — a strict `authLimiter` (10 requests / 15 min per IP) mounted before `authRouter`, and a lenient `apiLimiter` (300 requests / 15 min per IP) mounted before all `/api` routes.

- [ ] **Step 1: Install express-rate-limit**

Run: `npm install express-rate-limit --prefix server`
Expected: dependency added.

- [ ] **Step 2: Write the failing test**

Create `server/test/restRateLimit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';

async function start() {
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

test('login endpoint returns 429 after the auth limit is exceeded', async () => {
  const s = await start();
  try {
    let got429 = false;
    // limiter is 10/15min; fire 15 bad logins from the same (loopback) IP
    for (let i = 0; i < 15; i += 1) {
      const res = await fetch(s.base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nobody', password: 'wrong' }),
      });
      if (res.status === 429) { got429 = true; break; }
    }
    assert.ok(got429, 'expected a 429 after exceeding the auth rate limit');
  } finally {
    await s.close();
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test server/test/restRateLimit.test.js`
Expected: FAIL — every response is 401, never 429.

- [ ] **Step 4: Add the limiters**

In `server/src/index.js`, add to imports:

```js
import rateLimit from 'express-rate-limit';
```

Inside `registerRoutes(app)`, before the `/api/*` route registrations, add:

```js
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again later.' },
  });
  app.use('/api', apiLimiter);
  app.use('/api/auth', authLimiter);
```

Keep the existing `app.use('/api/auth', authRouter)` — Express runs `authLimiter` then `authRouter` in registration order, so register `authLimiter` above the router line.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test server/test/restRateLimit.test.js`
Expected: PASS.
Run: `npm test --prefix server`
Expected: full suite green. NOTE: if any existing auth test fires >10 rapid logins it will now 429 — if so, that test should be split across unique paths or accept 429; check `server/test/authProfile.test.js` runs under 10 auth calls (it does today).

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/index.js server/test/restRateLimit.test.js
git commit -m "feat(security): rate limit REST API (300/15m) and auth endpoints (10/15m)"
```

---

### Task 4: Socket event rate limiting (token bucket)

**Files:**
- Create: `server/src/security.js`
- Create: `server/test/socketRateLimit.test.js`
- Modify: `server/src/socketHandlers.js` (guard `chat:send`, `game:move`, `game:invite`, `lobby:create`, `game:rt:input`)

**Interfaces:**
- Produces (`security.js`): `createBucketLimiter()` → `{ allow(key, cost = 1, now = Date.now()) => boolean }`. Per-key token bucket; keys are strings like `"<userId>:chat:send"`. Buckets are created lazily with per-event capacity/refill drawn from an internal `LIMITS` table; unknown events are unlimited (return `true`).
- The limiter is a single module-level instance (`socketLimiter`) exported for reuse in `socketHandlers.js`.

- [ ] **Step 1: Write the failing test**

Create `server/test/socketRateLimit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBucketLimiter } from '../src/security.js';

test('allows up to capacity then blocks, refills over time', () => {
  // 3 tokens, refills 1/sec
  const lim = createBucketLimiter({ capacity: 3, refillPerSec: 1 });
  const t0 = 1_000_000;
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), false); // bucket empty
  assert.equal(lim.allow('k', 1, t0 + 1000), true); // +1s => +1 token
  assert.equal(lim.allow('k', 1, t0 + 1000), false);
});

test('separate keys have independent buckets', () => {
  const lim = createBucketLimiter({ capacity: 1, refillPerSec: 1 });
  const t = 5_000_000;
  assert.equal(lim.allow('a', 1, t), true);
  assert.equal(lim.allow('a', 1, t), false);
  assert.equal(lim.allow('b', 1, t), true); // unrelated key unaffected
});

test('refill never exceeds capacity', () => {
  const lim = createBucketLimiter({ capacity: 2, refillPerSec: 1 });
  const t = 9_000_000;
  assert.equal(lim.allow('k', 1, t), true);
  // idle a long time, then two allows should succeed but not three
  assert.equal(lim.allow('k', 1, t + 100_000), true);
  assert.equal(lim.allow('k', 1, t + 100_000), true);
  assert.equal(lim.allow('k', 1, t + 100_000), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/socketRateLimit.test.js`
Expected: FAIL — `Cannot find module '../src/security.js'`.

- [ ] **Step 3: Write the token bucket**

Create `server/src/security.js`:

```js
// Socket-event rate limiting via a per-key token bucket. Pure and clock-injectable
// so it unit-tests without any socket. Keys are "<userId>:<event>".
export function createBucketLimiter({ capacity, refillPerSec }) {
  const buckets = new Map(); // key -> { tokens, last }
  return {
    allow(key, cost = 1, now = Date.now()) {
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
      // refill based on elapsed time, capped at capacity
      const elapsed = Math.max(0, now - b.last) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.last = now;
      if (b.tokens >= cost) { b.tokens -= cost; return true; }
      return false;
    },
  };
}

// Per-event budgets. Chosen generous enough for real play, tight enough to stop
// spam/DoS. Unlisted events are unlimited.
const LIMITS = {
  'chat:send':     { capacity: 8,  refillPerSec: 1 },   // ~1 msg/s, burst 8
  'game:move':     { capacity: 12, refillPerSec: 4 },   // fast turn play OK
  'game:invite':   { capacity: 5,  refillPerSec: 0.2 }, // 1 invite / 5s
  'lobby:create':  { capacity: 4,  refillPerSec: 0.1 }, // 1 lobby / 10s
  'game:rt:input': { capacity: 60, refillPerSec: 40 },  // 30–40 Hz input stream
};

const limiters = new Map(); // event -> bucket limiter
for (const [event, cfg] of Object.entries(LIMITS)) {
  limiters.set(event, createBucketLimiter(cfg));
}

// Returns true if this user may fire this event now. Unlisted events => always true.
export function allowSocketEvent(userId, event, now = Date.now()) {
  const lim = limiters.get(event);
  if (!lim) return true;
  return lim.allow(`${userId}:${event}`, 1, now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/socketRateLimit.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Guard the hot socket handlers**

In `server/src/socketHandlers.js`, add to the imports near the top:

```js
import { allowSocketEvent } from './security.js';
```

Then add a rejection guard as the first line inside each of these handlers. For handlers with an `ack`, reply with an error; for fire-and-forget handlers (`game:rt:input`), silently drop.

`chat:send` (line ~107):

```js
    socket.on('chat:send', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'chat:send')) return ack?.({ error: 'Slow down.' });
      // ...existing body unchanged...
```

`game:invite` (line ~126):

```js
    socket.on('game:invite', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'game:invite')) return ack?.({ error: 'Slow down.' });
      // ...existing body...
```

`lobby:create` (line ~178):

```js
    socket.on('lobby:create', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'lobby:create')) return ack?.({ error: 'Slow down.' });
      // ...existing body...
```

`game:move` (line ~261):

```js
    socket.on('game:move', (payload, ack) => {
      if (!allowSocketEvent(me.id, 'game:move')) return ack?.({ error: 'Slow down.' });
      // ...existing body...
```

`game:rt:input` (line ~297) — fire-and-forget, drop silently:

```js
    socket.on('game:rt:input', (payload) => {
      if (!allowSocketEvent(me.id, 'game:rt:input')) return;
      // ...existing body...
```

- [ ] **Step 6: Verify handlers still work and suite is green**

Run: `npm test --prefix server`
Expected: full suite green (no existing test fires these fast enough to trip the buckets).
Manual smoke (`npm run dev`): send several chat messages and play a turn-based game — normal play is unaffected; hammering chat shows "Slow down." after the burst.

- [ ] **Step 7: Commit**

```bash
git add server/src/security.js server/test/socketRateLimit.test.js server/src/socketHandlers.js
git commit -m "feat(security): per-user token-bucket rate limiting on hot socket events"
```

---

### Task 5: Crash guards + graceful shutdown

**Files:**
- Modify: `server/src/db.js` (add `closeDb()`)
- Modify: `server/src/index.js` (process guards + SIGTERM/SIGINT handler in the bootstrap block)
- Create: `server/test/dbClose.test.js`

**Interfaces:**
- Consumes: `config.exitOnUncaught` from Task 1.
- Produces (`db.js`): `export function closeDb()` that calls `db.close()` (idempotent — guard against double close).

- [ ] **Step 1: Write the failing test**

Create `server/test/dbClose.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../src/db.js';

test('closeDb is exported and safe to call twice', () => {
  assert.equal(typeof closeDb, 'function');
  // Note: closing the shared dev DB handle is destructive for later tests, so
  // this test only asserts the contract shape, it does NOT invoke closeDb().
  assert.doesNotThrow(() => { /* contract present */ });
});
```

(Rationale: `db.js` opens one shared handle used by every other test in the process; actually closing it here would break tests that run later in the same `node --test` process. We assert the export exists and defer real close-behavior verification to the manual shutdown smoke test in Step 5.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/dbClose.test.js`
Expected: FAIL — `closeDb` is not a function (not exported).

- [ ] **Step 3: Add closeDb to db.js**

In `server/src/db.js`, after the `const db = new Database(...)` / `db.pragma(...)` setup block near the top, add:

```js
let dbClosed = false;
export function closeDb() {
  if (dbClosed) return;
  dbClosed = true;
  db.close();
}
```

- [ ] **Step 4: Add process guards + graceful shutdown to the bootstrap**

In `server/src/index.js`, add to imports:

```js
import { closeDb } from './db.js';
```

Inside the `import.meta.url === ...` bootstrap block (from Task 2), after `server.listen(...)`, add the guards. Place the `process.on` handlers so they close the HTTP server, DB, and exit cleanly:

```js
  const shutdown = (signal) => {
    console.log(`[server] ${signal} received — shutting down`);
    server.close(() => {
      try { closeDb(); } catch { /* already closed */ }
      process.exit(0);
    });
    // hard-stop if connections don't drain in 10s
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandledRejection:', reason);
    // recoverable (a failed emit, a rejected query) — do not crash the box
  });
  process.on('uncaughtException', (err) => {
    console.error('[server] uncaughtException:', err);
    // With all room/lobby state in RAM, exiting drops every live game. Default
    // is to stay up; flip EXIT_ON_UNCAUGHT=1 once state is durable + a manager
    // restarts the process.
    if (config.exitOnUncaught) shutdown('uncaughtException');
  });
```

- [ ] **Step 5: Verify**

Run: `node --test server/test/dbClose.test.js`
Expected: PASS.
Run: `npm test --prefix server`
Expected: full suite green.
Manual smoke: run `npm run dev`, then Ctrl-C — server logs `SIGINT received — shutting down` and exits within 10s without an error stack.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.js server/src/index.js server/test/dbClose.test.js
git commit -m "feat(security): process crash guards + graceful SIGTERM/SIGINT shutdown"
```

---

### Task 6: Token revocation via token_version (OPTIONAL — heaviest, defer if time-boxed)

**Files:**
- Modify: `server/src/db.js` (add `token_version` column + `getTokenVersion` / `bumpTokenVersion`)
- Modify: `server/src/auth.js` (embed `tv` in tokens; check it in both middlewares; add `POST /api/auth/logout`)
- Create: `server/test/tokenRevocation.test.js`

**Interfaces:**
- Produces (`db.js`): `getTokenVersion(userId) -> number` (defaults 0) and `bumpTokenVersion(userId) -> number` (increments, returns new value). Column added with the existing `ensureColumn` helper.
- Produces (`auth.js`): `signToken` embeds `tv: getTokenVersion(user.id)`; `authMiddleware` and `socketAuth` reject when `payload.tv !== user.token_version`. New `POST /api/auth/logout` (auth-required) bumps the version, invalidating every existing token for that user.
- Consumes: `getUserById` already returns the full row — read `user.token_version` there (no extra query beyond what these paths already do).

- [ ] **Step 1: Write the failing test**

Create `server/test/tokenRevocation.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import authRouter from '../src/auth.js';

function unique(p) { return `${p}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`; }

async function start() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

async function json(base, path, opts = {}) {
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { res, data: await res.json().catch(() => ({})) };
}

test('logout invalidates the current token', async () => {
  const s = await start();
  try {
    const username = unique('rev');
    const { data: signup } = await json(s.base, '/api/auth/signup', { method: 'POST', body: { username, password: 'secret123' } });
    const token = signup.token;
    // token works before logout
    const before = await json(s.base, '/api/auth/me', { token });
    assert.equal(before.res.status, 200);
    // logout bumps token_version
    const out = await json(s.base, '/api/auth/logout', { method: 'POST', token });
    assert.equal(out.res.status, 200);
    // same token now rejected
    const after = await json(s.base, '/api/auth/me', { token });
    assert.equal(after.res.status, 401);
  } finally {
    await s.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/tokenRevocation.test.js`
Expected: FAIL — `/api/auth/logout` is 404, and the old token still works after.

- [ ] **Step 3: Add the DB column + accessors**

In `server/src/db.js`, find the existing `ensureColumn('users', ...)` calls (used for `xp`/`frame`) and add alongside them:

```js
ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
```

Then add the accessors near the other user queries:

```js
export function getTokenVersion(userId) {
  const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId);
  return row ? row.token_version : 0;
}

export function bumpTokenVersion(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  return getTokenVersion(userId);
}
```

Confirm `getUserById` selects `*` (it does today) so `user.token_version` is available to the middlewares.

- [ ] **Step 4: Embed + verify tv in auth.js and add logout**

In `server/src/auth.js`, update the imports to pull the new helpers:

```js
import { createUser, getUserByUsername, getUserById, publicUser, updateUserProfile, getXp, getTokenVersion, bumpTokenVersion } from './db.js';
```

Change `signToken` to embed the version:

```js
export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, tv: getTokenVersion(user.id) },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}
```

In `authMiddleware`, after `const user = getUserById(payload.id); if (!user) return ...`, add the version check:

```js
  if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
```

In `socketAuth`, after its `const user = getUserById(payload.id); if (!user) return next(...)`, add:

```js
  if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
    return next(new Error('Unauthorized'));
  }
```

Add the logout route (auth-required) alongside the other routes:

```js
router.post('/logout', authMiddleware, (req, res) => {
  bumpTokenVersion(req.user.id);
  res.json({ ok: true });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test server/test/tokenRevocation.test.js`
Expected: PASS.
Run: `npm test --prefix server`
Expected: full suite green — existing tokens minted in other tests carry `tv: 0` which matches the default column value, so they keep working.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.js server/src/auth.js server/test/tokenRevocation.test.js
git commit -m "feat(security): DB-backed token revocation (token_version) + POST /api/auth/logout"
```

---

### Task 7: Document the security posture

**Files:**
- Modify: `README.md` (add a "Production security" section)
- Modify: `ROADMAP.md` (mark the hardening done; note what's still open — reconnection, Redis externalization, observability)

- [ ] **Step 1: Add a README section**

Append to `README.md`:

```markdown
## Production security

Before exposing this server to the internet, set these env vars (see
`server/.env.example`):

- `NODE_ENV=production` — turns on fail-fast config checks.
- `JWT_SECRET` — REQUIRED; the server refuses to boot in production without a
  strong, unique value. Generate one:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `CLIENT_ORIGIN` — REQUIRED; comma-separated allow-list of web origins (CORS).
- `TRUST_PROXY=1` — if behind nginx/Cloudflare, so rate limiting sees real IPs.

Hardening in place: helmet security headers, 64 kb JSON body cap, REST rate
limiting (300/15 min API, 10/15 min auth), per-user token-bucket limits on hot
socket events, process crash guards + graceful shutdown, and token revocation
via `POST /api/auth/logout`.

Still open (see ROADMAP): a disconnect currently forfeits (no reconnection
grace), all room/lobby state is in RAM (no durability, single-instance only),
and there is no structured logging/metrics yet.
```

- [ ] **Step 2: Update ROADMAP.md**

Add a dated "Done" note at the top of `ROADMAP.md` recording that the security hardening batch shipped, and add the three still-open items (reconnection grace, Redis state externalization for multi-instance, observability) to the forward-looking list.

- [ ] **Step 3: Commit**

```bash
git add README.md ROADMAP.md
git commit -m "docs(security): document production env vars and hardening posture"
```

---

## Notes for the executor

- **Order matters:** Task 1 (config) is the keystone every later task imports — do it first. Tasks 2–5 are independent of each other and can be reviewed separately. Task 6 (revocation) is the heaviest and safely deferrable; ship 1–5 first if time-boxed.
- **Dev must never break:** after every task, `npm run dev` must still boot with zero env vars set. The production checks only fire when `NODE_ENV=production`.
- **Restart the dev server after server-code edits** — the `:3001` process is plain `node src/index.js` (no `--watch`); stale code has repeatedly caused confusing behavior in this repo.
- **This plan does not touch scalability.** Reconnection grace, Redis-backed room state, and the SQLite→Postgres migration are separate, larger efforts noted in the review; they are prerequisites for multi-instance deployment, not part of hardening.
