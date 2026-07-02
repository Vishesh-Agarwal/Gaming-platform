// Foundation domain: Express + Socket.IO bootstrap. Mounts REST routers and
// wires the realtime layer.
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import authRouter, { socketAuth } from './auth.js';
import { authMiddleware } from './auth.js';
import createFriendsRouter from './friends.js';
import chatRouter from './chat.js';
import { listGames } from './games/registry.js';
import { initSockets } from './socketHandlers.js';
import {
  getUserStats, getXp, getUnlockedAchievements,
  topByXp, topByGameWins, topByWeeklyWins,
} from './db.js';
import { levelForXp } from './progression.js';
import { getDailyChallenges, utcDay } from './challenges.js';
import { unlocksForLevel } from './unlocks.js';

const PORT = process.env.PORT || 3001;
// Default (dev): reflect any origin so a second device on the LAN can connect.
// Set CLIENT_ORIGIN to lock this down in production.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });
io.use(socketAuth);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/games', (_req, res) => res.json({ games: listGames() }));
app.get('/api/stats/me', authMiddleware, (req, res) => res.json(getUserStats(req.user.id)));
app.get('/api/progression/me', authMiddleware, (req, res) => {
  const xp = getXp(req.user.id);
  const level = levelForXp(xp);
  res.json({
    xp,
    level,
    achievements: getUnlockedAchievements(req.user.id),
    unlocks: unlocksForLevel(level.level),
  });
});
app.get('/api/progression/challenges', authMiddleware, (req, res) => {
  const day = utcDay();
  res.json({ day, challenges: getDailyChallenges(req.user.id, day) });
});
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const board = String(req.query.board || 'xp');
  let rows;
  if (board === 'game') rows = topByGameWins(String(req.query.gameId || ''), 20).map((r) => ({ ...r, value: r.wins }));
  else if (board === 'weekly') rows = topByWeeklyWins(20).map((r) => ({ ...r, value: r.wins }));
  else rows = topByXp(20).map((r) => ({ ...r, value: r.xp }));
  res.json({
    board,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      name: r.display_name || r.username,
      avatar: r.avatar,
      value: r.value,
      you: r.id === req.user.id,
    })),
  });
});
app.use('/api/auth', authRouter);
app.use('/api/friends', createFriendsRouter(io));
app.use('/api/chat', chatRouter);

initSockets(io);

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(
    `[server] CORS origin: ${CLIENT_ORIGIN === true ? '(any — dev mode)' : CLIENT_ORIGIN}`
  );
});
