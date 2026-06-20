// Friends domain: add/accept/list friends by username.
import express from 'express';
import { authMiddleware } from './auth.js';
import {
  getUserByUsername,
  getFriendship,
  createFriendRequest,
  acceptFriendRequest,
  getFriendsList,
  getPendingRequests,
} from './db.js';

const router = express.Router();
router.use(authMiddleware);

// List accepted friends.
router.get('/', (req, res) => {
  res.json({ friends: getFriendsList(req.user.id) });
});

// Incoming pending requests.
router.get('/requests', (req, res) => {
  res.json({ requests: getPendingRequests(req.user.id) });
});

// Send a friend request by username.
router.post('/request', (req, res) => {
  const { username } = req.body || {};
  const target = getUserByUsername(username || '');
  if (!target) return res.status(404).json({ error: 'No user with that username.' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "You can't add yourself." });
  }
  const existing = getFriendship(req.user.id, target.id);
  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Already friends.' });
    }
    return res.status(409).json({ error: 'A request already exists.' });
  }
  createFriendRequest(req.user.id, target.id);
  res.status(201).json({ ok: true });
});

// Accept an incoming request.
router.post('/accept', (req, res) => {
  const { requestId } = req.body || {};
  const ok = acceptFriendRequest(requestId, req.user.id);
  if (!ok) return res.status(404).json({ error: 'No matching pending request.' });
  res.json({ ok: true });
});

export default router;
