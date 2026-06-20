// Thin REST client for the platform backend.
import { SERVER_URL } from './config.js';

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(SERVER_URL + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  signup: (username, password) =>
    request('/api/auth/signup', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),

  getFriends: (token) => request('/api/friends', { token }),
  getRequests: (token) => request('/api/friends/requests', { token }),
  sendFriendRequest: (token, username) =>
    request('/api/friends/request', { method: 'POST', body: { username }, token }),
  acceptFriendRequest: (token, requestId) =>
    request('/api/friends/accept', { method: 'POST', body: { requestId }, token }),

  getConversation: (token, friendId) => request('/api/chat/' + friendId, { token }),
  getGames: () => request('/api/games'),
};
