// Ghost Rider — real-time racing game (server side).
//
// Realtime games do NOT use the turn-based referee (no applyMove/getResult).
// The server's job is small: share a track seed + a synced start time, relay car
// positions between players (done in socketHandlers), and declare the first player
// to cross the finish line the winner (rooms.recordFinish). Each client simulates
// its own car locally — the "ghost racing" model — so there's no physics on the server.

const TRACK_LENGTH = 6000; // world units from start to the finish line
const COUNTDOWN_MS = 3000; // synced 3-2-1 before the gates open

function createInitialState() {
  return {
    seed: Math.floor(Math.random() * 1e9), // both clients build the same terrain
    trackLength: TRACK_LENGTH,
    startAt: Date.now() + COUNTDOWN_MS,
  };
}

export default {
  id: 'ghostrider',
  name: 'Ghost Rider',
  type: 'realtime',
  minPlayers: 2,
  maxPlayers: 4,
  createInitialState,
};
