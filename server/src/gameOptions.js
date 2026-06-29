export function cleanTextList(value, spec = {}) {
  const raw = Array.isArray(value) ? value.join('\n') : String(value || '');
  const maxItems = Math.max(1, Math.floor(Number(spec.maxItems) || 40));
  const maxLength = Math.max(8, Math.floor(Number(spec.maxLength) || 40));
  const minLength = Math.max(1, Math.floor(Number(spec.minLength) || 2));
  const seen = new Set();
  const out = [];

  for (const line of raw.split(/\r?\n|,/)) {
    const cleaned = line
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
    if (cleaned.length < minLength || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }

  return out;
}

export function resolveGameOptions(game, options, { includeLabels = false } = {}) {
  const source = options || {};
  const resolved = { ...source };
  const labels = [];

  if (game.modes?.length) {
    const mode = game.modes.find((m) => m.id === source.mode) || game.modes[0];
    resolved.mode = mode.id;
    labels.push(mode.name);
  }

  if (game.optionsSpec) {
    for (const [key, spec] of Object.entries(game.optionsSpec)) {
      if (spec.type === 'int') {
        let value = parseInt(source[key], 10);
        if (!Number.isFinite(value)) value = spec.default;
        value = Math.max(spec.min, Math.min(spec.max, value));
        resolved[key] = value;
        labels.push(`${value} ${(spec.label || key).toLowerCase()}`);
      } else if (spec.type === 'textList') {
        const value = cleanTextList(source[key], spec);
        if (value.length) {
          resolved[key] = value;
          labels.push(`${value.length} custom prompts`);
        } else {
          delete resolved[key];
        }
      }
    }
  }

  return includeLabels ? { options: resolved, labels } : resolved;
}
