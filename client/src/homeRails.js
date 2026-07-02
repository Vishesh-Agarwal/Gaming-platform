// Pure helpers for the Home rails: which game to feature in the hero and
// which games go in the "Continue playing" rail. Kept UI-free for testing.
export function pickFeaturedGame(registryIds = [], stats = [], daySeed = 0) {
  const rows = Array.isArray(stats) ? stats.filter((s) => registryIds.includes(s.gameId)) : [];
  if (rows.length) {
    return rows.reduce((top, s) => (s.played > top.played ? s : top), rows[0]).gameId;
  }
  if (!registryIds.length) return null;
  return registryIds[Math.abs(daySeed) % registryIds.length];
}

export function recentGameIds(recent = [], registryIds = [], limit = 6) {
  const out = [];
  for (const m of Array.isArray(recent) ? recent : []) {
    if (registryIds.includes(m.gameId) && !out.includes(m.gameId)) out.push(m.gameId);
    if (out.length >= limit) break;
  }
  return out;
}
