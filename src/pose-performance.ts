export type PoseResultDisposition = 'accepted' | 'delayed' | 'interrupted';
export type PosePerformanceSnapshot = { acceptedFps: number | null; roundTripMs: number | null; delayed: number; interrupted: number };

/** In-memory worker round trips, not camera exposure or end-to-end input latency. */
export class PosePerformance {
  private startedAt: number | null = null;
  private lastResultAt = -Infinity;
  private samples: { at: number; roundTrip: number }[] = [];
  private delayed = 0;
  private interrupted = 0;

  reset(startedAt?: number): void {
    this.startedAt = startedAt !== undefined && Number.isFinite(startedAt) ? startedAt : null;
    this.lastResultAt = -Infinity;
    this.samples = [];
    this.delayed = 0;
    this.interrupted = 0;
  }

  record(submittedAt: number, receivedAt: number, disposition: PoseResultDisposition): void {
    if (this.startedAt === null || !Number.isFinite(submittedAt) || !Number.isFinite(receivedAt)
      || submittedAt < this.startedAt || receivedAt < submittedAt || receivedAt < this.lastResultAt) return;
    this.lastResultAt = receivedAt;
    if (disposition === 'delayed') this.delayed++;
    else if (disposition === 'interrupted') this.interrupted++;
    else this.samples.push({ at: receivedAt, roundTrip: receivedAt - submittedAt });
    this.expire(receivedAt);
  }

  snapshot(now: number): PosePerformanceSnapshot {
    const elapsed = this.startedAt === null ? 0 : now - this.startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0) return { acceptedFps: null, roundTripMs: null, delayed: this.delayed, interrupted: this.interrupted };
    this.expire(now);
    return {
      acceptedFps: elapsed >= 1000 ? this.samples.length / (Math.min(elapsed, 5000) / 1000) : null,
      roundTripMs: this.samples.length ? this.samples.reduce((sum, sample) => sum + sample.roundTrip, 0) / this.samples.length : null,
      delayed: this.delayed, interrupted: this.interrupted
    };
  }

  private expire(now: number): void { this.samples = this.samples.filter(sample => sample.at > now - 5000); }
}
