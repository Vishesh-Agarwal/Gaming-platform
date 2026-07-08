// Durability: periodic + on-shutdown snapshot of live turn-based rooms and
// lobbies to SQLite, and rehydration on boot. Single-instance only.
import { exportRooms, importRooms } from './rooms.js';
import { exportLobbies, importLobbies } from './lobbies.js';
import { replaceDurableState, readDurableState } from './db.js';

// Bump whenever the serialized room/lobby shape changes — older snapshots are
// then discarded on load rather than mis-read.
export const SNAP_V = 1;

let timer = null;

// Pure: turn raw durable_state rows into { rooms, lobbies }, skipping rows whose
// version mismatches or whose json is unparseable. Never throws.
export function parseSnapshotRows(rows) {
  const rooms = [];
  const lobbies = [];
  for (const row of rows || []) {
    if (!row || row.v !== SNAP_V) continue;
    let data;
    try { data = JSON.parse(row.json); } catch { continue; }
    if (row.kind === 'room') rooms.push(data);
    else if (row.kind === 'lobby') lobbies.push(data);
  }
  return { rooms, lobbies };
}

export function snapshotNow() {
  const rows = [];
  for (const r of exportRooms()) rows.push({ kind: 'room', id: r.id, v: SNAP_V, json: JSON.stringify(r) });
  for (const l of exportLobbies()) rows.push({ kind: 'lobby', id: l.id, v: SNAP_V, json: JSON.stringify(l) });
  replaceDurableState(rows);
}

export function loadSnapshot() {
  return parseSnapshotRows(readDurableState());
}

// Load the snapshot into the live Maps. Returns the imported room ids so the
// caller can re-arm turn clocks and nudge bots.
export function rehydrate() {
  const { rooms, lobbies } = loadSnapshot();
  importLobbies(lobbies);
  const roomIds = importRooms(rooms);
  return { roomIds };
}

export function startSnapshotter(ms = 3000) {
  stopSnapshotter();
  timer = setInterval(() => {
    try { snapshotNow(); } catch (e) { console.error('[persistence] snapshot failed:', e); }
  }, ms);
  timer.unref?.();
}

export function stopSnapshotter() {
  if (timer) { clearInterval(timer); timer = null; }
}
