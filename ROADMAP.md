# Playverse — Roadmap & Architecture Notes

Forward-looking notes for future versions. Nothing here is implemented yet — it
records *what to change, why, and when*. See [`DOMAINS.md`](./DOMAINS.md) for the
current architecture.

## What's already solid (reused by everything, no rework expected)
- **Auth, friends, presence, chat** — game-agnostic.
- **Registry pattern** (`server/src/games/registry.js` + `client/src/games/registry.js`)
  — adding a game is a drop-in. Interface already carries `type`, `minPlayers`, `maxPlayers`.
- **Socket fan-out** — `rooms.js` already broadcasts to all players in a room.

---

## 1. Per-game code-splitting (lazy-loading) — do before the 2nd/3rd game

**Problem:** The client registry statically imports every game, so Vite bundles them
all into one file. Every player downloads **all games' UI code** on first load — even
games they never open. Grows linearly per game; a large game (Canvas/physics/assets)
bloats *everyone's* first load.

> Note: server-side game *rules* never reach the client — only game UI is bundled.

**Fix:** Lazy-load each game with React `lazy()` + dynamic `import()`.
- First load = platform shell + lightweight game cards (name + thumbnail).
- A game's play code downloads only when the player opens it.
- Bonus: unchanged game chunks stay cached across releases.

**Effort:** Small, contained to the client registry + the Game page. The registry was
structured to make this swap easy.

| | Now (static) | After (lazy) |
|---|---|---|
| First load | platform + all games | platform + cards only |
| Open a game | already loaded | downloads that one game |
| Add 50th / large game | slows everyone | no effect on non-players |

---

## 2. N-player rooms / party system — do before the first 3+ player game

**Problem:** Room/invite orchestration is **hardcoded to exactly 2 players**:
- `rooms.js` → `acceptInvite` builds a room with two players (inviter + accepter).
- Invites are **1-to-1** (invite one friend → they accept → game starts).
- `forfeit` assumes a single opponent who wins.
- Client `Game.jsx` finds *the* opponent (singular).

**Fix:** Generalize to an N-player **party/lobby**:
- Create a room → invite several friends (and/or a shareable join code) → players join a
  **waiting room** with ready states → host starts when ready, respecting `min/maxPlayers`.
- Generalize disconnect/forfeit (drop player & continue vs. end — game-specific).
- Client: participant list / scoreboard instead of a single opponent.
- Optional: **group chat** for the party (chat is 1:1 today).

**No change needed:** DB schema, friends, presence, and the engine *interface*
(already has `min/maxPlayers`).

**Effort:** Medium, mostly contained to `rooms.js` + the client game view. Do it once;
every multiplayer game benefits.

---

## 3. Real-time / action game engine (e.g. Hill-Climb-style racer) — its own milestone

**Status:** `type: 'realtime'` is a placeholder label only. The actual engine is unbuilt.

**Needs:**
- Server **game-loop** (tick), input streaming, periodic state broadcast, lag handling.
- Client: Canvas + a 2D physics lib (Matter.js / Planck.js), not HTML/CSS.
- **Recommended model: "ghost racing"** — both race the same track, each simulates its own
  car locally, broadcast position so each sees the other as a ghost (no car-to-car
  collision). Avoids hard rollback/authoritative-physics netcode.

**Scaling note:** A single Node process running physics loops for many concurrent matches
will eventually need worker threads or horizontal scaling. Fine at friends-scale.

---

## 4. Assets pipeline (for large games)
- Images/audio/sprites need a static-asset/CDN strategy (currently inline SVG only).
- Combine with code-splitting so assets load per-game, on demand.

---

## 5. Cross-device / cross-network play (deployment)
Today it's **LAN-only** (server on a private IP). To play across the internet:
1. **Single-origin change:** have Express also serve the built client (`client/dist`) so
   there's one URL (no separate client host, no CORS/hostname juggling).
2. Then either:
   - **Tunnel** (`cloudflared` / `ngrok`) — public HTTPS URL in minutes, temporary, laptop
     must stay on. Good for a quick match.
   - **Deploy** (Render / Railway / Fly.io) — permanent URL, auto-HTTPS, WebSocket support.

**Deployment caveats for current v1:**
- **SQLite is often ephemeral** on free hosts → move to a persistent volume or hosted
  Postgres before relying on it.
- **Games live in server memory** → host sleep/restart drops in-progress games
  (refresh = forfeit by design today). Add room persistence + reconnection for robustness.
- **Single instance only** (no multi-server scaling yet) — fine for friends-and-family.

---

## Suggested sequencing
1. Per-game code-splitting (before 2nd/3rd game) — cheap, high payoff.
2. N-player room/party system (before first 3+ player game) — one-time refactor of `rooms.js`.
3. Deployment (single-origin → tunnel or host) when you want non-LAN play.
4. Real-time engine + assets pipeline when building the racer.
5. Persistence/reconnection hardening before a "real" public launch.

None of this is wasted rework — it's the evolution the registry was built to absorb.

---

## Appendix: Game distribution models (why Playverse is browser-based)

Key fact: **any game your device renders must have its code/assets on the device to run.**
The differences are *how much* you download, *where it runs*, and *whether it persists*.
"Online game" can mean two very different things:

| Model | What you download | Where it runs | Notes |
|---|---|---|---|
| **Installed** (Steam / console / mobile app) | Full **client** (never the server) | Your device | Permanent install; updates as patches/deltas. Multiplayer logic stays on company servers. |
| **Browser** (← Playverse) | Small client code → browser **cache** | Your device, in the browser sandbox | Feels instant, but it *is* downloading. No install; cache-temporary. Server rules never download. |
| **Cloud streaming** (GeForce NOW, Xbox Cloud) | **Nothing** of the game | Remote server | Streams video frames; sends inputs back. True "no download," but needs low-latency internet + a server GPU per player. |

**"Play without downloading anything"** in the strict sense = **cloud streaming** only: the
game runs remotely and you receive a video stream. Browser games still download code — it's
just small, automatic, and discarded.

**Where Playverse sits:** the **browser model**. Players download a lightweight client (made
lighter per-game by [#1 code-splitting](#1-per-game-code-splitting-lazy-loading--do-before-the-2nd3rd-game)),
it runs in their browser, and the **server stays authoritative** (players never receive
server-side game rules). This is the right choice for board/2D/casual games: instant,
cross-platform, no installs.

**When cloud streaming would matter:** only if hosting genuinely heavy 3D games without
players downloading them — huge infrastructure cost, unnecessary for anything on this roadmap.
