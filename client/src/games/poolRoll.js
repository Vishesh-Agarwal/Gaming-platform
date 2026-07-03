// Pure roll-state tracker for the shot replay: accumulates each ball's roll
// angle (distance / radius) and latest travel direction from frame-to-frame
// displacement, so the renderer can slide the number cap / stripe band across
// the ball face like a rolling ball. No DOM — node-testable.

export function createRollState() {
  return new Map(); // id -> { x, y, angle, dirX, dirY }
}

export function advanceRoll(state, frame, ballR) {
  for (const d of frame) {
    const prev = state.get(d.id);
    if (!prev) {
      state.set(d.id, { x: d.x, y: d.y, angle: 0, dirX: 1, dirY: 0 });
      continue;
    }
    const dx = d.x - prev.x;
    const dy = d.y - prev.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      prev.angle += dist / ballR;
      prev.dirX = dx / dist;
      prev.dirY = dy / dist;
    }
    prev.x = d.x;
    prev.y = d.y;
  }
}

export function rollFor(state, id) {
  const r = state.get(id);
  if (!r) return null;
  return { angle: r.angle, dirX: r.dirX, dirY: r.dirY };
}
