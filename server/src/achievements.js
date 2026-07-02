// Achievement catalog + evaluation. check(ctx) answers "does the user qualify
// right now"; evaluateAchievements persists newly earned ones and returns them.
// ctx = { userId, gameId, won, draw, playerCount, streak, stats } where stats
// is getUserStats(userId).stats taken AFTER the match was recorded.
import { getUnlockedAchievements, unlockAchievement } from './db.js';

const sum = (stats, key) => stats.reduce((s, r) => s + (r[key] || 0), 0);
const forGame = (stats, gameId) => stats.find((r) => r.gameId === gameId);
const winsIn = (stats, gameIds) => gameIds.reduce((s, g) => s + (forGame(stats, g)?.wins || 0), 0);

export const ACHIEVEMENTS = [
  { id: 'first-game', name: 'Welcome to the Arena', desc: 'Play your first match.', icon: '🎮', xp: 25, check: (c) => sum(c.stats, 'played') >= 1 },
  { id: 'first-win', name: 'First Blood', desc: 'Win your first match.', icon: '🏆', xp: 50, check: (c) => c.won },
  { id: 'games-10', name: 'Regular', desc: 'Play 10 matches.', icon: '🕹️', xp: 40, check: (c) => sum(c.stats, 'played') >= 10 },
  { id: 'games-50', name: 'Veteran', desc: 'Play 50 matches.', icon: '🎖️', xp: 80, check: (c) => sum(c.stats, 'played') >= 50 },
  { id: 'games-200', name: 'Marathon Runner', desc: 'Play 200 matches.', icon: '💾', xp: 150, check: (c) => sum(c.stats, 'played') >= 200 },
  { id: 'wins-10', name: 'Contender', desc: 'Win 10 matches.', icon: '⚔️', xp: 60, check: (c) => sum(c.stats, 'wins') >= 10 },
  { id: 'wins-50', name: 'Champion', desc: 'Win 50 matches.', icon: '👑', xp: 120, check: (c) => sum(c.stats, 'wins') >= 50 },
  { id: 'wins-150', name: 'Legend', desc: 'Win 150 matches.', icon: '🌟', xp: 200, check: (c) => sum(c.stats, 'wins') >= 150 },
  { id: 'streak-3', name: 'Heating Up', desc: 'Win 3 in a row.', icon: '🔥', xp: 50, check: (c) => c.streak >= 3 },
  { id: 'streak-5', name: 'On Fire', desc: 'Win 5 in a row.', icon: '☄️', xp: 90, check: (c) => c.streak >= 5 },
  { id: 'streak-10', name: 'Unstoppable', desc: 'Win 10 in a row.', icon: '⚡', xp: 180, check: (c) => c.streak >= 10 },
  { id: 'explorer-5', name: 'Tourist', desc: 'Play 5 different games.', icon: '🧭', xp: 40, check: (c) => c.stats.filter((r) => r.played > 0).length >= 5 },
  { id: 'explorer-10', name: 'Explorer', desc: 'Play 10 different games.', icon: '🗺️', xp: 80, check: (c) => c.stats.filter((r) => r.played > 0).length >= 10 },
  { id: 'explorer-all', name: 'Completionist', desc: 'Play every game on the platform.', icon: '💯', xp: 150, check: (c) => c.stats.filter((r) => r.played > 0).length >= 19 },
  { id: 'party-8', name: 'Full House', desc: 'Play a match with 8 players.', icon: '🎉', xp: 50, check: (c) => c.playerCount >= 8 },
  { id: 'party-win', name: 'Crowd Killer', desc: 'Win a match with 4+ players.', icon: '🎯', xp: 60, check: (c) => c.won && c.playerCount >= 4 },
  { id: 'pool-shark', name: 'Pool Shark', desc: 'Win 10 Pool matches.', icon: '🎱', xp: 70, check: (c) => winsIn(c.stats, ['pool']) >= 10 },
  { id: 'kart-champ', name: 'Podium Regular', desc: 'Win 10 Smash Karts matches.', icon: '🏎️', xp: 70, check: (c) => winsIn(c.stats, ['karts']) >= 10 },
  { id: 'grandmaster', name: 'Grandmaster', desc: 'Win 10 Micro Chess matches.', icon: '♞', xp: 70, check: (c) => winsIn(c.stats, ['microchess']) >= 10 },
  { id: 'wordsmith', name: 'Wordsmith', desc: 'Win 10 word-game matches (Boggle, Word Duel, Hangman, Skribble).', icon: '📚', xp: 70, check: (c) => winsIn(c.stats, ['boggle', 'wordduel', 'hangman', 'skribble']) >= 10 },
  { id: 'tactician', name: 'Tactician', desc: 'Win 10 board-game matches (Checkers, Reversi, Connect Four, Dots & Boxes).', icon: '🧠', xp: 70, check: (c) => winsIn(c.stats, ['checkers', 'reversi', 'connect4', 'dotsboxes']) >= 10 },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Win 10 aim-game matches (Tank Duel, Battleship).', icon: '💥', xp: 70, check: (c) => winsIn(c.stats, ['artillery', 'battleship']) >= 10 },
  { id: 'draw-artist', name: 'Peacekeeper', desc: 'Draw 5 matches.', icon: '🤝', xp: 40, check: (c) => sum(c.stats, 'draws') >= 5 },
  { id: 'night-owl', name: 'One More Game', desc: 'Play 25 matches of a single game.', icon: '🦉', xp: 60, check: (c) => c.stats.some((r) => r.played >= 25) },
  { id: 'dominator', name: 'Dominator', desc: 'Reach 20 wins in a single game.', icon: '🥇', xp: 100, check: (c) => c.stats.some((r) => r.wins >= 20) },
];

export function evaluateAchievements(ctx) {
  const have = new Set(getUnlockedAchievements(ctx.userId));
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch { ok = false; }
    if (ok && unlockAchievement(ctx.userId, a.id)) earned.push(a);
  }
  return earned;
}
