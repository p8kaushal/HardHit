type CameraState = 'idle' | 'requesting' | 'active' | 'error';

/** Owns a local, opt-in preview and releases even late permission results. */
export class CameraPreview {
  private stream: MediaStream | null = null;
  private generation = 0;
  private state: CameraState = 'idle';

  constructor(private readonly video: HTMLVideoElement, private readonly render: (state: CameraState, message: string) => void) {
    this.show('idle', 'Camera is off.');
  }

  toggle(): void {
    if (this.state === 'requesting' || this.state === 'active') this.stop();
    else void this.start();
  }

  private show(state: CameraState, message: string): void {
    this.state = state;
    this.render(state, message);
  }

  private async start(): Promise<void> {
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.show('error', 'Camera access is unavailable. Use a supported browser on HTTPS or localhost.');
      return;
    }
    this.show('requesting', 'Waiting for camera permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        this.stop('Camera is unavailable. Check the device and try again.', true);
        return;
      }
      videoTrack.addEventListener('ended', () => {
        if (generation === this.generation) this.stop('Camera disconnected. Check the device and try again.', true);
      }, { once: true });
      this.video.srcObject = stream;
      this.video.hidden = false;
      this.show('active', 'Camera is on. Position yourself so your whole body is visible.');
      void this.video.play().catch(() => {
        if (generation === this.generation) this.stop('Camera preview could not start. Check browser permissions and try again.', true);
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = error instanceof Error ? error.name : '';
      const message = name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No suitable camera was found. Connect a camera and try again.'
          : name === 'NotReadableError' || name === 'AbortError'
            ? 'Camera is unavailable or in use. Close other camera apps and try again.'
            : 'Camera could not start. Check your device and browser permissions, then try again.';
      this.show('error', message);
    }
  }

  stop(message = 'Camera is off.', isError = false): void {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.video.hidden = true;
    this.show(isError ? 'error' : 'idle', message);
  }
}
