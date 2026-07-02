// Progression domain: XP rules + level curve. The level curve and XP amounts
// live ONLY here; clients render server-computed values and never re-derive.

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
