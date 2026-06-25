// Turn clock: a per-room timeout for turn-based games that declare turnTimeoutMs.
// Unlike the realtime engine there's no tick loop — each turn schedules a single
// timer to its deadline. When it fires, the room's game auto-resolves the turn
// (rooms.applyTimeout), the new state is broadcast, and the next turn is re-armed.
import { applyTimeout, getTurnEndsAt } from './rooms.js';
import { emitToUser } from './presence.js';

const clocks = new Map(); // roomId -> timeout id

export function armTurnClock(io, roomId) {
  stopTurnClock(roomId);
  const endsAt = getTurnEndsAt(roomId);
  if (!endsAt) return;
  const delay = Math.max(0, endsAt - Date.now());
  const id = setTimeout(() => {
    clocks.delete(roomId);
    const out = applyTimeout(roomId);
    if (!out) return;
    for (const pid of out.players) emitToUser(io, pid, 'game:state', { room: out.room });
    if (out.over) {
      for (const pid of out.players) emitToUser(io, pid, 'game:over', { room: out.room });
    } else {
      armTurnClock(io, roomId); // next player's turn
    }
  }, delay);
  clocks.set(roomId, id);
}

export function stopTurnClock(roomId) {
  const id = clocks.get(roomId);
  if (id) {
    clearTimeout(id);
    clocks.delete(roomId);
  }
}
