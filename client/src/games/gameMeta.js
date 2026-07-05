export function playerCountLabel(game = {}) {
  const min = Number(game.minPlayers || 2);
  const max = Number(game.maxPlayers || min || 2);
  if (min === 2 && max === 2) return '1v1';
  if (min === max) return `${max} players`;
  return `${min}-${max} players`;
}

export function modeSummary(game = {}) {
  const modes = Array.isArray(game.modes) ? game.modes : [];
  if (modes.length === 0) return '';
  if (modes.length === 1) return modes[0].name || modes[0].id || '1 mode';
  return `${modes.length} modes`;
}

export function rulesForGame(game = {}) {
  const modes = Array.isArray(game.modes)
    ? game.modes.map((m) => ({ name: m.name || m.id, hint: m.hint || '' }))
    : [];
  const options = Array.isArray(game.options)
    ? game.options.map((o) => ({ label: o.label || o.key, value: o.default ?? '' }))
    : [];
  return {
    title: game.name || 'Game',
    playerCount: playerCountLabel(game),
    summary: game.rules || '',
    modes,
    options,
  };
}

export function requiresLandscape(gameId) {
  return ['karts', 'ghostrider', 'artillery', 'pool', 'battleship', 'skribble'].includes(gameId);
}
