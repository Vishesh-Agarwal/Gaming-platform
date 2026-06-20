// Chat domain: friend-to-friend DMs. REST for history; live delivery via sockets.
import express from 'express';
import { authMiddleware } from './auth.js';
import { areFriends, getConversation, markConversationRead } from './db.js';

const router = express.Router();
router.use(authMiddleware);

// Conversation history with a friend (also marks their messages read).
router.get('/:friendId', (req, res) => {
  const friendId = Number(req.params.friendId);
  if (!areFriends(req.user.id, friendId)) {
    return res.status(403).json({ error: 'Not friends.' });
  }
  const messages = getConversation(req.user.id, friendId);
  markConversationRead(req.user.id, friendId);
  res.json({ messages });
});

export default router;
