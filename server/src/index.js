// Foundation domain: Express + Socket.IO bootstrap. Mounts REST routers and
// wires the realtime layer.
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import config from './config.js';

const PORT = config.port;

// Registers every REST route on an app. Kept separate so createApp can assemble
// the middleware stack (helmet → CORS → json) before the routes.
function registerRoutes(app) {
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
  app.use('/api/chat', chatRouter);
  return app;
}

// Assembles the hardened Express app (helmet headers → config CORS → json body
// cap → routes). Exported so tests can mount the stack without binding a port.
// Friends router needs `io`; pass it when wiring the live server, omit in tests
// (the friends routes aren't under test here).
export function createApp(io = null) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '64kb' })); // cap body size
  if (io) app.use('/api/friends', createFriendsRouter(io));
  registerRoutes(app);
  return app;
}

// Boot the live server only when this module is run directly, never on import
// (so tests can import createApp without starting a listener).
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: config.corsOrigin } });
  io.use(socketAuth);
  server.on('request', createApp(io));
  initSockets(io);

  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] env=${config.nodeEnv} cors=${config.isProd ? config.corsOrigin.join(',') : '(any — dev)'}`);
  });
}
