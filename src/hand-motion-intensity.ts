export type IntensitySample = 'gentle' | 'strong';
export type IntensityCapture = 'gentle-saved' | 'strong-saved' | 'invalid' | 'too-close' | 'not-armed';

/** Session-only comparison of hand-motion peak speeds; this is not bat speed or shot power. */
export class HandMotionIntensity {
  private gentle: number | null = null;
  private strong: number | null = null;
  private pending: IntensitySample | null = null;

  reset(): void { this.gentle = null; this.strong = null; this.pending = null; }
  cancel(): void { this.pending = null; }
  getPending(): IntensitySample | null { return this.pending; }
  hasGentle(): boolean { return this.gentle !== null; }
  isReady(): boolean { return this.gentle !== null && this.strong !== null; }
  begin(sample: IntensitySample): boolean {
    if (sample === 'strong' && this.gentle === null) return false;
    this.pending = sample;
    return true;
  }
  capture(peakSpeed: number): IntensityCapture {
    if (!this.pending) return 'not-armed';
    const sample = this.pending;
    this.pending = null;
    if (!Number.isFinite(peakSpeed) || peakSpeed < 2.2 || peakSpeed > 12) return 'invalid';
    if (sample === 'gentle') {
      this.gentle = peakSpeed;
      this.strong = null;
      return 'gentle-saved';
    }
    if (this.gentle === null || peakSpeed < Math.max(this.gentle * 1.2, this.gentle + .5)) return 'too-close';
    this.strong = peakSpeed;
    return 'strong-saved';
  }
  relativeIntensity(peakSpeed: number): number | null {
    if (this.gentle === null || this.strong === null || !Number.isFinite(peakSpeed) || peakSpeed < 0) return null;
    return Math.max(0, Math.min(1, (peakSpeed - this.gentle) / (this.strong - this.gentle)));
  }
}
