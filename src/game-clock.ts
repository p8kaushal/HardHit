// Gameplay time stops while play is obscured or a touch-primary device is in portrait.
let pausedAt: number | null = null;
let pausedDuration = 0;
let revision = 0;

export function shouldPauseGameplay(playing: boolean, portrait: boolean, hidden: boolean): boolean {
  return playing && (portrait || hidden);
}

export function gameNow(): number {
  return (pausedAt ?? performance.now()) - pausedDuration;
}

export function isGamePaused(): boolean {
  return pausedAt !== null;
}

/** Changes whenever a pause boundary invalidates mappings from wall time to game time. */
export function gameClockRevision(): number { return revision; }

export function setGamePaused(paused: boolean): void {
  if (paused && pausedAt === null) { pausedAt = performance.now(); revision++; }
  else if (!paused && pausedAt !== null) {
    pausedDuration += performance.now() - pausedAt;
    pausedAt = null;
    revision++;
  }
}

export function setGameTimeout(callback: () => void, delay: number): number {
  const due = gameNow() + delay;
  const tick = () => {
    const remaining = due - gameNow();
    if (remaining <= 0 && !isGamePaused()) callback();
    else timer = window.setTimeout(tick, Math.max(20, Math.min(remaining || 20, 100)));
  };
  let timer = window.setTimeout(tick, Math.min(delay, 100));
  // Return a stable handle whose cancellation also cancels the next tick.
  const handle = nextHandle++;
  timers.set(handle, () => clearTimeout(timer));
  const original = callback;
  callback = () => { timers.delete(handle); original(); };
  return handle;
}

let nextHandle = 1;
const timers = new Map<number, () => void>();
export function clearGameTimeout(handle: number): void {
  timers.get(handle)?.();
  timers.delete(handle);
}
