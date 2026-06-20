// Foundation domain: Express + Socket.IO bootstrap. Mounts REST routers and
// wires the realtime layer.
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import authRouter, { socketAuth } from './auth.js';
import friendsRouter from './friends.js';
import chatRouter from './chat.js';
import { listGames } from './games/registry.js';
import { initSockets } from './socketHandlers.js';

const PORT = process.env.PORT || 3001;
// Default (dev): reflect any origin so a second device on the LAN can connect.
// Set CLIENT_ORIGIN to lock this down in production.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/games', (_req, res) => res.json({ games: listGames() }));
app.use('/api/auth', authRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/chat', chatRouter);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });
io.use(socketAuth);
initSockets(io);

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(
    `[server] CORS origin: ${CLIENT_ORIGIN === true ? '(any — dev mode)' : CLIENT_ORIGIN}`
  );
});
