import type { MatchEvent } from './types';

const KEY = 'six_hitting_contest_match_history';
const VERSION = 1;
export const MAX_MATCH_HISTORY = 20;

export interface MatchHistoryRecord {
  id: string;
  seed?: number;
  createdAt: number;
  outcome: 'WON' | 'LOST' | 'TIED';
  events: MatchEvent[];
}

interface MatchHistoryStore {
  version: 1;
  records: MatchHistoryRecord[];
}

function readStore(): MatchHistoryStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: VERSION, records: [] };
    const parsed = JSON.parse(raw) as MatchHistoryStore;
    if (parsed.version !== VERSION || !Array.isArray(parsed.records)) return { version: VERSION, records: [] };
    return { version: VERSION, records: parsed.records.filter(record => typeof record?.id === 'string' && Array.isArray(record.events)).slice(0, MAX_MATCH_HISTORY) };
  } catch {
    return { version: VERSION, records: [] };
  }
}

export function readMatchHistory(): MatchHistoryRecord[] {
  return readStore().records;
}

export function saveMatchRecord(record: MatchHistoryRecord): boolean {
  if (!record.id || !Number.isFinite(record.createdAt) || !Array.isArray(record.events)) return false;
  const store = readStore();
  if (store.records.some(existing => existing.id === record.id)) return true;
  const records = [record, ...store.records].slice(0, MAX_MATCH_HISTORY);
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, records } satisfies MatchHistoryStore));
    return true;
  } catch {
    return false;
  }
}
