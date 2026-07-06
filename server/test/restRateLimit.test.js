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
