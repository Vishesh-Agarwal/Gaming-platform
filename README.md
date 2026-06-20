# 🎮 Game Platform

An extensible multiplayer game platform. Sign up, add friends, chat, and invite each
other to games played live across devices. First game: **Tic-Tac-Toe**.

- **Backend:** Node + Express + Socket.IO + SQLite (`better-sqlite3`)
- **Frontend:** React + Vite + Socket.IO client
- **Server-authoritative** games — every move is validated on the server.
- **Extensible** — adding a game = one server rules module + one React component (see below).

See [`DOMAINS.md`](./DOMAINS.md) for the architecture/domain map.

## Run it

```bash
npm install      # installs root + server + client
npm run dev      # starts server (:3001) and client (:5173)
```

Open **http://localhost:5173** in two browser windows (or two devices on the same
Wi-Fi — use the `Network:` URL Vite prints) and sign up as two different users.

### Try the full flow
1. Sign up as two users (two windows).
2. In window A: add the other username under **Add friend**.
3. In window B: **Accept** the friend request.
4. Click a friend to **chat**; click **Play** to invite them to Tic-Tac-Toe.
5. Accept the invite → play in real time.

## Adding a new game later

1. **Server rules:** create `server/src/games/<id>.js` implementing the registry
   contract (`createInitialState`, `applyMove`, `getResult`) and register it in
   `server/src/games/registry.js`.
2. **Client UI:** create `client/src/games/<Name>.jsx` and register it in
   `client/src/games/registry.js`.

The platform (auth, friends, chat, invites, rooms) needs no changes. The registry
also carries a `type` field (`turn-based` now, `realtime` later) for future
real-time/action games.

## Scope (v1)

Included: minimal auth (hashed passwords + JWT), friends, presence, 1:1 chat
(persisted), Tic-Tac-Toe, cross-device play.

Deferred: email verify/password reset, match history, reconnection (refresh =
forfeit), real-time/physics games, production hardening.
