// Friends domain: add/accept/list friends by username.
// Built as a factory so it can push live notifications over Socket.IO.
import express from 'express';
import { authMiddleware } from './auth.js';
import { emitToUser } from './presence.js';
import {
  getUserByUsername,
  getFriendship,
  getFriendshipById,
  createFriendRequest,
  acceptFriendRequest,
  getFriendsList,
  getPendingRequests,
} from './db.js';

export default function createFriendsRouter(io) {
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
    const fr = createFriendRequest(req.user.id, target.id);
    // Live-notify the recipient so the request appears without a refresh.
    emitToUser(io, target.id, 'friend:request', {
      requestId: fr.id,
      fromUserId: req.user.id,
      fromUsername: req.user.username,
    });
    res.status(201).json({ ok: true });
  });

  // Accept an incoming request.
  router.post('/accept', (req, res) => {
    const { requestId } = req.body || {};
    const friendship = getFriendshipById(requestId);
    const ok = acceptFriendRequest(requestId, req.user.id);
    if (!ok) return res.status(404).json({ error: 'No matching pending request.' });
    // Tell the original requester they're now friends (refresh their list + presence).
    if (friendship) {
      emitToUser(io, friendship.requester_id, 'friend:accepted', {
        userId: req.user.id,
        username: req.user.username,
      });
    }
    res.json({ ok: true });
  });

  return router;
}
