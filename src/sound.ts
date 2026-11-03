type SoundEffect = 'delivery' | 'bounce' | 'bat' | 'wicket' | 'boundary';

/** Small synthesized effects keep the game playable without audio downloads. */
export class SoundManager {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  constructor(private readonly createContext: () => AudioContext | null = () => {
    const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Audio ? new Audio() : null;
  }) {
    try { this.muted = localStorage.getItem('hardhit_sound_muted') === '1'; } catch { /* Storage is optional. */ }
  }

  get isMuted(): boolean { return this.muted; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try { localStorage.setItem('hardhit_sound_muted', muted ? '1' : '0'); } catch { /* Storage is optional. */ }
    if (muted && this.context?.state === 'running') void this.context.suspend().catch(() => {});
    if (!muted) this.unlock();
  }

  /** Must be called from a user gesture on browsers that restrict autoplay. */
  unlock(): void {
    if (this.muted) return;
    try {
      this.context ??= this.createContext();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional; gameplay must remain available. */ }
  }

  play(effect: SoundEffect): void {
    const context = this.context;
    if (this.muted || !context || context.state !== 'running') return;
    try {
      const settings: Record<SoundEffect, { frequency: number; duration: number; gain: number; noise: number }> = {
        delivery: { frequency: 180, duration: 0.12, gain: 0.035, noise: 0.45 },
        bounce: { frequency: 145, duration: 0.075, gain: 0.12, noise: 0.2 },
        bat: { frequency: 780, duration: 0.105, gain: 0.2, noise: 0.55 },
        wicket: { frequency: 390, duration: 0.24, gain: 0.16, noise: 0.75 },
        boundary: { frequency: 480, duration: 0.48, gain: 0.06, noise: 0.8 }
      };
      const { frequency, duration, gain, noise } = settings[effect];
      const now = context.currentTime;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(gain, now);
      envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      envelope.connect(context.destination);
      const tone = context.createOscillator();
      tone.type = effect === 'bat' || effect === 'wicket' ? 'triangle' : 'sine';
      tone.frequency.setValueAtTime(frequency, now);
      tone.frequency.exponentialRampToValueAtTime(frequency * 0.55, now + duration);
      tone.connect(envelope);
      tone.start(now);
      tone.stop(now + duration);

      if (!this.noise) {
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      const source = context.createBufferSource();
      source.buffer = this.noise;
      const filter = context.createBiquadFilter();
      filter.type = effect === 'delivery' || effect === 'boundary' ? 'lowpass' : 'bandpass';
      filter.frequency.value = effect === 'bat' ? 1800 : effect === 'wicket' ? 1100 : 550;
      const noiseGain = context.createGain();
      noiseGain.gain.value = noise;
      source.connect(filter).connect(noiseGain).connect(envelope);
      source.start(now);
      source.stop(now + duration);
    } catch { /* An unsupported or interrupted audio device must not interrupt play. */ }
  }
}

export const gameSound = new SoundManager();
