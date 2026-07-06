// Socket-event rate limiting via a per-key token bucket. Pure and clock-injectable
// so it unit-tests without any socket. Keys are "<userId>:<event>".
export function createBucketLimiter({ capacity, refillPerSec }) {
  const buckets = new Map(); // key -> { tokens, last }
  return {
    allow(key, cost = 1, now = Date.now()) {
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
      // refill based on elapsed time, capped at capacity
      const elapsed = Math.max(0, now - b.last) / 1000;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
      b.last = now;
      if (b.tokens >= cost) { b.tokens -= cost; return true; }
      return false;
    },
  };
}

// Per-event budgets. Chosen generous enough for real play, tight enough to stop
// spam/DoS. Unlisted events are unlimited.
const LIMITS = {
  'chat:send':     { capacity: 8,  refillPerSec: 1 },   // ~1 msg/s, burst 8
  'game:move':     { capacity: 12, refillPerSec: 4 },   // fast turn play OK
  'game:invite':   { capacity: 5,  refillPerSec: 0.2 }, // 1 invite / 5s
  'lobby:create':  { capacity: 4,  refillPerSec: 0.1 }, // 1 lobby / 10s
  'game:rt:input': { capacity: 60, refillPerSec: 40 },  // 30–40 Hz input stream
};

const limiters = new Map(); // event -> bucket limiter
for (const [event, cfg] of Object.entries(LIMITS)) {
  limiters.set(event, createBucketLimiter(cfg));
}

// Returns true if this user may fire this event now. Unlisted events => always true.
export function allowSocketEvent(userId, event, now = Date.now()) {
  const lim = limiters.get(event);
  if (!lim) return true;
  return lim.allow(`${userId}:${event}`, 1, now);
}
