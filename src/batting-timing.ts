export interface BattingTimingFeedback {
  position: number;
  offsetMs: number;
  label: 'EARLY' | 'PERFECT' | 'LATE';
}

/** Use the same normalized 500 ms timing scale as shot adjudication. */
export function battingTimingFeedback(timing: number): BattingTimingFeedback {
  const position = Number.isFinite(timing) ? Math.max(0, Math.min(1, timing)) : 0.5;
  const offsetMs = Math.round((position - 0.5) * 500);
  return { position, offsetMs, label: Math.abs(offsetMs) <= 25 ? 'PERFECT' : offsetMs < 0 ? 'EARLY' : 'LATE' };
}
