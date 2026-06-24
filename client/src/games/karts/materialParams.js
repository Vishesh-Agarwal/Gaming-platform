// Pure, GL-free material parameters and a generic disposing cache.
// IMPORTANT: do NOT import three here — this file is imported by node --test,
// whose runner (the server package) has no three dependency.

// Per-map ground composition. The drivable field is asphalt; a grass perimeter
// band and grass aprons frame it. grassRatio biases how wide the grass border is.
const GROUND_PARAMS = {
  arena:     { grassRatio: 0.35, asphalt: '#3b3d42', grass: '#4a6b32' },
  pillars:   { grassRatio: 0.30, asphalt: '#3a3c41', grass: '#496a31' },
  gauntlet:  { grassRatio: 0.20, asphalt: '#37393e', grass: '#456530' },
  launchpad: { grassRatio: 0.25, asphalt: '#3c3e44', grass: '#4c6e34' },
};
const GROUND_DEFAULT = { grassRatio: 0.30, asphalt: '#3b3d42', grass: '#4a6b32' };

export function groundParamsFor(mapId) {
  return GROUND_PARAMS[mapId] || GROUND_DEFAULT;
}

// Painted automotive metal: keep the player's base color, give it a clearcoat-ish
// sheen via moderate metalness and low-ish roughness so the env map reads on it.
export function kartPaintParams(color) {
  return { color, metalness: 0.6, roughness: 0.35 };
}

// Generic memoizing cache. producer(key) -> value; value may expose .dispose().
export function createCache(producer) {
  const store = new Map();
  return {
    get(key) {
      if (!store.has(key)) store.set(key, producer(key));
      return store.get(key);
    },
    has(key) {
      return store.has(key);
    },
    dispose() {
      for (const v of store.values()) {
        if (v && typeof v.dispose === 'function') v.dispose();
      }
      store.clear();
    },
  };
}
