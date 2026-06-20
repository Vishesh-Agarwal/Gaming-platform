// Auth & Users domain: minimal signup/login with hashed passwords + JWT.
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, getUserByUsername, getUserById, publicUser } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '30d';

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

// Returns the decoded user payload, or null if invalid/expired.
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: requires a valid Bearer token; sets req.user.
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const user = getUserById(payload.id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = publicUser(user);
  next();
}

// Socket.IO middleware: validates handshake auth token, sets socket.user.
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  const payload = token && verifyToken(token);
  if (!payload) return next(new Error('Unauthorized'));
  const user = getUserById(payload.id);
  if (!user) return next(new Error('Unauthorized'));
  socket.user = publicUser(user);
  next();
}

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res
      .status(400)
      .json({ error: 'Username must be 3-20 chars: letters, numbers, underscore.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (getUserByUsername(username)) {
    return res.status(409).json({ error: 'Username already taken.' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = createUser(username, hash);
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = getUserByUsername(username || '');
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  return res.json({ token: signToken(user), user: publicUser(user) });
});

export default router;
