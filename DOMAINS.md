# Game Platform — Domain Map

A web platform hosting multiplayer games. Players sign up, add friends, chat, and
invite each other to games played live across devices. Built to add new games easily.

**Stack:** Node + Express + Socket.IO + SQLite (`better-sqlite3`) backend · React + Vite frontend.

## How to work across sessions

Each **domain** below is a self-contained unit with a clear **contract** (the functions/
events other domains rely on). Pick a domain, read its contract, and you can work on it
without touching the others. Tasks mirror these domains (see TaskList).

Dependency order: **Foundation → Auth → {Friends, Presence} → {Chat, Game engine} → Socket wiring → Client**.

---

## Server domains

### 1. Foundation — `server/src/db.js`, `server/src/index.js`
Owns the SQLite schema and the shared query layer everything else imports. Bootstraps
Express + Socket.IO.
- **Contract (db.js):** `createUser`, `getUserByUsername`, `getUserById`, `createFriendRequest`,
  `acceptFriendRequest`, `getFriendsList`, `getPendingRequests`, `areFriends`,
  `saveMessage`, `getConversation`, `markConversationRead`.
- **Tables:** `users`, `friendships(status: pending|accepted)`, `messages`.

### 2. Auth & Users — `server/src/auth.js`
Minimal auth: signup/login, bcrypt-hashed passwords, JWT token.
- **REST:** `POST /api/auth/signup`, `POST /api/auth/login` → `{ token, user }`.
- **Contract:** `authMiddleware` (Express), `socketAuth` (Socket.IO middleware sets `socket.user`),
  `verifyToken(token) -> user | null`.

### 3. Friends — `server/src/friends.js` (needs Auth)
Add/accept/list friends by username.
- **REST:** `GET /api/friends`, `GET /api/friends/requests`,
  `POST /api/friends/request {username}`, `POST /api/friends/accept {requestId}`.

### 4. Presence — `server/src/presence.js` (needs Auth)
In-memory online tracking via socket connect/disconnect. Each user joins room `user:<id>`.
- **Contract:** `init(io)`, `online(userId)`, `offline(userId)`, `isOnline(userId)`,
  `userRoom(userId)`, `emitToUser(io, userId, event, payload)`.

### 5. Chat — `server/src/chat.js` (needs Friends + Presence)
Friend-to-friend DMs, persisted, delivered live when recipient online.
- **REST:** `GET /api/chat/:friendId` → conversation history.
- **Socket:** in `chat:send {to, body}` → out `chat:message` to recipient + ack.

### 6. Game engine + rooms + registry — `server/src/rooms.js`, `server/src/games/registry.js`
Game-room lifecycle, invites, and the turn-based referee (server-authoritative moves).
- **Registry contract (each game module):** `{ id, name, type, minPlayers, maxPlayers,
  createInitialState(), applyMove(state, playerIndex, move) -> {state, error},
  getResult(state) -> {over, winner, draw} }`.
- **rooms.js contract:** `createInvite`, `acceptInvite`, `declineInvite`, `getRoom`,
  `makeMove`, `forfeit`.

### 7. Tic-Tac-Toe — `server/src/games/tictactoe.js` (+ client component)
First concrete game on the registry. `type: 'turn-based'`.

### 8. Socket wiring — `server/src/socketHandlers.js`
Integration layer: connects sockets to presence, chat, invites, and game moves.
- **Socket events:** `chat:send`, `game:invite`, `game:invite:accept`, `game:invite:decline`,
  `game:move`, `game:leave` (in) · `presence:update`, `chat:message`, `game:invited`,
  `game:start`, `game:state`, `game:over` (out).

---

## Client domains

### 9. Client platform (UI shell) — `client/src/**`
Vite + React. Routing, `AuthContext`, Login/signup, Lobby (friends, presence, add-friend,
invites, chat), and a Game page that renders the active game's component from the client
registry (`client/src/games/registry.js`).

### Future: real-time engine
The registry already carries a `type` field. Real-time games (e.g. a Hill-Climb-style racer)
will add `type: 'realtime'` with a server game-loop and a Canvas client component, reusing
all platform plumbing (auth, friends, chat, invites, rooms). Not built in v1.

## Run
`npm install` (root, installs both) then `npm run dev` → server :3001, client :5173.
