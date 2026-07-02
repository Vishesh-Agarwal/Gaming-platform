// Progression domain: XP rules + level curve + the post-match orchestrator
// (XP → achievements → daily challenges → notify). The level curve and XP
// amounts live ONLY here; clients render server-computed values.
import { addXp, getXp, getRecentResults, getUserStats, getGamesPlayedOnDay } from './db.js';
import { evaluateAchievements } from './achievements.js';
import { applyMatchToChallenges, utcDay } from './challenges.js';

const BASE_PLAY = 20;
const WIN_BONUS = 40;
const DRAW_BONUS = 10;
const PER_EXTRA_OPPONENT = 5;
const STREAK_STEP = 10;
const STREAK_CAP = 5;

// Cost of going from level n to n+1.
function costForLevel(n) {
  return 100 + 50 * (n - 1);
}

export function levelForXp(xp = 0) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (remaining >= costForLevel(level)) {
    remaining -= costForLevel(level);
    level += 1;
  }
  return { level, intoLevel: remaining, neededForNext: costForLevel(level) };
}

// streak counts consecutive wins INCLUDING this match (so a first win is 1).
export function xpForMatch({ won = false, draw = false, playerCount = 2, streak = 0 } = {}) {
  const breakdown = [{ reason: 'played', amount: BASE_PLAY }];
  if (draw) breakdown.push({ reason: 'draw', amount: DRAW_BONUS });
  if (won) {
    breakdown.push({ reason: 'won', amount: WIN_BONUS });
    const extra = Math.max(0, playerCount - 2) * PER_EXTRA_OPPONENT;
    if (extra) breakdown.push({ reason: 'big-lobby', amount: extra });
    const streakBonus = STREAK_STEP * Math.min(Math.max(0, streak - 1), STREAK_CAP);
    if (streakBonus) breakdown.push({ reason: 'streak', amount: streakBonus });
  }
  return { breakdown, total: breakdown.reduce((s, b) => s + b.amount, 0) };
}

// ---- Post-match orchestration ----------------------------------------------

let notifier = null;
// fn(userId, summary) — called once per human player after a match processes.
export function setProgressionNotifier(fn) { notifier = fn; }

// Consecutive wins across games, newest first — includes the just-recorded match.
function winStreak(userId) {
  let n = 0;
  for (const r of getRecentResults(userId, null, 25)) {
    if (r === 'win') n += 1;
    else break;
  }
  return n;
}

// Called right after saveMatchResult. Mirrors its per-seat win semantics
// (result.winner is a seat index; draws have no winner) so XP always matches
// the recorded stats.
export function processMatch({ matchId, gameId, playerCount, players, result }) {
  const out = new Map();
  const day = utcDay();
  for (const p of players.filter((x) => !x.user.bot)) {
    const userId = p.user.id;
    const won = !result.draw && result.winner === p.index;
    const streak = won ? winStreak(userId) : 0;
    const { total, breakdown } = xpForMatch({ won, draw: !!result.draw, playerCount, streak });
    const before = getXp(userId);
    let xpTotal = addXp(userId, total, 'match', matchId);

    const stats = getUserStats(userId).stats;
    const earned = evaluateAchievements({ userId, gameId, won, draw: !!result.draw, playerCount, streak, stats });
    for (const a of earned) xpTotal = addXp(userId, a.xp, `achievement:${a.id}`, matchId);

    const playedToday = getGamesPlayedOnDay(userId, day);
    const chal = applyMatchToChallenges({
      userId, day, gameId, won, draw: !!result.draw, playedGameIdsToday: playedToday,
    });
    for (const ch of chal.completed) xpTotal = addXp(userId, ch.xp, `challenge:${ch.id}`, matchId);

    const level = levelForXp(xpTotal);
    const summary = {
      xpGained: xpTotal - before,
      breakdown,
      xp: xpTotal,
      level,
      leveledUp: level.level > levelForXp(before).level,
      achievements: earned.map(({ check, ...a }) => a),
      challenges: chal.updated.map((u) => ({ ...u.challenge, progress: u.progress, completed: u.completed })),
    };
    out.set(userId, summary);
    try { notifier?.(userId, summary); } catch { /* notifier must never break processing */ }
  }
  return out;
}
