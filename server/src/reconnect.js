// Pending-forfeit timers for reconnection grace. When a player's last socket
// drops mid-(turn-based-)game, socketHandlers schedules a forfeit here instead
// of running it immediately; a reconnect within the window cancels it. Pure
// timer bookkeeping — no io/rooms imports, so it unit-tests in isolation.
const timers = new Map(); // userId -> timeout id

export function scheduleForfeit(userId, ms, onExpire) {
  cancelForfeit(userId); // never stack two timers for the same user
  const id = setTimeout(() => {
    timers.delete(userId);
    onExpire();
  }, ms);
  timers.set(userId, id);
}

export function cancelForfeit(userId) {
  const id = timers.get(userId);
  if (id === undefined) return false;
  clearTimeout(id);
  timers.delete(userId);
  return true;
}

export function hasPending(userId) {
  return timers.has(userId);
}
