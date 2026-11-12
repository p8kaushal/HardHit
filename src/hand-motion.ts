import type { PoseLandmark } from './pose-retarget';

export type HandMotionState = 'waiting' | 'ready' | 'moving' | 'cooldown';
export type HandMotionEvent = { durationMs: number; peakSpeed: number; peakTimestamp: number; displacementX: number; displacementY: number; maxDisplacement: number };
export type HandMotionUpdate = { state: HandMotionState; event?: HandMotionEvent };

/** Direction in the displayed camera image, not a cricket-field shot direction. */
export function describeHandDirection(event: Pick<HandMotionEvent, 'displacementX' | 'displacementY'>, mirrored: boolean): string | null {
  const x = event.displacementX * (mirrored ? -1 : 1), y = -event.displacementY;
  if (![x, y].every(Number.isFinite) || Math.hypot(x, y) < .0001) return null;
  const directions = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
  const sector = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  return directions[sector];
}

/** Experimental two-wrist motion preview. Times are frame-submission timestamps, not bat contact times. */
export class HandMotionPreview {
  private state: HandMotionState = 'waiting';
  private last: { x: number; y: number; time: number } | null = null;
  private quietSince: number | null = null;
  private start: { x: number; y: number; time: number } | null = null;
  private peakSpeed = 0;
  private peakTimestamp = 0;
  private furthestX = 0;
  private furthestY = 0;
  private maxDisplacement = 0;
  private cooldownUntil = 0;

  reset(): void {
    this.state = 'waiting'; this.last = null; this.quietSince = null; this.start = null;
    this.peakSpeed = 0; this.peakTimestamp = 0; this.furthestX = 0; this.furthestY = 0; this.maxDisplacement = 0; this.cooldownUntil = 0;
  }

  update(points: PoseLandmark[], time: number, aspect: number): HandMotionUpdate {
    if (!Number.isFinite(time) || !Number.isFinite(aspect) || aspect <= 0) { this.reset(); return { state: this.state }; }
    const visible = (index: number): PoseLandmark | null => {
      const p = points[index];
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .6 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1 ? p : null;
    };
    const ls = visible(11), rs = visible(12), lw = visible(15), rw = visible(16), lh = visible(23), rh = visible(24);
    if (!ls || !rs || !lw || !rw || !lh || !rh) { this.reset(); return { state: this.state }; }
    const sx = (ls.x + rs.x) * .5 * aspect, sy = (ls.y + rs.y) * .5;
    const hipX = (lh.x + rh.x) * .5 * aspect, hipY = (lh.y + rh.y) * .5;
    const scale = Math.hypot(sx - hipX, sy - hipY);
    const separation = Math.hypot((lw.x - rw.x) * aspect, lw.y - rw.y);
    if (scale < .08 || separation / scale > 1.25) { this.reset(); return { state: this.state }; }
    const current = { x: ((lw.x + rw.x) * .5 * aspect - sx) / scale, y: ((lw.y + rw.y) * .5 - sy) / scale, time };
    if (!this.last || time - this.last.time > 350 || time < this.last.time) {
      this.reset(); this.last = current; this.quietSince = time; return { state: this.state };
    }
    if (time === this.last.time) return { state: this.state };
    const speed = Math.hypot(current.x - this.last.x, current.y - this.last.y) / ((time - this.last.time) / 1000);
    if (!Number.isFinite(speed) || speed > 12) { this.reset(); this.last = current; this.quietSince = time; return { state: this.state }; }
    const previous = this.last;
    this.last = current;
    if (this.state === 'cooldown') {
      if (time < this.cooldownUntil) return { state: this.state };
      this.state = 'waiting'; this.quietSince = speed < .7 ? time : null;
    }
    if (this.state === 'waiting') {
      if (speed >= .7) this.quietSince = null;
      else if (this.quietSince === null) this.quietSince = time;
      else if (time - this.quietSince >= 250) this.state = 'ready';
      return { state: this.state };
    }
    if (this.state === 'ready' && speed >= 1.8) {
      this.state = 'moving'; this.start = previous; this.peakSpeed = speed; this.peakTimestamp = time;
      this.furthestX = current.x - previous.x; this.furthestY = current.y - previous.y;
      this.maxDisplacement = Math.hypot(this.furthestX, this.furthestY);
      return { state: this.state };
    }
    if (this.state === 'ready') return { state: this.state };
    if (speed > this.peakSpeed) { this.peakSpeed = speed; this.peakTimestamp = time; }
    const start = this.start!;
    const duration = time - start.time;
    const dx = current.x - start.x, dy = current.y - start.y;
    const displacement = Math.hypot(dx, dy);
    if (displacement > this.maxDisplacement) { this.maxDisplacement = displacement; this.furthestX = dx; this.furthestY = dy; }
    if ((speed < .65 && duration >= 120) || duration >= 900) {
      const event = this.maxDisplacement >= .3 && this.peakSpeed >= 2.2 ? { durationMs: duration, peakSpeed: this.peakSpeed, peakTimestamp: this.peakTimestamp, displacementX: this.furthestX, displacementY: this.furthestY, maxDisplacement: this.maxDisplacement } : undefined;
      this.state = 'cooldown'; this.cooldownUntil = time + 600; this.start = null;
      return { state: this.state, event };
    }
    return { state: this.state };
  }
}
