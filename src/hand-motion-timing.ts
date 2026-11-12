import type { HandMotionEvent } from './hand-motion';

export type PracticeContactWindow = { generation: number; releaseGameTime: number; contactGameTime: number };

/** Compare frame-submission time with modeled contact; valid only within one uninterrupted clock revision. */
export function compareHandMotionTiming(event: Pick<HandMotionEvent, 'peakTimestamp'>, window: PracticeContactWindow | null, generation: number, nowPerformance: number, nowGame: number): number | null {
  if (!window || window.generation !== generation || ![event.peakTimestamp, nowPerformance, nowGame, window.releaseGameTime, window.contactGameTime].every(Number.isFinite)) return null;
  const frameAge = nowPerformance - event.peakTimestamp;
  if (frameAge < 0 || frameAge > 2000 || window.contactGameTime < window.releaseGameTime) return null;
  const peakGameTime = nowGame - frameAge;
  if (peakGameTime < window.releaseGameTime || peakGameTime > window.contactGameTime + 750) return null;
  return peakGameTime - window.contactGameTime;
}
