// Pending-forfeit timers for reconnection grace. When a player's last socket
// drops mid-(turn-based-)game, socketHandlers schedules a forfeit here instead
// of running it immediately; a reconnect within the window cancels it. Pure
// timer bookkeeping — no io/rooms imports, so it unit-tests in isolation.
const timers = new Map(); // userId -> { id: timeout id, until: expiry epoch ms }

export function scheduleForfeit(userId, ms, onExpire) {
  cancelForfeit(userId); // never stack two timers for the same user
  const id = setTimeout(() => {
    timers.delete(userId);
    onExpire();
  }, ms);
  timers.set(userId, { id, until: Date.now() + ms });
}

export function cancelForfeit(userId) {
  const timer = timers.get(userId);
  if (timer === undefined) return false;
  clearTimeout(timer.id);
  timers.delete(userId);
  return true;
}

export function hasPending(userId) {
  return timers.has(userId);
}

// Wall-clock time the user's grace window expires, or null if none pending.
export function pendingUntil(userId) {
  return timers.get(userId)?.until ?? null;
}
