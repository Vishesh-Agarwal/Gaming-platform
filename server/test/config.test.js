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
