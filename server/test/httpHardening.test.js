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
