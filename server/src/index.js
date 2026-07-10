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
import { closeDb } from './db.js';
import { rehydrate, snapshotNow, startSnapshotter, stopSnapshotter } from './persistence.js';
import { resumeBots, scheduleOfflineForfeits, evictOfflineLobbyMembers } from './socketHandlers.js';
import { armTurnClock } from './turnclock.js';
import config from './config.js';
import rateLimit from 'express-rate-limit';

const PORT = config.port;

// Registers every REST route on an app. Kept separate so createApp can assemble
// the middleware stack (helmet → CORS → json) before the routes.
function registerRoutes(app) {
  // Rate limits: a lenient blanket cap on all API traffic, plus a strict cap on
  // the auth endpoints to blunt credential brute-forcing. Fresh instances per
  // createApp() so test apps don't share limiter state.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again later.' },
  });
  app.use('/api', apiLimiter);
  app.use('/api/auth', authLimiter);

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

  // Restore any live turn-based games/lobbies persisted before the last stop.
  const { roomIds } = rehydrate();
  for (const id of roomIds) armTurnClock(io, id);
  resumeBots(io, roomIds);
  // Everyone is offline at boot: start their reconnect grace windows, and give
  // lobby members the same window before sweeping ghosts out of matchmaking.
  scheduleOfflineForfeits(io, roomIds);
  setTimeout(() => evictOfflineLobbyMembers(io), config.reconnectGraceMs).unref();
  startSnapshotter();
  if (roomIds.length) console.log(`[server] rehydrated ${roomIds.length} live game(s)`);

  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] env=${config.nodeEnv} cors=${config.isProd ? config.corsOrigin.join(',') : '(any — dev)'}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received — shutting down`);
    // Snapshot synchronously FIRST: the disconnect handlers that fire while
    // sockets close mutate room/lobby state, and with the snapshotter stopped
    // those mutations must not outrun (or replace) the final write.
    try { stopSnapshotter(); snapshotNow(); } catch (e) { console.error('[server] final snapshot failed:', e); }
    // io.close also closes the http server; bare server.close never completes
    // while websockets hold their connections open.
    io.close(() => {
      try { closeDb(); } catch { /* already closed */ }
      process.exit(0);
    });
    // hard-stop if connections don't drain in 10s (snapshot is already safe)
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandledRejection:', reason);
    // recoverable (a failed emit, a rejected query) — do not crash the box
  });
  process.on('uncaughtException', (err) => {
    console.error('[server] uncaughtException:', err);
    // With all room/lobby state in RAM, exiting drops every live game. Default
    // is to stay up; flip EXIT_ON_UNCAUGHT=1 once state is durable + a manager
    // restarts the process.
    if (config.exitOnUncaught) shutdown('uncaughtException');
  });
}
