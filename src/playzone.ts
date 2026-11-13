import { createBotPlayer, getOrCreatePlayer, globalAutoAssistConfig, initBattingDelivery } from './game';
import { GameScene } from './scene';
import { clearGameTimeout, gameClockRevision, gameNow, isGamePaused, setGameTimeout } from './game-clock';
import { batterContactProgress, battingContactZone, deliveryDurationMs, calculateShotTrajectory, deliveryVelocityAtCrease, deliveryPitchPoint, shotFlightQuality, battingAssistanceMultiplier, getDirectionName, bowlingReleaseTiming, bowlingExecutionTarget, bowlingTargetFromScreen, sampleFrontFootLanding, getAimXFromLineType, getLineTypeFromAimX } from './formula';
import { resolveBattingDelivery, resolveShotFlight } from './batting-resolution';
import { botChooseDelivery, botChooseShot } from './bot';
import { isSpinDelivery } from './bowling-controls';
import { battingTimingFeedback } from './batting-timing';
import { moveBatter, type BatterPosition } from './batter-position';
import { TouchBattingControls } from './touch-controls';
import { CameraPreview } from './camera-preview';
import { PosePreview } from './pose-preview';
import { PoseRetarget, type PoseLandmark } from './pose-retarget';
import { describeHandDirection, HandMotionPreview } from './hand-motion';
import { compareHandMotionTiming, type PracticeContactWindow } from './hand-motion-timing';
import { HandMotionIntensity, type IntensitySample } from './hand-motion-intensity';
import type { BallOutcome, DeliveryChoice, DeliveryType, LengthType, LineType, Player, ShotChoice, ShotType } from './types';

const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** A transient practice session. It never creates or records a match. */
export class Playzone {
  private active = false;
  private generation = 0;
  private timer: number | null = null;
  private phase: 'ready' | 'runup' | 'flight' | 'result' = 'ready';
  private cancelRunUp: (() => void) | null = null;
  private footwork: 'front_foot' | 'back_foot' = 'front_foot';
  private readonly heldKeys = new Set<string>();
  private delivery: DeliveryChoice | null = null;
  private shot: ShotChoice | null = null;
  private position: BatterPosition = { x: 0, z: 0 };
  private runs = 0;
  private wickets = 0;
  private balls = 0;
  private nextFreeHit = false;
  private readonly batter = structuredClone(getOrCreatePlayer());
  private bowler: Player = createBotPlayer('Medium');
  private botBatter: Player = createBotPlayer('Medium');
  private difficulty: 'Rookie' | 'Medium' | 'Hard' = 'Medium';
  private readonly touchControls: TouchBattingControls;
  private readonly cameraPreview: CameraPreview;
  private readonly posePreview: PosePreview;
  private readonly poseRetarget = new PoseRetarget();
  private readonly handMotion = new HandMotionPreview();
  private readonly handMotionIntensity = new HandMotionIntensity();
  private intensityNotice: string | null = null;
  private poseTrackingActive = false;
  private motionWatchdog: number | null = null;
  private motionRevision = gameClockRevision();
  private motionContact: PracticeContactWindow | null = null;
  private poseLandmarks: PoseLandmark[] = [];
  private poseWorldLandmarks: PoseLandmark[] = [];
  private poseCalibrated = false;
  private calibratedVideoSize: { width: number; height: number } | null = null;
  private poseAnimationUntil = 0;
  private poseWatchdog: number | null = null;
  private calibrationTimer: number | null = null;
  private poseLandmarksAt = -Infinity;
  private poseLandmarksRevision = -1;
  private poseLandmarksVideoSize: { width: number; height: number } | null = null;
  private previousBotTrigger: (() => void) | null = null;
  private bowlingPointerId: number | null = null;
  private bowlingKey: string | null = null;
  private frontFootHeel = -0.08;
  private lastOutcome: string | null = null;
  private bowlingTarget = { x: 0, z: -3.5 };
  private aimPointer: { id: number; surface: 'map' | 'pitch' } | null = null;

