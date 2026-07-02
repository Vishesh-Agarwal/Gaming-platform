// Display metadata for achievement badges — mirrors id/name/icon/desc from
// server/src/achievements.js (the server decides what's unlocked; this only
// renders earned badges in the profile).
export const ACHIEVEMENT_META = [
  { id: 'first-game', name: 'Welcome to the Arena', icon: '🎮', desc: 'Play your first match.' },
  { id: 'first-win', name: 'First Blood', icon: '🏆', desc: 'Win your first match.' },
  { id: 'games-10', name: 'Regular', icon: '🕹️', desc: 'Play 10 matches.' },
  { id: 'games-50', name: 'Veteran', icon: '🎖️', desc: 'Play 50 matches.' },
  { id: 'games-200', name: 'Marathon Runner', icon: '💾', desc: 'Play 200 matches.' },
  { id: 'wins-10', name: 'Contender', icon: '⚔️', desc: 'Win 10 matches.' },
  { id: 'wins-50', name: 'Champion', icon: '👑', desc: 'Win 50 matches.' },
  { id: 'wins-150', name: 'Legend', icon: '🌟', desc: 'Win 150 matches.' },
  { id: 'streak-3', name: 'Heating Up', icon: '🔥', desc: 'Win 3 in a row.' },
  { id: 'streak-5', name: 'On Fire', icon: '☄️', desc: 'Win 5 in a row.' },
  { id: 'streak-10', name: 'Unstoppable', icon: '⚡', desc: 'Win 10 in a row.' },
  { id: 'explorer-5', name: 'Tourist', icon: '🧭', desc: 'Play 5 different games.' },
  { id: 'explorer-10', name: 'Explorer', icon: '🗺️', desc: 'Play 10 different games.' },
  { id: 'explorer-all', name: 'Completionist', icon: '💯', desc: 'Play every game on the platform.' },
  { id: 'party-8', name: 'Full House', icon: '🎉', desc: 'Play a match with 8 players.' },
  { id: 'party-win', name: 'Crowd Killer', icon: '🎯', desc: 'Win a match with 4+ players.' },
  { id: 'pool-shark', name: 'Pool Shark', icon: '🎱', desc: 'Win 10 Pool matches.' },
  { id: 'kart-champ', name: 'Podium Regular', icon: '🏎️', desc: 'Win 10 Smash Karts matches.' },
  { id: 'grandmaster', name: 'Grandmaster', icon: '♞', desc: 'Win 10 Micro Chess matches.' },
  { id: 'wordsmith', name: 'Wordsmith', icon: '📚', desc: 'Win 10 word-game matches.' },
  { id: 'tactician', name: 'Tactician', icon: '🧠', desc: 'Win 10 board-game matches.' },
  { id: 'sharpshooter', name: 'Sharpshooter', icon: '💥', desc: 'Win 10 aim-game matches.' },
  { id: 'draw-artist', name: 'Peacekeeper', icon: '🤝', desc: 'Draw 5 matches.' },
  { id: 'night-owl', name: 'One More Game', icon: '🦉', desc: 'Play 25 matches of a single game.' },
  { id: 'dominator', name: 'Dominator', icon: '🥇', desc: 'Reach 20 wins in a single game.' },
];

export function achievementMeta(id) {
  return ACHIEVEMENT_META.find((a) => a.id === id) || { id, name: id, icon: '🏅', desc: '' };
}
