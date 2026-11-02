const LEADERBOARD_KEY = 'six_hitting_contest_leaderboard';

export interface LeaderboardEntry {
  date: string;
  opponent: string;
  biggestSix: number;
  wicketsLost: number;
  outcome: 'WON' | 'LOST' | 'TIED';
}

function normalizeEntry(value: unknown): LeaderboardEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const biggestSix = Number(entry.biggestSix);
  const wicketsLost = Number(entry.wicketsLost);
  const outcome = typeof entry.outcome === 'string' ? entry.outcome.toUpperCase() : 'TIED';
  return {
    date: typeof entry.date === 'string' ? entry.date : '',
    opponent: typeof entry.opponent === 'string' ? entry.opponent : 'Bot',
    biggestSix: Number.isFinite(biggestSix) ? Math.max(0, biggestSix) : 0,
    wicketsLost: Number.isFinite(wicketsLost) ? Math.max(0, Math.floor(wicketsLost)) : 0,
    outcome: outcome === 'WON' || outcome === 'LOST' ? outcome : 'TIED'
  };
}

export function readLeaderboard(): LeaderboardEntry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.map(normalizeEntry).filter((entry): entry is LeaderboardEntry => entry !== null)
      .sort((a, b) => b.biggestSix - a.biggestSix || a.wicketsLost - b.wicketsLost);
  } catch {
    return [];
  }
}

export function addLeaderboardEntry(entry: LeaderboardEntry): void {
  const entries = [...readLeaderboard(), entry]
    .sort((a, b) => b.biggestSix - a.biggestSix || a.wicketsLost - b.wicketsLost)
    .slice(0, 10);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch {
    // The match can still finish when browser storage is unavailable.
  }
}
