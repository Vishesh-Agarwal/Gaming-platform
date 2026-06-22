// Realtime engine: a fixed-rate tick loop per active server-authoritative match.
// Each tick it advances the room's sim (rooms.stepRoom) and broadcasts a snapshot
// to every player. Reusable for any game whose module exposes step()/snapshot().
import { stepRoom } from './rooms.js';
import { emitToUser } from './presence.js';

const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;

const loops = new Map(); // roomId -> { id, last }

export function startMatch(io, roomId) {
  if (loops.has(roomId)) return;
  const entry = { last: Date.now() };
  entry.id = setInterval(() => {
    const now = Date.now();
    const dt = (now - entry.last) / 1000;
    entry.last = now;
    const out = stepRoom(roomId, dt);
    if (!out) { stopMatch(roomId); return; }
    for (const pid of out.players) emitToUser(io, pid, 'game:rt:snap', out.data);
    if (out.over) {
      for (const pid of out.players) emitToUser(io, pid, 'game:over', { room: out.room });
      stopMatch(roomId);
    }
  }, TICK_MS);
  loops.set(roomId, entry);
}

export function stopMatch(roomId) {
  const entry = loops.get(roomId);
  if (entry) {
    clearInterval(entry.id);
    loops.delete(roomId);
  }
}