  constructor(private readonly scene: GameScene) {
    this.posePreview = new PosePreview(get<HTMLVideoElement>('playzone-camera-preview'), document.getElementById('playzone-pose-overlay') as unknown as HTMLCanvasElement, (state, message) => {
      get<HTMLElement>('playzone-pose-status').textContent = message;
      get<HTMLButtonElement>('playzone-pose-toggle').textContent = state === 'loading' ? 'Cancel pose tracking' : state === 'tracking' ? 'Stop pose tracking' : 'Start pose tracking';
      this.scene.setTrackingBatVisible(state !== 'tracking');
      if (state !== 'tracking' && this.calibrationTimer !== null) this.resetPoseMovement('Delayed calibration cancelled. Start pose tracking and try again.');
      if (state !== 'tracking' && this.poseTrackingActive) { this.handMotionIntensity.reset(); this.intensityNotice = null; }
      this.poseTrackingActive = state === 'tracking';
      this.renderIntensityControls();
    }, (landmarks, world, timestamp, multiplePeople, frameSubmittedAt) => {
      if (multiplePeople) this.resetPoseMovement('Multiple people may be in view. If you are alone, adjust the camera or background, then calibrate again.');
      this.updateHandMotion(landmarks, timestamp);
      this.updatePoseMovement(landmarks, world, frameSubmittedAt);
    }, stats => {
      const output = get<HTMLElement>('playzone-pose-performance');
      output.hidden = stats === null;
      output.textContent = stats === null ? '' : `Tracking: ${stats.acceptedFps === null ? 'measuring' : `${stats.acceptedFps.toFixed(1)} results/s`} · worker round trip ${stats.roundTripMs === null ? '—' : `${Math.round(stats.roundTripMs)} ms`} · rejected: ${stats.delayed} delayed, ${stats.interrupted} interrupted.`;
    });
    this.cameraPreview = new CameraPreview(get<HTMLVideoElement>('playzone-camera-preview'), (state, message) => {
      get<HTMLElement>('playzone-camera-status').textContent = message;
      get<HTMLButtonElement>('playzone-camera-toggle').textContent = state === 'requesting' ? 'Cancel camera request' : state === 'active' ? 'Stop camera' : 'Start camera';
      get<HTMLButtonElement>('playzone-pose-toggle').disabled = state !== 'active';
      if (state !== 'active') this.posePreview.stop();
    });
    get<HTMLButtonElement>('playzone-camera-toggle').addEventListener('click', () => {
      if (this.active && this.mode !== 'bowling' && !document.hidden) this.cameraPreview.toggle();
    });
    get<HTMLButtonElement>('playzone-pose-toggle').addEventListener('click', () => {
      if (this.active && this.mode !== 'bowling' && !document.hidden) this.posePreview.toggle();
    });
    get<HTMLButtonElement>('playzone-camera-size').addEventListener('click', event => {
      const button = event.currentTarget as HTMLButtonElement;
      const enlarged = get<HTMLElement>('playzone-camera-frame').classList.toggle('camera-enlarged');
      button.setAttribute('aria-pressed', String(enlarged));
      button.textContent = enlarged ? 'Reduce preview' : 'Enlarge preview';
    });
    const previewFrame = get<HTMLElement>('playzone-camera-widget');
    new ResizeObserver(() => {
      get<HTMLElement>('screen-playzone').style.setProperty('--camera-preview-height', `${previewFrame.offsetHeight}px`);
    }).observe(previewFrame);
    get<HTMLInputElement>('playzone-pose-mirror').addEventListener('change', () => this.resetPoseMovement('Mirror setting changed. Calibrate again.'));
    get<HTMLInputElement>('playzone-pose-xray').addEventListener('change', event => this.scene.setBatterXrayVisible((event.currentTarget as HTMLInputElement).checked));
    get<HTMLInputElement>('playzone-motion-preview').addEventListener('change', () => {
      if (!get<HTMLInputElement>('playzone-motion-preview').checked) { this.handMotionIntensity.reset(); this.intensityNotice = null; }
      this.resetHandMotion();
      this.renderIntensityControls();
    });
    for (const sample of ['gentle', 'strong'] as const) {
      get<HTMLButtonElement>(`playzone-intensity-${sample}`).addEventListener('click', () => this.startIntensitySample(sample));
    }
    get<HTMLButtonElement>('playzone-pose-calibrate').addEventListener('click', () => this.calibratePose());
    get<HTMLButtonElement>('playzone-pose-calibrate-delay').addEventListener('click', () => this.startDelayedCalibration());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cameraPreview.stop('Camera stopped while the page was hidden.'); });
    window.addEventListener('pagehide', () => this.cameraPreview.stop());
    this.touchControls = new TouchBattingControls(get<HTMLElement>('practice-stick'), document.querySelectorAll<HTMLButtonElement>('[data-practice-shot]'), (direction, type) => {
      if (!this.active || this.mode === 'bowling' || this.shot) return;
      get<HTMLSelectElement>('playzone-direction').value = String(direction);
      this.setShotType(type);
      this.swing();
    }, direction => {
      get<HTMLSelectElement>('playzone-direction').value = String(direction);
      this.previewSelection();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-practice-shot]').forEach(button => { button.dataset.shot = button.dataset.practiceShot; });
    get<HTMLButtonElement>('playzone-bowl').addEventListener('click', () => this.bowl());
    get<HTMLButtonElement>('playzone-swing').addEventListener('click', () => this.swing());
    get<HTMLSelectElement>('playzone-mode').addEventListener('change', () => this.changeMode());
    get<HTMLSelectElement>('playzone-bowler-mode').addEventListener('change', () => this.changeMode());
    get<HTMLSelectElement>('playzone-type').addEventListener('change', () => this.updateSpinControl());
    get<HTMLInputElement>('playzone-spin').addEventListener('input', () => this.updateSpinControl());
    get<HTMLInputElement>('playzone-swing-amount').addEventListener('input', () => this.updateSpinControl());
    get<HTMLInputElement>('playzone-show-outcome').addEventListener('change', () => {
      if (this.active && this.lastOutcome !== null) this.renderOutcome();
    });
    const pitchMap = get<HTMLElement>('playzone-pitch-map');
    const canvas = get<HTMLElement>('game-canvas');
    const updateAim = (event: PointerEvent, surface: 'map' | 'pitch') => {
      if (!this.active || this.mode !== 'bowling' || this.phase !== 'ready') return;
      const element = surface === 'map' ? pitchMap : canvas;
      const rect = element.getBoundingClientRect();
      const fallback = bowlingTargetFromScreen((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      this.setBowlingTarget(surface === 'pitch' ? this.scene.pickBowlingTarget(event.clientX, event.clientY) ?? fallback : fallback);
    };
    for (const [element, surface] of [[pitchMap, 'map'], [canvas, 'pitch']] as const) {
      element.addEventListener('pointerdown', event => {
        if (!this.active || this.mode !== 'bowling' || this.phase !== 'ready' || this.aimPointer || event.button !== 0) return;
        event.preventDefault();
        this.aimPointer = { id: event.pointerId, surface };
        element.setPointerCapture(event.pointerId);
        updateAim(event, surface);
      });
      element.addEventListener('pointermove', event => {
        if (this.aimPointer?.id === event.pointerId && this.aimPointer.surface === surface) updateAim(event, surface);
      });
      const endAim = (event: PointerEvent) => { if (this.aimPointer?.id === event.pointerId && this.aimPointer.surface === surface) this.aimPointer = null; };
      element.addEventListener('pointerup', endAim);
      element.addEventListener('pointercancel', endAim);
      element.addEventListener('lostpointercapture', endAim);
    }
    get<HTMLSelectElement>('playzone-line').addEventListener('change', () => {
      if (this.active && this.mode === 'bowling' && this.phase === 'ready') this.setBowlingTarget({ ...this.bowlingTarget, x: getAimXFromLineType(get<HTMLSelectElement>('playzone-line').value as LineType, this.selectedBatterHand()) });
    });
    get<HTMLSelectElement>('playzone-length').addEventListener('change', () => {
      const lengths: Record<LengthType, number> = { yorker: -7.5, full: -5.5, good: -3.5, short: -1.5, bouncer: 0.5 };
      if (this.active && this.mode === 'bowling' && this.phase === 'ready') this.setBowlingTarget({ ...this.bowlingTarget, z: lengths[get<HTMLSelectElement>('playzone-length').value as LengthType] });
    });
    get<HTMLSelectElement>('playzone-batter-hand').addEventListener('change', () => {
      if (this.active && this.mode === 'bowling' && this.phase === 'ready') {
        this.scene.setBatterHandedness(this.selectedBatterHand());
        this.setBowlingTarget({ ...this.bowlingTarget, x: getAimXFromLineType(get<HTMLSelectElement>('playzone-line').value as LineType, this.selectedBatterHand()) });
      }
    });
    const bowlingButton = get<HTMLButtonElement>('playzone-bowl-action');
    bowlingButton.addEventListener('pointerdown', event => {
      if (this.bowlingPointerId !== null || event.button !== 0) return;
      event.preventDefault();
      if (this.startBowling()) {
        this.bowlingPointerId = event.pointerId;
        bowlingButton.setPointerCapture(event.pointerId);
      }
    });
    bowlingButton.addEventListener('pointerup', event => {
      if (event.pointerId !== this.bowlingPointerId) return;
      event.preventDefault();
      this.bowlingPointerId = null;
      this.releaseBowling();
    });
    bowlingButton.addEventListener('pointercancel', event => {
      if (event.pointerId === this.bowlingPointerId) this.interrupt();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-practice-footwork]').forEach(button => button.addEventListener('click', () => { this.setFootwork(button.dataset.practiceFootwork === 'back_foot' ? 'back_foot' : 'front_foot'); this.previewSelection(); }));
    get<HTMLSelectElement>('playzone-shot').addEventListener('change', () => {
      this.setShotType(get<HTMLSelectElement>('playzone-shot').value as ShotType);
      this.previewSelection();
    });
    get<HTMLSelectElement>('playzone-direction').addEventListener('change', () => {
      this.touchControls.setDirection(Number(get<HTMLSelectElement>('playzone-direction').value));
      this.previewSelection();
    });
    get<HTMLInputElement>('playzone-repeat').addEventListener('change', () => {
      if (!get<HTMLInputElement>('playzone-repeat').checked) this.clearTimer();
      else if (this.active && this.phase === 'ready' && this.mode === 'delivery') this.scheduleNext();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-practice-move]').forEach(button => button.addEventListener('click', () => this.move(button.dataset.practiceMove ?? '')));
    window.addEventListener('keydown', event => {
      if (!this.active || event.repeat || isGamePaused()) return;
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable || target.id === 'playzone-swing')) return;
      if (this.mode === 'bowling' && (event.code === 'Space' || (event.code === 'Enter' && target?.id === 'playzone-bowl-action'))) {
        event.preventDefault();
        if (this.startBowling()) this.bowlingKey = event.code;
        return;
      }
      if (event.code === 'Space') { event.preventDefault(); this.swing(); return; }
      const key = event.key.toLowerCase();
      this.heldKeys.add(key);
      if (key === 'q' || key === 'e') { this.setFootwork(key === 'q' ? 'front_foot' : 'back_foot'); this.previewSelection(); }
      if (!globalAutoAssistConfig.isDeliveryActive) {
        const shots: Record<string, ShotType> = { '1': 'lofted', '2': 'power', '3': 'grounded', '4': 'defensive' };
        if (shots[key]) { this.setShotType(shots[key]); this.previewSelection(); }
        const up = this.heldKeys.has('w') || this.heldKeys.has('arrowup');
        const down = this.heldKeys.has('s') || this.heldKeys.has('arrowdown');
        const left = this.heldKeys.has('a') || this.heldKeys.has('arrowleft');
        const right = this.heldKeys.has('d') || this.heldKeys.has('arrowright');
        if (up || down || left || right) {
          const direction = up ? (right ? 1 : left ? 7 : 0) : down ? (right ? 3 : left ? 5 : 4) : right ? 2 : 6;
          get<HTMLSelectElement>('playzone-direction').value = String(direction);
          this.touchControls.setDirection(direction);
          this.previewSelection();
          event.preventDefault();
        }
      }
      const direction: Record<string, string> = { i: 'forward', j: 'left', k: 'back', l: 'right' };
      if (direction[event.key.toLowerCase()]) { event.preventDefault(); this.move(direction[event.key.toLowerCase()]); }
    });
    window.addEventListener('keyup', event => {
      this.heldKeys.delete(event.key.toLowerCase());
      if (this.active && this.mode === 'bowling' && event.code === this.bowlingKey) {
        this.bowlingKey = null;
        this.releaseBowling();
      }
    });
    window.addEventListener('blur', () => { this.heldKeys.clear(); this.interrupt(); });
  }

  private get mode(): string { return get<HTMLSelectElement>('playzone-mode').value; }
  private get simulated(): boolean { return get<HTMLSelectElement>('playzone-bowler-mode').value === 'simulated'; }
  private get shouldRepeat(): boolean { return this.simulated || get<HTMLInputElement>('playzone-repeat').checked; }
  private selectedBatterHand(): 'RHB' | 'LHB' { return get<HTMLSelectElement>('playzone-batter-hand').value === 'LHB' ? 'LHB' : 'RHB'; }
  private feedback(text: string): void { get<HTMLElement>('playzone-feedback').textContent = text; }
  private renderOutcome(): void {
    this.feedback(get<HTMLInputElement>('playzone-show-outcome').checked ? this.lastOutcome! : 'Delivery complete.');
  }
  private showOutcome(text: string): void { this.lastOutcome = text; this.renderOutcome(); }
  private updatePhase(): void {
    const labels = { ready: '● READY', runup: '● RUN-UP', flight: '● BALL LIVE', result: '● RESULT' };
    get<HTMLElement>('playzone-phase').textContent = labels[this.phase];
    get<HTMLButtonElement>('playzone-bowl-action').disabled = this.phase === 'flight' || this.phase === 'result';
    for (const id of ['playzone-line', 'playzone-length', 'playzone-batter-hand']) get<HTMLSelectElement>(id).disabled = this.mode === 'bowling' && this.phase !== 'ready';
  }
  private setBowlingTarget(target: { x: number; z: number }): void {
    this.bowlingTarget = target;
    get<HTMLSelectElement>('playzone-line').value = getLineTypeFromAimX(target.x, this.selectedBatterHand());
    get<HTMLSelectElement>('playzone-length').value = target.z < -6.5 ? 'yorker' : target.z < -4.5 ? 'full' : target.z < -2.5 ? 'good' : target.z < -0.5 ? 'short' : 'bouncer';
    const marker = get<HTMLElement>('playzone-map-marker');
    marker.style.left = `${Math.max(0, Math.min(100, (0.5 - target.x / 3) * 100))}%`;
    marker.style.top = `${Math.max(0, Math.min(100, (target.z + 8.2) / 8.7 * 100))}%`;
    this.scene.updateBounceMarker(target);
  }
  private clearTimer(): void { if (this.timer !== null) clearGameTimeout(this.timer); this.timer = null; }

  private updateSpinControl(): void {
    const spin = isSpinDelivery(get<HTMLSelectElement>('playzone-type').value as DeliveryType);
    get<HTMLElement>('playzone-spin-control').hidden = !spin;
    const input = get<HTMLInputElement>('playzone-spin');
    get<HTMLOutputElement>('playzone-spin-value').textContent = `${input.value}%`;
    input.setAttribute('aria-valuetext', `${input.value} percent`);
    get<HTMLElement>('playzone-swing-control').hidden = this.mode !== 'bowling' || spin;
    const swing = get<HTMLInputElement>('playzone-swing-amount');
    const amount = swing.valueAsNumber;
    const label = amount === 0 ? 'Straight' : `${amount < 0 ? 'Left' : 'Right'} ${Math.abs(amount)}%`;
    get<HTMLOutputElement>('playzone-swing-value').textContent = label;
    swing.setAttribute('aria-valuetext', label);
  }

  start(): void {
    this.active = true;
    this.previousBotTrigger = this.scene.botBattingTriggerCallback;
    this.position = { x: 0, z: 0 };
    this.runs = 0;
    this.wickets = 0;
    this.balls = 0;
    this.nextFreeHit = false;
    this.updateScore();
    get<HTMLSelectElement>('playzone-mode').value = 'free';
    get<HTMLSelectElement>('playzone-bowler-mode').value = 'manual';
    get<HTMLInputElement>('playzone-repeat').checked = false;
    this.setShotType(get<HTMLSelectElement>('playzone-shot').value as ShotType);
    this.setFootwork('front_foot');
    this.scene.isBotBatting = false;
    this.scene.setBatterHandedness(this.batter.batterHand ?? 'RHB');
    this.touchControls.setDirection(Number(get<HTMLSelectElement>('playzone-direction').value));
    this.scene.setPlayerCreaseOffset(-0.35, 0);
    this.changeMode();
  }

  stop(): void {
    this.cameraPreview.stop();
    this.motionContact = null;
    this.handMotionIntensity.reset();
    this.intensityNotice = null;
    get<HTMLInputElement>('playzone-motion-preview').checked = false;
    this.resetHandMotion();
    this.renderIntensityControls();
    get<HTMLInputElement>('playzone-pose-xray').checked = false;
    this.scene.setBatterXrayVisible(false);
    this.active = false;
    this.generation++;
    this.clearTimer();
    this.cancelRunUp?.();
    this.cancelRunUp = null;
    this.heldKeys.clear();
    this.scene.cancelPracticeDelivery();
    this.scene.botBattingTriggerCallback = this.previousBotTrigger;
    this.scene.isBotBatting = false;
    this.bowlingPointerId = null;
    this.bowlingKey = null;
    this.aimPointer = null;
    this.touchControls.cancelPointer();
    this.touchControls.setLocked(false);
    this.delivery = null;
    this.shot = null;
    this.phase = 'ready';
    this.nextFreeHit = false;
    this.updatePhase();
  }

  private changeMode(): void {
    if (!this.active) return;
    this.motionContact = null;
    this.resetHandMotion();
    this.resetPoseMovement('Start pose tracking, hold a comfortable stance, then calibrate.');
    this.lastOutcome = null;
    this.generation++;
    this.clearTimer();
    this.cancelRunUp?.();
    this.cancelRunUp = null;
    this.scene.cancelPracticeDelivery();
    this.bowlingPointerId = null;
    this.bowlingKey = null;
    this.aimPointer = null;
    this.touchControls.setLocked(false);
    this.delivery = null;
    this.shot = null;
    this.phase = 'ready';
    this.updatePhase();
    const bowling = this.mode === 'bowling';
    if (bowling) {
      this.cameraPreview.stop();
      get<HTMLInputElement>('playzone-motion-preview').checked = false;
      this.resetHandMotion();
      this.renderIntensityControls();
      get<HTMLInputElement>('playzone-pose-xray').checked = false;
      this.scene.setBatterXrayVisible(false);
    }
    get<HTMLElement>('screen-playzone').classList.toggle('practice-bowling', bowling);
    document.querySelector<HTMLElement>('.practice-dock-right')!.setAttribute('aria-label', bowling ? 'Delivery and opponent settings' : 'Batting controls');
    const manualGrid = get<HTMLElement>('playzone-manual-grid');
    const bowlingGrid = get<HTMLElement>('playzone-bowling-grid');
    const manualOptions = get<HTMLElement>('playzone-manual-options');
    const bowlingAdjustments = get<HTMLElement>('playzone-bowling-adjustments');
    for (const id of ['playzone-type-field', 'playzone-pace-field']) (bowling ? bowlingGrid : manualGrid).appendChild(get<HTMLElement>(id));
    if (!bowling) {
      manualGrid.insertBefore(get<HTMLElement>('playzone-type-field'), manualGrid.firstChild);
      manualGrid.insertBefore(get<HTMLElement>('playzone-line-field'), get<HTMLElement>('playzone-length-field'));
    }
    for (const id of ['playzone-spin-control', 'playzone-swing-control', 'playzone-side-control']) (bowling ? bowlingAdjustments : manualOptions).appendChild(get<HTMLElement>(id));
    (bowling ? get<HTMLElement>('playzone-bowling-display') : get<HTMLElement>('playzone-delivery-options')).appendChild(get<HTMLElement>('playzone-display-settings'));
    get<HTMLDetailsElement>('playzone-display-settings').open = !bowling;
    if (bowling) get<HTMLDetailsElement>('playzone-bot-controls').open = false;
    get<HTMLElement>('playzone-bowling-settings').hidden = !bowling;
    this.scene.isBotBatting = bowling;
    this.scene.botBattingTriggerCallback = bowling ? () => {
      if (this.active && this.mode === 'bowling' && this.phase === 'flight' && this.shot) this.scene.animateBatterSwing(this.shot.direction, () => {}, this.shot.type, this.shot.footwork);
    } : this.previousBotTrigger;
    if (bowling) this.scene.setBatterHandedness(this.selectedBatterHand());
    else this.scene.setBatterHandedness(this.batter.batterHand ?? 'RHB');
    get<HTMLElement>('playzone-delivery-options').hidden = this.mode === 'free';
    get<HTMLElement>('playzone-bowler-mode-control').hidden = bowling;
    get<HTMLElement>('playzone-manual-options').hidden = !bowling && this.simulated;
    get<HTMLElement>('playzone-simulated-options').hidden = bowling || !this.simulated;
    get<HTMLElement>('playzone-side-control').hidden = !bowling;
    get<HTMLElement>('playzone-pitch-picker').hidden = !bowling;
    get<HTMLElement>('playzone-repeat-control').hidden = bowling;
    get<HTMLElement>('playzone-batting-controls').hidden = bowling;
    get<HTMLElement>('playzone-bot-controls').hidden = !bowling;
    get<HTMLElement>('practice-touch-controls').classList.toggle('practice-touch-hidden', bowling);
    get<HTMLElement>('practice-movement-controls').hidden = bowling;
    get<HTMLElement>('playzone-help').textContent = bowling ? 'Hold Space or the bowling button and release in the green zone.' : 'Aim W A S D · Shots 1–4 · Footwork Q / E';
    this.updateSpinControl();
    get<HTMLButtonElement>('playzone-bowl').hidden = this.mode !== 'delivery';
    get<HTMLButtonElement>('playzone-bowl-action').hidden = !bowling;
    get<HTMLElement>('playzone-meter-wrap').hidden = !bowling;
    if (this.mode === 'free') this.scene.setPracticeCameraView();
    else this.scene.setCameraMode(bowling ? 'bowler_eye' : 'batter_eye');
    if (bowling) {
      const lengths: Record<LengthType, number> = { yorker: -7.5, full: -5.5, good: -3.5, short: -1.5, bouncer: 0.5 };
      this.setBowlingTarget({ x: getAimXFromLineType(get<HTMLSelectElement>('playzone-line').value as LineType, this.selectedBatterHand()), z: lengths[get<HTMLSelectElement>('playzone-length').value as LengthType] });
    } else this.scene.hideBounceMarker();
    this.feedback(this.mode === 'free' ? 'Choose a shot to preview it, or use the arrows to move.' : bowling ? 'Choose your delivery, then hold and release to bowl.' : this.simulated ? 'Simulated bowler ready. The next ball is coming.' : 'Choose a delivery and press Next ball.');
    if (this.mode === 'delivery' && this.shouldRepeat) this.scheduleNext();
  }

  private move(direction: string): void {
    if (!this.active || this.mode === 'bowling' || isGamePaused() || this.phase !== 'ready') return;
    const vectors: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], forward: [0, 1], back: [0, -1] };
    const vector = vectors[direction];
    if (!vector) return;
    this.position = moveBatter(this.position, vector[0] * 0.15, vector[1] * 0.15);
    this.scene.setPlayerCreaseOffset(-0.35 + this.position.x, this.position.z);
  }

  private setFootwork(value: 'front_foot' | 'back_foot'): void {
    this.footwork = value;
    document.querySelectorAll<HTMLButtonElement>('[data-practice-footwork]').forEach(button => {
      const selected = button.dataset.practiceFootwork === value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  private setShotType(type: ShotType): void {
    get<HTMLSelectElement>('playzone-shot').value = type;
    document.querySelectorAll<HTMLButtonElement>('[data-practice-shot]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.practiceShot === type));
    });
  }

  private updateScore(): void {
    get<HTMLElement>('playzone-score').textContent = `Practice · ${this.runs} runs / ${this.wickets} wickets · ${this.balls} balls`;
  }

  private previewSelection(): void {
    if (!this.active || this.mode !== 'free' || isGamePaused()) return;
    const direction = Number(get<HTMLSelectElement>('playzone-direction').value);
    const type = get<HTMLSelectElement>('playzone-shot').value as ShotType;
    this.poseAnimationUntil = performance.now() + 400;
    this.scene.animateBatterSwing(direction, () => {}, type, this.footwork);
    this.feedback(`Previewing ${type} · ${getDirectionName(direction)} · ${this.footwork === 'front_foot' ? 'front foot' : 'back foot'}`);
  }

  private resetPoseMovement(message: string): void {
    if (this.calibrationTimer !== null) window.clearInterval(this.calibrationTimer);
    this.calibrationTimer = null;
    get<HTMLButtonElement>('playzone-pose-calibrate-delay').textContent = 'Calibrate in 5 seconds';
    if (this.poseWatchdog !== null) window.clearTimeout(this.poseWatchdog);
    this.poseWatchdog = null;
    const wasCalibrated = this.poseCalibrated;
    this.poseCalibrated = false;
    this.calibratedVideoSize = null;
    this.poseRetarget.reset();
    if (wasCalibrated) this.scene.setBatterHandedness(this.batter.batterHand ?? 'RHB');
    get<HTMLElement>('playzone-retarget-status').textContent = message;
  }

  private calibratePose(): void {
    const mirror = get<HTMLInputElement>('playzone-pose-mirror').checked;
    this.resetPoseMovement('Calibrating movement.');
    const fullBody = [0, 11, 12, 23, 24, 27, 28, 31, 32].every(index => {
      const point = this.poseLandmarks[index];
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 0) >= .45 && point.x > .02 && point.x < .98 && point.y > .02 && point.y < .98;
    });
    const age = performance.now() - this.poseLandmarksAt;
    const fresh = age >= 0 && age <= 500 && !isGamePaused() && this.poseLandmarksRevision === gameClockRevision();
    const video = get<HTMLVideoElement>('playzone-camera-preview');
    const width = video.videoWidth, height = video.videoHeight;
    const matchingSize = this.poseLandmarksVideoSize?.width === width && this.poseLandmarksVideoSize?.height === height;
    this.poseCalibrated = this.active && this.mode !== 'bowling' && this.poseTrackingActive && fresh && matchingSize && width > 0 && height > 0 && this.poseRetarget.calibrate(this.poseLandmarks, mirror, this.poseWorldLandmarks, performance.now(), width / height);
    if (this.poseCalibrated) this.calibratedVideoSize = { width, height };
    get<HTMLElement>('playzone-retarget-status').textContent = this.poseCalibrated ? fullBody ? 'Calibrated! Your current stance is the reference. Move to control the character.' : 'Calibrated with a partial view. Show your whole body for leg tracking.' : !fresh || !matchingSize ? 'Could not calibrate. Wait for a fresh tracked pose, then try again.' : 'Could not calibrate. Face the camera with both shoulders and hips visible, then try again.';
    if (this.poseCalibrated) this.updatePoseMovement(this.poseLandmarks, this.poseWorldLandmarks, this.poseLandmarksAt);
  }

  private startDelayedCalibration(): void {
    if (this.calibrationTimer !== null) { this.resetPoseMovement('Delayed calibration cancelled.'); return; }
    if (!this.active || this.mode === 'bowling' || !this.poseTrackingActive) { this.resetPoseMovement('Start pose tracking before delayed calibration.'); return; }
    this.resetPoseMovement('Stand upright facing the camera with your whole body visible. Calibrating in 5 seconds.');
    get<HTMLButtonElement>('playzone-pose-calibrate-delay').textContent = 'Cancel delayed calibration';
    let seconds = 5;
    this.calibrationTimer = window.setInterval(() => {
      seconds--;
      if (seconds === 0) this.calibratePose();
      else get<HTMLElement>('playzone-retarget-status').textContent = `Stand upright facing the camera with your whole body visible. Calibrating in ${seconds} seconds.`;
    }, 1000);
  }

  private resetHandMotion(message?: string): void {
    if (this.motionWatchdog !== null) window.clearTimeout(this.motionWatchdog);
    this.motionWatchdog = null;
    this.handMotion.reset();
    const pending = this.handMotionIntensity.getPending();
    this.handMotionIntensity.cancel();
    if (pending) this.renderIntensityControls('Sample cancelled. You can record it again.');
    this.motionRevision = gameClockRevision();
    const timing = get<HTMLElement>('playzone-motion-timing');
    timing.hidden = !get<HTMLInputElement>('playzone-motion-preview').checked;
    timing.textContent = 'Bowl a practice ball to compare hand speed with modeled contact.';
    this.setHandMotionStatus(message ?? (get<HTMLInputElement>('playzone-motion-preview').checked
      ? 'Start pose tracking, then hold both hands close together and still.' : 'Hand-motion preview is off.'));
  }

  private setHandMotionStatus(message: string): void {
    const status = get<HTMLElement>('playzone-motion-status');
    if (status.textContent !== message) status.textContent = message;
  }

  private renderIntensityControls(message?: string): void {
    if (message !== undefined) this.intensityNotice = message;
    const enabled = get<HTMLInputElement>('playzone-motion-preview').checked;
    get<HTMLElement>('playzone-intensity-controls').hidden = !enabled;
    const pending = this.handMotionIntensity.getPending();
    const gentle = get<HTMLButtonElement>('playzone-intensity-gentle');
    const strong = get<HTMLButtonElement>('playzone-intensity-strong');
    gentle.disabled = !enabled || !this.poseTrackingActive;
    strong.disabled = !enabled || !this.poseTrackingActive || !this.handMotionIntensity.hasGentle();
    gentle.textContent = pending === 'gentle' ? 'Cancel gentler' : 'Record gentler';
    strong.textContent = pending === 'strong' ? 'Cancel stronger' : 'Record stronger';
    const status = get<HTMLElement>('playzone-intensity-status');
    const text = this.intensityNotice ?? (pending ? `Hold your hands still, then make your ${pending === 'gentle' ? 'gentler' : 'stronger'} movement.`
      : this.handMotionIntensity.isReady() ? 'Comparison ready. Samples last until tracking stops.'
      : this.handMotionIntensity.hasGentle() ? 'Gentler sample saved. Record a stronger movement.'
      : 'Record a gentler movement to begin.');
    if (status.textContent !== text) status.textContent = text;
  }

  private startIntensitySample(sample: IntensitySample): void {
    if (this.handMotionIntensity.getPending() === sample) {
      this.resetHandMotion();
      this.renderIntensityControls('Sample cancelled. You can record it again.');
      return;
    }
    this.resetHandMotion();
    this.intensityNotice = null;
    if (!this.active || this.mode === 'bowling' || !this.poseTrackingActive || !get<HTMLInputElement>('playzone-motion-preview').checked || !this.handMotionIntensity.begin(sample)) return;
    this.renderIntensityControls();
  }

  private updateHandMotion(landmarks: PoseLandmark[], timestamp: number): void {
    if (!get<HTMLInputElement>('playzone-motion-preview').checked) return;
    if (!this.active || this.mode === 'bowling' || isGamePaused()) { this.resetHandMotion('Hand-motion preview paused.'); return; }
    if (this.motionRevision !== gameClockRevision()) this.resetHandMotion('Playback resumed. Hold both hands close together and still.');
    if (!landmarks.length || !Number.isFinite(timestamp)) { this.resetHandMotion('Tracking stopped or no person detected. Start tracking and show both hands.'); return; }
    if (this.motionWatchdog !== null) window.clearTimeout(this.motionWatchdog);
    this.motionWatchdog = window.setTimeout(() => this.resetHandMotion('Tracking stopped responding. Restart pose tracking.'), 1500);
    const video = get<HTMLVideoElement>('playzone-camera-preview');
    const result = this.handMotion.update(landmarks, timestamp, video.videoWidth / video.videoHeight);
    if (result.event) {
      const direction = describeHandDirection(result.event, true);
      const capture = this.handMotionIntensity.capture(result.event.peakSpeed);
      const relative = capture === 'not-armed' ? this.handMotionIntensity.relativeIntensity(result.event.peakSpeed) : null;
      if (capture === 'gentle-saved') this.renderIntensityControls('Gentler sample saved. Record a stronger movement.');
      else if (capture === 'strong-saved') this.renderIntensityControls('Comparison ready. Samples last until tracking stops.');
      else if (capture === 'too-close') this.renderIntensityControls('That sample was too close to the gentler one. Try a clearly stronger movement.');
      else if (capture === 'invalid') this.renderIntensityControls('That sample was invalid. Please try again.');
      this.setHandMotionStatus(`Fast two-hand movement: ${(result.event.durationMs / 1000).toFixed(2)} s, peak ${result.event.peakSpeed.toFixed(1)} torso lengths/s. Camera view: ${direction ?? 'unclear'}.${relative === null ? '' : ` Relative hand-motion intensity: ${Math.round(relative * 100)}%.`} No shot recorded.`);
      const difference = this.mode === 'delivery' ? compareHandMotionTiming(result.event, this.motionContact, this.generation, performance.now(), gameNow()) : null;
      const timing = get<HTMLElement>('playzone-motion-timing');
      if (difference === null) timing.textContent = 'No comparable practice delivery for this movement.';
      else {
        const amount = Math.round(Math.abs(difference));
        timing.textContent = `Estimated hand-speed peak: ${amount} ms ${difference < 0 ? 'before' : 'after'} modeled contact. This is not bat contact.`;
      }
    } else if (result.state === 'waiting') {
      this.setHandMotionStatus('Hold both hands close together and still, with shoulders and hips visible.');
    } else if (result.state === 'ready') {
      this.setHandMotionStatus('Ready. Move both hands together to test.');
    } else if (result.state === 'moving') {
      this.setHandMotionStatus('Fast hand movement in progress…');
    }
  }

  private updatePoseMovement(landmarks: PoseLandmark[], world: PoseLandmark[], frameSubmittedAt = performance.now()): void {
    if (this.poseWatchdog !== null) window.clearTimeout(this.poseWatchdog);
    this.poseWatchdog = null;
    this.poseLandmarks = landmarks;
    this.poseWorldLandmarks = world;
    this.poseLandmarksAt = landmarks.length && Number.isFinite(frameSubmittedAt) ? frameSubmittedAt : -Infinity;
    this.poseLandmarksRevision = landmarks.length ? gameClockRevision() : -1;
    const currentVideo = get<HTMLVideoElement>('playzone-camera-preview');
    this.poseLandmarksVideoSize = landmarks.length ? { width: currentVideo.videoWidth, height: currentVideo.videoHeight } : null;
    if (!this.poseCalibrated) return;
    const video = currentVideo;
    if (!this.calibratedVideoSize || video.videoWidth !== this.calibratedVideoSize.width || video.videoHeight !== this.calibratedVideoSize.height) {
      this.resetPoseMovement('Camera dimensions changed. Calibrate again.');
      return;
    }
    this.poseWatchdog = window.setTimeout(() => {
      this.poseWatchdog = null;
      this.poseLandmarks = [];
      this.resetPoseMovement('Tracking stopped responding. Restart tracking and calibrate again.');
    }, 1500);
    const pose = this.poseRetarget.update(landmarks, get<HTMLInputElement>('playzone-pose-mirror').checked, world);
    if (!pose || !this.active || this.mode === 'bowling' || isGamePaused()) {
      this.resetPoseMovement('Tracking was lost or interrupted. Return to view and calibrate again.');
      return;
    }
    const legsVisible = [23, 24, 25, 26, 27, 28].every(index => {
      const point = landmarks[index];
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 0) >= .45 && point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1;
    });
    get<HTMLElement>('playzone-retarget-status').textContent = this.poseRetarget.isHoldingPose()
      ? 'Tracking briefly interrupted. Holding your last pose; return fully into view.'
      : !legsVisible
      ? 'Calibrated. Move back so your hips, knees and feet are visible for leg tracking.'
      : this.poseRetarget.getFacing() === null
        ? 'Calibrated! Face the camera with both shoulders visible to establish turning direction.'
        : 'Calibrated! Your current stance is the reference. Move to control the character.';
    if (performance.now() >= this.poseAnimationUntil) {
      const offset = this.poseRetarget.getOffset();
      if (!get<HTMLInputElement>('playzone-pose-depth').checked) offset.z = 0;
      this.scene.applyTrackedBatterPose(pose, offset, this.poseRetarget.getFacing(), this.poseRetarget.getDirections(), this.poseRetarget.getConfidence());
    }
  }

  private startBowling(): boolean {
    if (!this.active || this.mode !== 'bowling' || this.phase !== 'ready' || isGamePaused()) return false;
    this.lastOutcome = null;
    this.aimPointer = null;
    this.clearTimer();
    this.generation++;
    this.phase = 'runup';
    this.updatePhase();
    const pace = get<HTMLInputElement>('playzone-pace').valueAsNumber / 100;
    this.frontFootHeel = sampleFrontFootLanding(this.batter.stats.bowling.accuracy, pace, Math.random());
    globalAutoAssistConfig.isRunUpActive = true;
    globalAutoAssistConfig.runUpStartTime = gameNow();
    this.scene.setBowlerSide(get<HTMLSelectElement>('playzone-side').value === 'over', this.batter.bowlingArm ?? 'Right');
    this.feedback('Release in the green zone.');
    const generation = this.generation;
    const tick = () => {
      if (!this.active || this.mode !== 'bowling' || this.phase !== 'runup' || generation !== this.generation) return;
      const timing = bowlingReleaseTiming(gameNow() - (globalAutoAssistConfig.runUpStartTime ?? gameNow()));
      get<HTMLElement>('playzone-release-marker').style.left = `${timing * 100}%`;
      get<HTMLElement>('playzone-release-meter').setAttribute('aria-valuenow', String(Math.round(timing * 100)));
      requestAnimationFrame(tick);
    };
    tick();
    return true;
  }

  private releaseBowling(): void {
    if (!this.active || this.mode !== 'bowling' || this.phase !== 'runup' || isGamePaused()) return;
    const timing = bowlingReleaseTiming(gameNow() - (globalAutoAssistConfig.runUpStartTime ?? gameNow()));
    globalAutoAssistConfig.isRunUpActive = false;
    const type = get<HTMLSelectElement>('playzone-type').value as DeliveryType;
    const hand = this.selectedBatterHand();
    const target = bowlingExecutionTarget(this.bowlingTarget, timing, this.batter.stats.bowling.accuracy);
    this.difficulty = get<HTMLSelectElement>('playzone-batter-difficulty').value as 'Rookie' | 'Medium' | 'Hard';
    this.botBatter = { ...createBotPlayer(this.difficulty), batterHand: hand };
    this.bowler = this.batter;
    const spin = isSpinDelivery(type);
    this.delivery = {
      type, aimTarget: target, line: getLineTypeFromAimX(target.x, hand),
      length: target.z < -6.5 ? 'yorker' : target.z < -4.5 ? 'full' : target.z < -2.5 ? 'good' : target.z < -0.5 ? 'short' : 'bouncer',
      releaseTiming: timing, frontFootHeel: this.frontFootHeel,
      pace: get<HTMLInputElement>('playzone-pace').valueAsNumber / 100,
      turn: spin ? get<HTMLInputElement>('playzone-spin').valueAsNumber / 100 : 0,
      swing: spin ? 0 : get<HTMLInputElement>('playzone-swing-amount').valueAsNumber / 100,
      overTheWicket: get<HTMLSelectElement>('playzone-side').value === 'over',
      bowlingArm: this.batter.bowlingArm ?? 'Right'
    };
    const choice = botChooseShot(this.botBatter, this.bowler, this.delivery, this.difficulty);
    const style = get<HTMLSelectElement>('playzone-batter-style').value;
    this.shot = style === 'auto' ? choice : { ...choice, type: style as ShotType };
    this.phase = 'flight';
    this.updatePhase();
    const generation = this.generation;
    globalAutoAssistConfig.currentDelivery = this.delivery;
    globalAutoAssistConfig.bowlerArm = this.delivery.bowlingArm;
    this.scene.prepareDeliverySound();
    this.scene.animateDelivery(this.delivery.aimTarget, this.delivery.length, type, () => this.arrive(generation), () => this.finish(generation), this.delivery.overTheWicket, undefined, false, 0, this.delivery.pace, this.delivery.turn, this.delivery.swing);
    this.feedback(`Ball released · ${Math.round(timing * 100)}% timing`);
  }

  /** Cancel a held bowling action on focus loss or when gameplay is paused. */
  public interrupt(): void {
    if (!this.active || this.mode !== 'bowling' || this.phase !== 'runup') return;
    this.generation++;
    this.bowlingPointerId = null;
    this.bowlingKey = null;
    this.scene.cancelPracticeDelivery();
    this.scene.resetBowlerMesh();
    this.phase = 'ready';
    this.updatePhase();
    this.setBowlingTarget(this.bowlingTarget);
    this.feedback('Bowling cancelled. Hold and release to try again.');
  }

  private bowl(): void {
    if (!this.active || this.mode !== 'delivery' || this.phase !== 'ready' || isGamePaused()) return;
    this.motionContact = null;
    get<HTMLElement>('playzone-motion-timing').textContent = 'Waiting for the practice delivery.';
    this.lastOutcome = null;
    this.clearTimer();
    const type = get<HTMLSelectElement>('playzone-type').value as DeliveryType;
    const line = get<HTMLSelectElement>('playzone-line').value as LineType;
    const length = get<HTMLSelectElement>('playzone-length').value as LengthType;
    const x: Record<LineType, number> = { off: 0.5, middle: 0, leg: -0.5 };
    const z: Record<LengthType, number> = { yorker: -7.3, full: -5.5, good: -3.5, short: -1.5, bouncer: 0 };
    this.difficulty = this.simulated ? get<HTMLSelectElement>('playzone-difficulty').value as 'Rookie' | 'Medium' | 'Hard' : 'Medium';
    this.bowler = createBotPlayer(this.difficulty);
    const chosen = this.simulated
      ? botChooseDelivery(this.bowler, this.difficulty, this.batter.batterHand ?? 'RHB')
      : { type, line, length, aimTarget: { x: x[line], z: z[length] }, pace: Number(get<HTMLInputElement>('playzone-pace').value) / 100, turn: isSpinDelivery(type) ? Number(get<HTMLInputElement>('playzone-spin').value) / 100 : 0, swing: 0, overTheWicket: true, bowlingArm: 'Right' as const, releaseTiming: 0.5 };
    this.delivery = { ...chosen, batterPosition: { ...this.position } };
    this.shot = null;
    this.phase = 'runup';
    this.updatePhase();
    const generation = ++this.generation;
    globalAutoAssistConfig.currentDelivery = this.delivery;
    this.scene.setBowlerSide(this.delivery.overTheWicket ?? true, this.delivery.bowlingArm ?? 'Right');
    this.scene.updateBounceMarker(deliveryPitchPoint(this.delivery));
    this.scene.setCameraMode('batter_eye');
    this.scene.prepareDeliverySound();
    this.scene.setDeliveryCallbacks(() => this.arrive(generation), () => this.finish(generation));
    this.feedback('Bowler running in…');
    this.cancelRunUp = initBattingDelivery(true, this.scene.scene.getMeshByName('cricketBall'), () => {
      if (!this.active || generation !== this.generation) return;
      this.cancelRunUp = null;
      const releaseGameTime = globalAutoAssistConfig.deliveryStartTime;
      if (this.delivery && Number.isFinite(releaseGameTime)) {
        this.motionContact = { generation, releaseGameTime: releaseGameTime!, contactGameTime: releaseGameTime! + deliveryDurationMs(this.delivery.type, this.delivery.pace) * batterContactProgress(this.delivery) };
        if (get<HTMLInputElement>('playzone-motion-preview').checked) get<HTMLElement>('playzone-motion-timing').textContent = 'Practice delivery live; move your hands to compare timing.';
      }
      this.phase = 'flight';
      this.updatePhase();
      this.feedback('Ball incoming — swing as it arrives.');
    });
  }

  private swing(): void {
    if (!this.active || isGamePaused()) return;
    if (this.mode === 'free') { this.previewSelection(); return; }
    if (this.phase !== 'flight' || !this.delivery || this.shot || !globalAutoAssistConfig.isDeliveryActive) return;
    const direction = Number(get<HTMLSelectElement>('playzone-direction').value);
    const type = get<HTMLSelectElement>('playzone-shot').value as ShotType;
    const elapsed = gameNow() - (globalAutoAssistConfig.deliveryStartTime ?? gameNow());
    const rawTiming = 0.5 + (elapsed - (deliveryDurationMs(this.delivery.type, this.delivery.pace) * batterContactProgress(this.delivery) - 150)) / 500;
    this.shot = { direction, type, timing: Math.max(0, Math.min(1, rawTiming)), contactZone: battingContactZone(this.delivery, rawTiming), footwork: this.footwork };
    this.touchControls.setLocked(true);
    this.poseAnimationUntil = performance.now() + 400;
    this.scene.animateBatterSwing(direction, () => {}, type, this.footwork);
    const timing = battingTimingFeedback(this.shot.timing);
    this.feedback(`${type} · ${getDirectionName(direction)} · ${timing.label} (${timing.offsetMs} ms)`);
  }

  private arrive(generation: number): void {
    if (!this.active || generation !== this.generation || !this.delivery || this.phase !== 'flight') return;
    this.phase = 'result';
    this.updatePhase();
    const batter = this.mode === 'bowling' ? this.botBatter : this.batter;
    const { outcome, nextFreeHit } = resolveBattingDelivery({ delivery: this.delivery, shot: this.shot, batter, bowler: this.bowler, difficulty: this.difficulty, ballNumber: this.balls + 1, isFreeHit: this.nextFreeHit });
    this.nextFreeHit = nextFreeHit;
    if (!outcome.isExtra) this.balls++;
    if (outcome.isExtra) this.runs++;
    if (outcome.isWicket) this.wickets++;
    this.updateScore();
    if (outcome.shot && !outcome.missed && !outcome.isWicket && outcome.extraType !== 'wide') {
      const assist = battingAssistanceMultiplier(batter, this.bowler, this.difficulty);
      const quality = shotFlightQuality(outcome.shot, outcome.delivery, assist);
      const theta = outcome.shot.direction * Math.PI / 4 - Math.PI / 2;
      const velocity = calculateShotTrajectory(quality, 0.5, 0.5, theta, deliveryVelocityAtCrease(outcome.delivery), { x: 0, y: 0, z: 0 }, true, false, 'Medium', outcome.shot.type, batter.stats.batting.power, outcome.shot.strength);
      this.scene.animateHitPath(outcome.distance, outcome.shot.direction, velocity, !get<HTMLInputElement>('playzone-follow-ball').checked);
      this.pendingOutcome = outcome;
    } else {
      const timing = this.shot ? battingTimingFeedback(this.shot.timing) : null;
      this.showOutcome(`${this.shot && timing ? `${this.shot.type} · ${getDirectionName(this.shot.direction)} · ${timing.label} (${timing.offsetMs} ms) · ` : ''}${outcome.wicketReason || (outcome.missed ? 'Missed delivery' : 'No shot')}${outcome.extraType ? ` · ${outcome.extraType}` : ''}${this.nextFreeHit ? ' · Free hit next' : ''}`);
      this.pendingOutcome = null;
      this.scene.animateMissWicket(outcome.isWicket, outcome.delivery);
    }
  }

  private pendingOutcome: BallOutcome | null = null;
  private finish(generation: number): void {
    if (!this.active || generation !== this.generation || this.phase !== 'result') return;
    if (this.pendingOutcome?.shot) {
      const outcome = this.pendingOutcome;
      const shot = outcome.shot!;
      const flight = resolveShotFlight(this.scene.getShotDistance(), this.scene.shotBoundaryOnFull ? false : !!globalAutoAssistConfig.hasBounced, this.scene.shotReachedBoundary);
      this.runs += flight.runs;
      this.updateScore();
      const timing = battingTimingFeedback(shot.timing);
      this.showOutcome(`${this.mode === 'bowling' ? 'Bot · ' : ''}${shot.type} · ${getDirectionName(shot.direction)} · ${timing.label} (${timing.offsetMs} ms) · ${flight.runs} runs · ${flight.distance.toFixed(1)} m${outcome.extraType ? ` · ${outcome.extraType}` : ''}${this.nextFreeHit ? ' · Free hit next' : ''}`);
    }
    this.pendingOutcome = null;
    this.delivery = null;
    this.shot = null;
    this.phase = 'ready';
    this.updatePhase();
    this.touchControls.setLocked(false);
    this.scene.setCameraMode(this.mode === 'bowling' ? 'bowler_eye' : 'batter_eye');
    if (this.mode === 'bowling') this.setBowlingTarget(this.bowlingTarget);
    if (this.mode === 'delivery' && this.shouldRepeat) this.scheduleNext();
  }

  private scheduleNext(): void {
    this.clearTimer();
    const generation = this.generation;
    this.timer = setGameTimeout(() => {
      this.timer = null;
      if (this.active && this.mode === 'delivery' && this.phase === 'ready' && this.generation === generation && this.shouldRepeat) this.bowl();
    }, 1500);
  }
}
