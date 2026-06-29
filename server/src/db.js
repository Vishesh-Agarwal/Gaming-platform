// Foundation domain: SQLite schema + shared query layer.
// Every other server domain imports its data access from here.
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'platform.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    read         INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_pair
    ON messages(sender_id, recipient_id, id);

  CREATE TABLE IF NOT EXISTS matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id     TEXT NOT NULL,
    game_id     TEXT NOT NULL,
    game_name   TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    winner_id   INTEGER,
    draw        INTEGER NOT NULL DEFAULT 0,
    forfeit     INTEGER NOT NULL DEFAULT 0,
    scores_json TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS match_players (
    match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username  TEXT NOT NULL,
    seat      INTEGER NOT NULL,
    result    TEXT NOT NULL,
    score     INTEGER,
    PRIMARY KEY(match_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id    TEXT NOT NULL,
    played     INTEGER NOT NULL DEFAULT 0,
    wins       INTEGER NOT NULL DEFAULT 0,
    losses     INTEGER NOT NULL DEFAULT 0,
    draws      INTEGER NOT NULL DEFAULT 0,
    forfeits   INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(user_id, game_id)
  );
`);

// ---- Users ---------------------------------------------------------------

export function createUser(username, passwordHash) {
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);
  return getUserById(info.lastInsertRowid);
}

export function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Public-safe shape (never expose password_hash)
export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username };
}

// ---- Friendships ---------------------------------------------------------

// Returns existing row in either direction between two users, if any.
export function getFriendship(a, b) {
  return db
    .prepare(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?)
          OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(a, b, b, a);
}

export function createFriendRequest(requesterId, addresseeId) {
  const info = db
    .prepare(
      `INSERT INTO friendships (requester_id, addressee_id, status)
       VALUES (?, ?, 'pending')`
    )
    .run(requesterId, addresseeId);
  return db.prepare('SELECT * FROM friendships WHERE id = ?').get(info.lastInsertRowid);
}

export function getFriendshipById(id) {
  return db.prepare('SELECT * FROM friendships WHERE id = ?').get(id);
}

export function acceptFriendRequest(requestId, addresseeId) {
  const info = db
    .prepare(
      `UPDATE friendships SET status = 'accepted'
       WHERE id = ? AND addressee_id = ? AND status = 'pending'`
    )
    .run(requestId, addresseeId);
  return info.changes > 0;
}

export function areFriends(a, b) {
  const row = getFriendship(a, b);
  return !!row && row.status === 'accepted';
}

// Accepted friends of a user, in either direction.
export function getFriendsList(userId) {
  return db
    .prepare(
      `SELECT u.id, u.username
       FROM friendships f
       JOIN users u ON u.id = CASE
                              WHEN f.requester_id = ? THEN f.addressee_id
                              ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.addressee_id = ?)
         AND f.status = 'accepted'
       ORDER BY u.username COLLATE NOCASE`
    )
    .all(userId, userId, userId);
}

// Incoming pending requests for a user.
export function getPendingRequests(userId) {
  return db
    .prepare(
      `SELECT f.id AS requestId, u.id AS fromUserId, u.username AS fromUsername, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`
    )
    .all(userId);
}

// ---- Messages ------------------------------------------------------------

export function saveMessage(senderId, recipientId, body) {
  const info = db
    .prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)')
    .run(senderId, recipientId, body);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

export function getConversation(userId, friendId, limit = 100) {
  return db
    .prepare(
      `SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, read, created_at
       FROM messages
       WHERE (sender_id = ? AND recipient_id = ?)
          OR (sender_id = ? AND recipient_id = ?)
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(userId, friendId, friendId, userId, limit)
    .reverse();
}

export function markConversationRead(userId, friendId) {
  db.prepare(
    'UPDATE messages SET read = 1 WHERE recipient_id = ? AND sender_id = ?'
  ).run(userId, friendId);
}

// ---- Match history / stats ----------------------------------------------

export function saveMatchResult({ roomId, gameId, gameName, players, result }) {
  const humanPlayers = players.filter((p) => !p.user.bot);
  if (!humanPlayers.length) return null;
  const winner = humanPlayers.find((p) => p.index === result.winner);
  const scores = Array.isArray(result.scores) ? result.scores : null;
  const info = db.prepare(
    `INSERT INTO matches (room_id, game_id, game_name, player_count, winner_id, draw, forfeit, scores_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    roomId,
    gameId,
    gameName,
    players.length,
    winner?.user.id || null,
    result.draw ? 1 : 0,
    result.forfeit ? 1 : 0,
    scores ? JSON.stringify(scores) : null
  );
  const matchId = info.lastInsertRowid;
  const insertPlayer = db.prepare(
    `INSERT INTO match_players (match_id, user_id, username, seat, result, score)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const upsertStats = db.prepare(
    `INSERT INTO player_stats (user_id, game_id, played, wins, losses, draws, forfeits, best_score, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       played = played + 1,
       wins = wins + excluded.wins,
       losses = losses + excluded.losses,
       draws = draws + excluded.draws,
       forfeits = forfeits + excluded.forfeits,
       best_score = CASE
         WHEN excluded.best_score IS NULL THEN player_stats.best_score
         WHEN player_stats.best_score IS NULL THEN excluded.best_score
         WHEN excluded.best_score > player_stats.best_score THEN excluded.best_score
         ELSE player_stats.best_score
       END,
       updated_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const p of humanPlayers) {
      const won = !result.draw && result.winner === p.index;
      const rowResult = result.draw ? 'draw' : won ? 'win' : 'loss';
      const score = scores?.[p.index] ?? null;
      insertPlayer.run(matchId, p.user.id, p.user.username, p.index, rowResult, score);
      upsertStats.run(
        p.user.id,
        gameId,
        won ? 1 : 0,
        !result.draw && !won ? 1 : 0,
        result.draw ? 1 : 0,
        result.forfeit && !won ? 1 : 0,
        score
      );
    }
  });
  tx();
  return matchId;
}

export function getUserStats(userId) {
  const stats = db.prepare(
    `SELECT game_id AS gameId, played, wins, losses, draws, forfeits, best_score AS bestScore, updated_at
     FROM player_stats
     WHERE user_id = ?
     ORDER BY played DESC, wins DESC`
  ).all(userId);
  const recent = db.prepare(
    `SELECT m.id, m.game_id AS gameId, m.game_name AS gameName, m.player_count AS playerCount,
            m.winner_id AS winnerId, m.draw, m.forfeit, m.scores_json AS scoresJson, m.created_at,
            mp.result, mp.score
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     WHERE mp.user_id = ?
     ORDER BY m.id DESC
     LIMIT 20`
  ).all(userId).map((m) => ({
    ...m,
    draw: !!m.draw,
    forfeit: !!m.forfeit,
    scores: m.scoresJson ? JSON.parse(m.scoresJson) : null,
    scoresJson: undefined,
  }));
  return { stats, recent };
}

export default db;
