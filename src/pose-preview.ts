import type { PoseLandmark as Landmark } from './pose-retarget';
import { gameClockRevision, isGamePaused } from './game-clock';
import { PosePerformance, type PosePerformanceSnapshot } from './pose-performance';
type PoseState = 'idle' | 'loading' | 'tracking' | 'error';
type WorkerMessage = { type: 'ready' } | { type: 'error'; detail: string } | { type: 'result'; landmarks: Landmark[]; worldLandmarks: Landmark[]; timestamp: number; poseCount?: number };

const CONNECTIONS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const REQUIRED = [0, 11, 12, 15, 16, 23, 24, 27, 28];

/** Preview-only tracking; frames are processed in one worker with no queue. */
export class PosePreview {
  private worker: Worker | null = null;
  private generation = 0;
  private frameRequest: number | null = null;
  private busy = false;
  private lastFrameAt = 0;
  private lastVideoTime = -1;
  private state: PoseState = 'idle';
  private lastMessage = '';
  private frameRevision = 0;
  private readonly performanceStats = new PosePerformance();
  private lastStatsAt = -Infinity;

  constructor(private readonly video: HTMLVideoElement, private readonly canvas: HTMLCanvasElement, private readonly render: (state: PoseState, message: string) => void, private readonly onLandmarks: (landmarks: Landmark[], worldLandmarks: Landmark[], timestamp: number, multiplePeople?: boolean, frameSubmittedAt?: number) => void = () => {}, private readonly onPerformance: (snapshot: PosePerformanceSnapshot | null) => void = () => {}) {
    this.show('idle', 'Pose tracking is off.');
  }

  toggle(): void {
    if (this.state === 'loading' || this.state === 'tracking') this.stop();
    else this.start();
  }

  private show(state: PoseState, message: string): void {
    if (this.state === state && this.lastMessage === message) return;
    this.state = state;
    this.lastMessage = message;
    this.render(state, message);
  }

  private start(): void {
    if (!this.video.srcObject || typeof createImageBitmap !== 'function' || typeof Worker === 'undefined') {
      this.show('error', 'Pose tracking is unavailable in this browser.');
      return;
    }
    const generation = ++this.generation;
    this.show('loading', 'Loading pose tracker…');
    try {
      const worker = new Worker(new URL('./pose-worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onerror = event => {
        if (generation !== this.generation) return;
        console.error('Pose tracker worker failed to load:', event.message || 'No browser error details available');
        this.stop('Pose tracker could not start. Try refreshing the page; camera preview is still available.', true);
      };
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (generation !== this.generation) return;
        if (event.data.type === 'error') {
          console.error('Pose tracking failed:', event.data.detail);
          this.stop('Pose tracking failed. Camera preview is still available.', true);
          return;
        }
        if (event.data.type === 'ready') {
          this.performanceStats.reset(performance.now());
          this.lastStatsAt = -Infinity;
          this.show('tracking', 'Looking for a person…');
          this.canvas.hidden = false;
          this.frameRequest = requestAnimationFrame(now => this.tick(now, generation));
          return;
        }
        this.busy = false;
        const receivedAt = performance.now();
        if (this.frameRevision !== gameClockRevision() || isGamePaused()) {
          this.performanceStats.record(this.lastFrameAt, receivedAt, 'interrupted');
          this.reportPerformance(receivedAt, true);
          this.onLandmarks([], [], NaN);
          this.draw([]);
          this.show('tracking', 'Pose tracking was interrupted. Waiting for a fresh frame.');
          return;
        }
        if (receivedAt - this.lastFrameAt > 500) {
          this.performanceStats.record(this.lastFrameAt, receivedAt, 'delayed');
          this.reportPerformance(receivedAt, true);
          this.onLandmarks([], [], NaN);
          this.draw([]);
          this.show('tracking', 'Pose tracking is delayed. Improve lighting or close other apps.');
          return;
        }
        this.performanceStats.record(this.lastFrameAt, receivedAt, 'accepted');
        this.reportPerformance(receivedAt);
        if ((event.data.poseCount ?? 0) > 1) {
          this.onLandmarks([], [], NaN, true);
          this.draw([]);
          this.show('tracking', 'Multiple people may be in view. If you are alone, adjust the camera or background, then calibrate again.');
          return;
        }
        this.onLandmarks(event.data.landmarks, event.data.worldLandmarks ?? [], event.data.timestamp, false, this.lastFrameAt);
        this.draw(event.data.landmarks);
      };
      worker.postMessage({ type: 'init', modelUrl: new URL('models/pose/pose_landmarker_lite.task', document.baseURI).href });
    } catch (error) {
      console.error('Pose tracker worker could not be created:', error);
      this.stop('Pose tracker could not start. Camera preview is still available.', true);
    }
  }

