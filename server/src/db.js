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

export default db;
