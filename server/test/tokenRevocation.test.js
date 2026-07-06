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
