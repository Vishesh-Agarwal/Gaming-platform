import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import authRouter from '../src/auth.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

async function startAuthServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function requestJson(base, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

test('GET /me returns the authorized account profile', async () => {
  const server = await startAuthServer();
  try {
    const username = unique('ap');
    const signup = await requestJson(server.base, '/api/auth/signup', {
      method: 'POST',
      body: { username, password: 'secret123' },
    });
    assert.equal(signup.res.status, 201);
    assert.equal(signup.data.user.username, username);
    assert.equal(signup.data.user.displayName, username);
    assert.equal(signup.data.user.nickname, '');
    assert.equal(signup.data.user.avatar, 'pilot');

    const me = await requestJson(server.base, '/api/auth/me', { token: signup.data.token });
    assert.equal(me.res.status, 200);
    assert.deepEqual(me.data.user, signup.data.user);
  } finally {
    await server.close();
  }
});

test('PATCH /me/profile persists username, display name, nickname, and avatar', async () => {
  const server = await startAuthServer();
  try {
    const signup = await requestJson(server.base, '/api/auth/signup', {
      method: 'POST',
      body: { username: unique('bp'), password: 'secret123' },
    });
    const nextUsername = unique('cp');
    const patch = await requestJson(server.base, '/api/auth/me/profile', {
      method: 'PATCH',
      token: signup.data.token,
      body: {
        username: nextUsername,
        displayName: 'Captain Zero',
        nickname: 'Zero',
        avatar: 'crown',
      },
    });
    assert.equal(patch.res.status, 200);
    assert.equal(patch.data.user.username, nextUsername);
    assert.equal(patch.data.user.displayName, 'Captain Zero');
    assert.equal(patch.data.user.nickname, 'Zero');
    assert.equal(patch.data.user.avatar, 'crown');

    const me = await requestJson(server.base, '/api/auth/me', { token: signup.data.token });
    assert.equal(me.res.status, 200);
    assert.equal(me.data.user.username, nextUsername);
    assert.equal(me.data.user.displayName, 'Captain Zero');
    assert.equal(me.data.user.nickname, 'Zero');
    assert.equal(me.data.user.avatar, 'crown');
  } finally {
    await server.close();
  }
});

test('PATCH /me/profile rejects unauthorized, invalid, and duplicate updates', async () => {
  const server = await startAuthServer();
  try {
    const a = await requestJson(server.base, '/api/auth/signup', {
      method: 'POST',
      body: { username: unique('dp'), password: 'secret123' },
    });
    const bUsername = unique('ep');
    await requestJson(server.base, '/api/auth/signup', {
      method: 'POST',
      body: { username: bUsername, password: 'secret123' },
    });

    const unauthorized = await requestJson(server.base, '/api/auth/me/profile', {
      method: 'PATCH',
      body: { nickname: 'Nope' },
    });
    assert.equal(unauthorized.res.status, 401);

    const invalidAvatar = await requestJson(server.base, '/api/auth/me/profile', {
      method: 'PATCH',
      token: a.data.token,
      body: { avatar: 'unknown-avatar' },
    });
    assert.equal(invalidAvatar.res.status, 400);

    const duplicate = await requestJson(server.base, '/api/auth/me/profile', {
      method: 'PATCH',
      token: a.data.token,
      body: { username: bUsername },
    });
    assert.equal(duplicate.res.status, 409);
  } finally {
    await server.close();
  }
});
