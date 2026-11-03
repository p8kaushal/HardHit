// Gameplay time stops while the device is in portrait orientation.
let pausedAt: number | null = null;
let pausedDuration = 0;

export function gameNow(): number {
  return (pausedAt ?? performance.now()) - pausedDuration;
}

export function isGamePaused(): boolean {
  return pausedAt !== null;
}

export function setGamePaused(paused: boolean): void {
  if (paused && pausedAt === null) pausedAt = performance.now();
  else if (!paused && pausedAt !== null) {
    pausedDuration += performance.now() - pausedAt;
    pausedAt = null;
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
