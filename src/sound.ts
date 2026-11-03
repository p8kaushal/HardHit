type SoundEffect = 'delivery' | 'bounce' | 'bat' | 'wicket' | 'boundary';

/** Local cricket and stadium effects with a lightweight synthesized fallback. */
export class SoundManager {
  private context: AudioContext | null = null;
  private muted = false;
  private readonly clips = new Map<SoundEffect, HTMLAudioElement>();
  private readonly playing = new Set<HTMLAudioElement>();
  private readonly generated = new Map<SoundEffect, AudioBuffer>();

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
    if (muted) {
      this.playing.forEach(clip => clip.pause());
      this.playing.clear();
      if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
    } else this.unlock();
  }

  /** Must be called from a user gesture on browsers that restrict autoplay. */
  unlock(): void {
    if (this.muted) return;
    try {
      this.context ??= this.createContext();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
      if (typeof Audio !== 'undefined' && this.clips.size === 0) {
        const assets: Partial<Record<SoundEffect, string>> = {
          bat: 'bat-impact.wav', wicket: 'stumps.wav', boundary: 'crowd-cheer.wav'
        };
        for (const [effect, file] of Object.entries(assets)) {
          const clip = new Audio(new URL(`audio/${file}`, document.baseURI).href);
          clip.preload = 'auto';
          this.clips.set(effect as SoundEffect, clip);
        }
      }
    } catch { /* Audio is optional; gameplay must remain available. */ }
  }

  play(effect: SoundEffect): void {
    const context = this.context;
    if (this.muted || !context || context.state !== 'running') return;
    try {
      const clip = this.clips.get(effect);
      if (clip) {
        const playback = clip.cloneNode(true) as HTMLAudioElement;
        playback.volume = effect === 'boundary' ? 0.32 : effect === 'wicket' ? 0.45 : 0.7;
        this.playing.add(playback);
        playback.addEventListener('ended', () => this.playing.delete(playback), { once: true });
        void playback.play().catch(() => this.playing.delete(playback));
        return;
      }
      // Short, damped impacts and a soft air swish for delivery/bounce. No musical tones.
      let buffer = this.generated.get(effect);
      if (!buffer) {
        const duration = effect === 'delivery' ? 0.14 : effect === 'boundary' ? 0.5 : 0.1;
        buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
        const samples = buffer.getChannelData(0);
        let seed = 0x83ab21;
        let smooth = 0;
        for (let i = 0; i < samples.length; i++) {
          seed = (1664525 * seed + 1013904223) >>> 0;
          const noise = seed / 0x80000000 - 1;
          smooth += (noise - smooth) * (effect === 'bounce' ? 0.08 : 0.25);
          const t = i / context.sampleRate;
          const envelope = effect === 'delivery' ? Math.sin(Math.PI * i / samples.length) ** 2 : Math.exp(-t * 45);
          samples[i] = smooth * envelope;
        }
        this.generated.set(effect, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = effect === 'delivery' ? 0.16 : 0.38;
      source.connect(gain).connect(context.destination);
      source.start();
    } catch { /* An unsupported or interrupted audio device must not interrupt play. */ }
  }
}

export const gameSound = new SoundManager();