  private tick(now: number, generation: number): void {
    if (generation !== this.generation || !this.worker) return;
    this.frameRequest = requestAnimationFrame(next => this.tick(next, generation));
    this.reportPerformance(now);
    if (this.busy || isGamePaused() || now - this.lastFrameAt < 1000 / 15 || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.busy = true;
    const frameRevision = this.frameRevision = gameClockRevision();
    this.lastFrameAt = now;
    this.lastVideoTime = this.video.currentTime;
    void createImageBitmap(this.video).then(bitmap => {
      if (generation !== this.generation || !this.worker || frameRevision !== gameClockRevision() || isGamePaused()) { bitmap.close(); if (generation === this.generation) this.busy = false; return; }
      this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
    }).catch(() => { if (generation === this.generation) this.stop('Camera frames could not be read. Try restarting pose tracking.', true); });
  }

  private reportPerformance(now: number, force = false): void {
    if (!force && now - this.lastStatsAt < 1000) return;
    this.lastStatsAt = now;
    this.onPerformance(this.performanceStats.snapshot(now));
  }

  private draw(landmarks: Landmark[]): void {
    const context = this.canvas.getContext('2d');
    if (!context) { this.stop('Pose overlay is unavailable in this browser.', true); return; }
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!landmarks.length) { this.show('tracking', 'No person detected. Stand where your whole body is visible.'); return; }
    const visible = (point: Landmark | undefined): point is Landmark => !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 0) >= 0.5;
    context.strokeStyle = '#f4d77c';
    context.fillStyle = '#9ef2c4';
    context.lineWidth = Math.max(2, this.canvas.width / 200);
    for (const [a, b] of CONNECTIONS) {
      if (!visible(landmarks[a]) || !visible(landmarks[b])) continue;
      context.beginPath();
      context.moveTo(landmarks[a].x * this.canvas.width, landmarks[a].y * this.canvas.height);
      context.lineTo(landmarks[b].x * this.canvas.width, landmarks[b].y * this.canvas.height);
      context.stroke();
    }
    for (const point of landmarks) {
      if (!visible(point)) continue;
      context.beginPath();
      context.arc(point.x * this.canvas.width, point.y * this.canvas.height, Math.max(2, this.canvas.width / 100), 0, Math.PI * 2);
      context.fill();
    }
    const framed = REQUIRED.every(index => visible(landmarks[index]) && landmarks[index].x > 0.02 && landmarks[index].x < 0.98 && landmarks[index].y > 0.02 && landmarks[index].y < 0.98);
    this.show('tracking', framed ? 'Body landmarks visible.' : 'Move back or adjust the camera so your head, hands and feet are visible.');
  }

  stop(message = 'Pose tracking is off.', isError = false): void {
    this.generation++;
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
    this.lastFrameAt = 0;
    this.lastVideoTime = -1;
    this.performanceStats.reset();
    this.lastStatsAt = -Infinity;
    this.onPerformance(null);
    this.canvas.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.hidden = true;
    this.onLandmarks([], [], NaN);
    this.show(isError ? 'error' : 'idle', message);
  }
}
