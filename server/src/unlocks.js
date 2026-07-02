// Level-gated cosmetics catalog. The server is the enforcer; the client
// mirrors this list for display only (client/src/preferences.js).
export const AVATARS = [
  { id: 'pilot', label: 'Pilot', minLevel: 1 },
  { id: 'bolt', label: 'Bolt', minLevel: 1 },
  { id: 'crown', label: 'Crown', minLevel: 1 },
  { id: 'target', label: 'Target', minLevel: 1 },
  { id: 'spark', label: 'Spark', minLevel: 1 },
  { id: 'shield', label: 'Shield', minLevel: 1 },
  { id: 'flame', label: 'Flame', minLevel: 3 },
  { id: 'ace', label: 'Ace', minLevel: 5 },
  { id: 'rocket', label: 'Rocket', minLevel: 8 },
  { id: 'gem', label: 'Gem', minLevel: 12 },
  { id: 'dragon', label: 'Dragon', minLevel: 16 },
  { id: 'mythic', label: 'Mythic', minLevel: 20 },
];

export const FRAMES = [
  { id: 'none', label: 'None', minLevel: 1 },
  { id: 'bronze', label: 'Bronze', minLevel: 4 },
  { id: 'silver', label: 'Silver', minLevel: 7 },
  { id: 'gold', label: 'Gold', minLevel: 10 },
  { id: 'neon', label: 'Neon', minLevel: 14 },
  { id: 'legend', label: 'Legend', minLevel: 18 },
];

export const THEMES = [
  { id: 'default', label: 'Console', minLevel: 1 },
  { id: 'light', label: 'Daylight', minLevel: 1 },
  { id: 'arcade', label: 'Arcade', minLevel: 6 },
];

const can = (list) => (id, level) => {
  const item = list.find((x) => x.id === id);
  return !!item && level >= item.minLevel;
};
export const canUseAvatar = can(AVATARS);
export const canUseFrame = can(FRAMES);

export function unlocksForLevel(level) {
  const mark = (list) => list.map((x) => ({ ...x, unlocked: level >= x.minLevel }));
  return { avatars: mark(AVATARS), frames: mark(FRAMES), themes: mark(THEMES) };
}
