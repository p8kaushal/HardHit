import { MatchController, globalAutoAssistConfig, initBattingDelivery, inningsBallLimit } from './game';
import { GameScene } from './scene';
import { BallOutcome, DeliveryChoice, MatchState, Player, ShotChoice, ShotType } from './types';
import { botChooseDelivery, botChooseShot } from './bot';
import { BATTER_CONTACT_Z, batterContactProgress, battingContactZone, bowlingExecutionTarget, bowlingReleaseTiming, bowlingTargetFromScreen, deliveryDurationMs, deliveryPitchPoint, deliveryVelocityAtCrease, footworkFactor, getLineTypeFromAimX, calculateShotTrajectory, getDirectionName, evaluateFinalOutcome, calculateBounceTarget, sampleFrontFootLanding } from './formula';
import { moveBatter, type BatterPosition } from './batter-position';
import { KeyboardInputManager } from './input';
import { suggestedShotDirection, TouchBattingControls } from './touch-controls';
import { initBowlingAdjustmentReadouts, isSpinDelivery, updateBowlingAdjustmentVisibility } from './bowling-controls';
import { addLeaderboardEntry, readLeaderboard } from './leaderboard';
import { clearGameTimeout, gameNow, isGamePaused, setGameTimeout } from './game-clock';
import { gameSound } from './sound';

export class UIManager {
  private controller: MatchController;
  private gameScene: GameScene;
  private keyboardInputManager: KeyboardInputManager;
  private touchBattingControls: TouchBattingControls;
  private batterPosition: BatterPosition = { x: 0, z: 0 };
  private batterPositionLocked = false;

  // Gesture/Swipe Tracking
  private swipeStartX = 0;
  private swipeStartY = 0;
  private isPointerDown = false;
  
  // Aiming Target (Bowling Crease Coordinate offsets)
  private currentAimTargetX = 0;
  private currentAimTargetZ = -3.5; // good length default
  
  // Active deliveries / shots
  public isBallActive = false;
  private activeDelivery: DeliveryChoice | null = null;
  private activeShot: ShotChoice | null = null;
  private deliveryStarted = false;
  private deliveryGeneration = 0;
  private recordedSummary: MatchState | null = null;
  
  // Selections
  private selectedShotType: ShotType = 'grounded';
  private selectedBowlType: 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin' = 'fast';
  private overTheWicket = true;
  private frontFootHeel = -0.08;
  public isBannerActive: boolean = false;

  // Result Toast Auto-dismiss Timer
  private toastDismissTimer: any = null;
  private botDeliveryTimer: number | null = null;
  private cancelBattingRunUp: (() => void) | null = null;

  private cancelPendingDelivery(): void {
    this.deliveryGeneration++;
    this.cancelBattingRunUp?.();
    this.cancelBattingRunUp = null;
    if (this.botDeliveryTimer !== null) clearGameTimeout(this.botDeliveryTimer);
    this.botDeliveryTimer = null;
  }

  public setController(controller: MatchController) {
    this.cancelPendingDelivery();
    this.batterPosition = { x: 0, z: 0 };
    this.batterPositionLocked = false;
    this.controller = controller;
  }

  constructor(controller: MatchController) {
    this.controller = controller;
    this.gameScene = new GameScene('game-canvas');
    this.keyboardInputManager = new KeyboardInputManager(
      () => this.controller.getCurrentInnings().batter.id === this.controller.state.player.id,
      () => this.startUserBowlingDelivery(),
      () => this.endUserBowlingDelivery(),
      (direction, type) => this.executeBattingSwingGesture(direction, type),
      () => this.controller.getCurrentInnings().batter.batterHand || 'RHB',
      (x, z) => this.setBowlingTarget({ x, z })
    );
    this.initEventListeners();
    this.gameScene.onDeliveryBounce = () => gameSound.play('bounce');
    initBowlingAdjustmentReadouts();
    updateBowlingAdjustmentVisibility(this.keyboardInputManager.intent.deliveryType);
    this.touchBattingControls = new TouchBattingControls(
      document.getElementById('touch-stick')!,
      document.querySelectorAll<HTMLButtonElement>('.touch-shot'),
      (direction, type) => this.executeBattingSwingGesture(direction, type)
    );
    this.updateHUD();

    this.gameScene.botBattingTriggerCallback = () => {
      const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
      if (!isPlayerBatting && this.pendingBotShot && !this.activeShot) {
        const shot = this.pendingBotShot;
        this.executeBattingSwingGesture(shot.direction, shot.type, shot.timing, shot.contactZone);
      }
    };
  }

  private initEventListeners(): void {
    const canvas = document.getElementById('game-canvas')!;

    // Touch & Pointer gesture handlers for pitch aiming & batting swipes
    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    canvas.addEventListener('pointercancel', () => { this.isPointerDown = false; });

    const pitchMap = document.getElementById('bowling-pitch-map')!;
    let pitchPointer: number | null = null;
    const updatePitchMap = (event: PointerEvent) => {
      const rect = pitchMap.getBoundingClientRect();
      this.setBowlingTarget(bowlingTargetFromScreen((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height));
    };
    pitchMap.addEventListener('pointerdown', event => {
      if (this.isBallActive || pitchPointer !== null) return;
      event.preventDefault();
      pitchPointer = event.pointerId;
      pitchMap.setPointerCapture(event.pointerId);
      updatePitchMap(event);
    });
    pitchMap.addEventListener('pointermove', event => { if (event.pointerId === pitchPointer) updatePitchMap(event); });
    pitchMap.addEventListener('pointerup', event => { if (event.pointerId === pitchPointer) pitchPointer = null; });
    pitchMap.addEventListener('pointercancel', event => { if (event.pointerId === pitchPointer) pitchPointer = null; });

    document.querySelectorAll<HTMLButtonElement>('.footwork-choice').forEach(button => button.addEventListener('click', () => {
      const footwork = button.dataset.footwork;
      if (footwork === 'front_foot' || footwork === 'back_foot') this.keyboardInputManager.setFootwork(footwork);
    }));

    document.querySelectorAll<HTMLButtonElement>('[data-batter-move]').forEach(button => {
      button.addEventListener('click', () => this.movePlayerBatter(button.dataset.batterMove || ''));
    });
    window.addEventListener('keydown', event => {
      const directions: Record<string, string> = { i: 'forward', j: 'left', k: 'back', l: 'right' };
      const direction = directions[event.key.toLowerCase()];
      if (!direction || event.repeat || isGamePaused() || !document.getElementById('screen-gameplay')?.classList.contains('active')) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      this.movePlayerBatter(direction);
    });

    // Shot selector
    const batTypeButtons = document.querySelectorAll('#bat-type-group .btn');
    batTypeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (globalAutoAssistConfig.isDeliveryActive) return;
        batTypeButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        this.selectedShotType = target.getAttribute('data-val') as ShotType;
        this.keyboardInputManager.intent.shotType = this.selectedShotType;
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bowl type selector
    document.querySelectorAll<HTMLButtonElement>('#bowl-side-group button').forEach(button => {
      button.addEventListener('click', () => {
        if (this.isBallActive) return;
        this.overTheWicket = button.dataset.side === 'over';
        this.gameScene.setBowlerSide(this.overTheWicket, this.controller.getCurrentInnings().bowler.bowlingArm || 'Right');
        document.querySelectorAll<HTMLButtonElement>('#bowl-side-group button').forEach(option => {
          const selected = option === button;
          option.classList.toggle('active', selected);
          option.setAttribute('aria-pressed', String(selected));
        });
      });
    });
    const bowlTypeButtons = document.querySelectorAll('#bowl-type-group .btn');
    bowlTypeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        bowlTypeButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        this.selectedBowlType = target.getAttribute('data-val') as any;
        this.keyboardInputManager.intent.deliveryType = this.selectedBowlType;
        updateBowlingAdjustmentVisibility(this.selectedBowlType);
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bowl Line selector sync
    const bowlLineButtons = document.querySelectorAll('#bowl-line-group .btn');
    bowlLineButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        bowlLineButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        const lineVal = target.getAttribute('data-val') || 'middle';
        
        const activeLenBtn = document.querySelector('#bowl-length-group .btn.active');
        const lenVal = activeLenBtn ? activeLenBtn.getAttribute('data-val') || 'good' : 'good';
        
        const targetPos = calculateBounceTarget(lineVal, lenVal, this.controller.getCurrentInnings().batter.batterHand || 'RHB');
        this.setBowlingTarget({ x: targetPos.x, z: this.currentAimTargetZ });
        
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bowl Length selector sync
    const bowlLengthButtons = document.querySelectorAll('#bowl-length-group .btn');
    bowlLengthButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        bowlLengthButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        const lenVal = target.getAttribute('data-val') || 'good';
        
        const activeLineBtn = document.querySelector('#bowl-line-group .btn.active');
        const lineVal = activeLineBtn ? activeLineBtn.getAttribute('data-val') || 'middle' : 'middle';
        
        const targetPos = calculateBounceTarget(lineVal, lenVal, this.controller.getCurrentInnings().batter.batterHand || 'RHB');
        this.setBowlingTarget({ x: this.currentAimTargetX, z: targetPos.z });

        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bat Clock direction selectors sync
    const clockButtons = document.querySelectorAll('#aim-clock .clock-btn');
    clockButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (globalAutoAssistConfig.isDeliveryActive) return;
        clockButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        const clockVal = parseInt(target.getAttribute('data-val') || '0');
        this.keyboardInputManager.intent.aimDirection = clockVal;
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Hold/Release execute timing buttons
    const btnBowl = document.getElementById('btn-bowl-pitch')!;
    btnBowl.addEventListener('mousedown', () => this.startUserBowlingDelivery());
    btnBowl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startUserBowlingDelivery();
    });

    const btnBat = document.getElementById('btn-bat-swing')!;
    btnBat.addEventListener('mousedown', () => this.executeKeyboardBatSwing());
    btnBat.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.executeKeyboardBatSwing();
    });

    // Help button and modal listeners
    const soundButton = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
    const updateSoundButton = () => {
      soundButton.textContent = gameSound.isMuted ? '🔇' : '🔊';
      const label = gameSound.isMuted ? 'Unmute sound' : 'Mute sound';
      soundButton.setAttribute('aria-label', label);
      soundButton.setAttribute('aria-pressed', String(gameSound.isMuted));
      soundButton.title = label;
    };
    updateSoundButton();
    soundButton.addEventListener('click', () => { gameSound.setMuted(!gameSound.isMuted); updateSoundButton(); });

    const btnHelpToggle = document.getElementById('btn-help-toggle');
    if (btnHelpToggle) {
      btnHelpToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.keyboardInputManager.toggleHelpModal();
      });
    }

    const btnHelpClose = document.getElementById('btn-help-close');
    if (btnHelpClose) {
      btnHelpClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.keyboardInputManager.closeHelpModal();
      });
    }

    const helpBackdrop = document.getElementById('help-modal-backdrop');
    if (helpBackdrop) {
      helpBackdrop.addEventListener('click', () => {
        this.keyboardInputManager.closeHelpModal();
      });
    }

    // Match Summary Modal Action Buttons
    const btnRematch = document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => this.handleRematch());
    }

    const btnReturnLobby = document.getElementById('btn-return-lobby');
    if (btnReturnLobby) {
      btnReturnLobby.addEventListener('click', () => this.handleReturnToLobby());
    }

    // Global listeners
    window.addEventListener('mouseup', () => this.endUserBowlingDelivery());
    window.addEventListener('touchend', () => this.endUserBowlingDelivery());
  }

  // --- Pointer & Aim Gesture Recognition ---

  private handlePointerDown(e: PointerEvent): void {
    if (!e.isPrimary) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    this.isPointerDown = true;
    this.swipeStartX = e.clientX;
    this.swipeStartY = e.clientY;

    // In bowling phase, tap position directly sets aim target on pitch
    if (!isPlayerBatting) {
      this.updateBowlingAim(e);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!e.isPrimary || !this.isPointerDown) return;
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (!isPlayerBatting) {
      this.updateBowlingAim(e);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!e.isPrimary || !this.isPointerDown) return;
    this.isPointerDown = false;
    
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (isPlayerBatting) {
      // Resolve batting swipe gesture
      const dx = e.clientX - this.swipeStartX;
      const dy = e.clientY - this.swipeStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 30) {
        // Swipe detected! Determine angle (0-7 clock direction)
        // 0 points straight up (Z-axis direction), angles rotate clockwise
        let angle = Math.atan2(dx, -dy); // Y axis pointing down on screens
        if (angle < 0) angle += Math.PI * 2;
        const clockDirection = Math.round((angle / (Math.PI * 2)) * 8) % 8;

        this.executeBattingSwingGesture(clockDirection, this.keyboardInputManager.intent.shotType);
      }
    }
  }

  private updateBowlingAim(e: PointerEvent): void {
    const canvas = document.getElementById('game-canvas')!;
    const rect = canvas.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width; // 0 to 1
    const relativeY = (e.clientY - rect.top) / rect.height; // 0 to 1

    // Map X to Line offset (-1.5 to 1.5 meters)
    const target = this.gameScene.pickBowlingTarget(e.clientX, e.clientY) ?? bowlingTargetFromScreen(relativeX, relativeY);
    this.setBowlingTarget(target);
  }

  private setBowlingTarget(target: { x: number; z: number }): void {
    this.currentAimTargetX = target.x;
    this.currentAimTargetZ = target.z;
    this.keyboardInputManager.setBowlingAim(target.x, target.z);
    this.gameScene.updateBounceMarker(target);
    const hand = this.controller.getCurrentInnings().batter.batterHand || 'RHB';
    const line = getLineTypeFromAimX(target.x, hand);
    const length = target.z < -6.5 ? 'yorker' : target.z < -4.5 ? 'full' : target.z < -2.5 ? 'good' : target.z < -0.5 ? 'short' : 'bouncer';
    document.querySelectorAll<HTMLButtonElement>('#bowl-line-group .btn').forEach(button => button.classList.toggle('active', button.dataset.val === line));
    document.querySelectorAll<HTMLButtonElement>('#bowl-length-group .btn').forEach(button => button.classList.toggle('active', button.dataset.val === length));
    const marker = document.getElementById('bowling-map-marker');
    if (marker) {
      marker.style.left = `${Math.max(0, Math.min(100, (0.5 - target.x / 3) * 100))}%`;
      marker.style.top = `${Math.max(0, Math.min(100, (target.z + 8.2) / 8.7 * 100))}%`;
    }
    this.keyboardInputManager.updateFeedbackOverlay();
  }

  private movePlayerBatter(direction: string): void {
    if (this.batterPositionLocked || this.controller.state.status !== 'playing' || this.controller.getCurrentInnings().batter.id !== this.controller.state.player.id) return;
    const offsets: Record<string, [number, number]> = { left: [-0.2, 0], right: [0.2, 0], forward: [0, 0.2], back: [0, -0.2] };
    if (direction === 'reset') this.batterPosition = { x: 0, z: 0 };
    else if (offsets[direction]) this.batterPosition = moveBatter(this.batterPosition, ...offsets[direction]);
    else return;
    this.gameScene.setPlayerCreaseOffset(-0.35 + this.batterPosition.x, this.batterPosition.z);
    if (this.activeDelivery) {
      this.activeDelivery.batterPosition = { ...this.batterPosition };
      this.touchBattingControls.setSuggestion(suggestedShotDirection(this.activeDelivery));
    }
    this.updateBatterMovementControls();
  }

  private updateBatterMovementControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-batter-move]').forEach(button => { button.disabled = this.batterPositionLocked; });
  }

  public startUserBowlingDelivery(): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (isPlayerBatting || this.isBallActive || globalAutoAssistConfig.isRunUpActive) return;

    const pace = (document.getElementById('bowl-pace') as HTMLInputElement).valueAsNumber / 100;
    this.frontFootHeel = sampleFrontFootLanding(this.controller.getCurrentInnings().bowler.stats.bowling.accuracy, pace, Math.random());

    this.isBallActive = true; 
    globalAutoAssistConfig.isRunUpActive = true;
    globalAutoAssistConfig.runUpStartTime = gameNow();

    // Auto-hide panels
    const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');
    if (controlBowling) controlBowling.classList.add('hidden', 'panel-hidden');
    if (controlBatting) controlBatting.classList.add('hidden', 'panel-hidden');

    let indicator = document.getElementById('bowler-runup-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bowler-runup-indicator';
      indicator.style.position = 'absolute';
      indicator.style.top = '10%';
      indicator.style.left = '50%';
      indicator.style.transform = 'translateX(-50%)';
      indicator.style.fontSize = '2rem';
      indicator.style.color = 'white';
      indicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
      indicator.style.padding = '10px';
      indicator.style.zIndex = '9999';
      document.body.appendChild(indicator);
    }
    indicator.innerHTML = '<div>RELEASE IN THE GREEN ZONE</div><div class="release-meter" role="progressbar" aria-label="Bowling release timing" aria-valuemin="0" aria-valuemax="100"><span class="release-meter-target"></span><span class="release-meter-marker"></span></div>';
    const meter = indicator.querySelector<HTMLElement>('.release-meter')!;
    const marker = indicator.querySelector<HTMLElement>('.release-meter-marker')!;
    const updateMeter = () => {
      if (!globalAutoAssistConfig.isRunUpActive || !indicator?.isConnected) return;
      const elapsed = gameNow() - (globalAutoAssistConfig.runUpStartTime ?? gameNow());
      const progress = bowlingReleaseTiming(elapsed);
      marker.style.left = `${progress * 100}%`;
      meter.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      requestAnimationFrame(updateMeter);
    };
    updateMeter();
  }

  public endUserBowlingDelivery(): void {
    if (!globalAutoAssistConfig.isRunUpActive) return;
    
    globalAutoAssistConfig.isRunUpActive = false;
    
    const indicator = document.getElementById('bowler-runup-indicator');
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }

    // calculate timing based on proximity to 1200ms
    const elapsed = gameNow() - (globalAutoAssistConfig.runUpStartTime || 0);
    const timing = bowlingReleaseTiming(elapsed);

    // Now pitch the ball
    this.selectedBowlType = this.keyboardInputManager.intent.deliveryType;
    this.currentAimTargetX = this.keyboardInputManager.intent.aimX;
    this.currentAimTargetZ = this.keyboardInputManager.intent.aimZ;

    const executedTarget = bowlingExecutionTarget(
      { x: this.currentAimTargetX, z: this.currentAimTargetZ },
      timing,
      this.controller.getCurrentInnings().bowler.stats.bowling.accuracy
    );

    const spin = isSpinDelivery(this.selectedBowlType);
    this.activeDelivery = {
      aimTarget: executedTarget,
      line: getLineTypeFromAimX(executedTarget.x, this.controller.getCurrentInnings().batter.batterHand || 'RHB'),
      length: executedTarget.z < -6.5 ? 'yorker' : (executedTarget.z < -4.5 ? 'full' : (executedTarget.z < -2.5 ? 'good' : (executedTarget.z < -0.5 ? 'short' : 'bouncer'))),
      type: this.selectedBowlType,
      overTheWicket: this.overTheWicket,
      bowlingArm: this.controller.getCurrentInnings().bowler.bowlingArm || 'Right',
      releaseTiming: timing,
      frontFootHeel: this.frontFootHeel,
      pace: (document.getElementById('bowl-pace') as HTMLInputElement).valueAsNumber / 100,
      turn: spin ? (document.getElementById('bowl-turn') as HTMLInputElement).valueAsNumber / 100 : 0,
      swing: spin ? 0 : (document.getElementById('bowl-swing') as HTMLInputElement).valueAsNumber / 100
    };
    globalAutoAssistConfig.currentDelivery = this.activeDelivery;

    // Bot decides batting response
    this.pendingBotShot = botChooseShot(
      this.controller.state.bot,
      this.controller.state.player,
      this.activeDelivery,
      this.controller.state.bot.rank === 'Legend' ? 'Hard' : (this.controller.state.bot.rank === 'Gold' ? 'Medium' : 'Rookie')
    );

    this.deliverBall3D();
  }

  // --- Batting Swings ---

  private executeKeyboardBatSwing(): void {
    this.executeBattingSwingGesture(this.keyboardInputManager.intent.aimDirection, this.keyboardInputManager.intent.shotType);
  }

  public executeBattingSwingGesture(direction: number, type: ShotType, simulatedTiming?: number, contactZone?: number): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if ((!isPlayerBatting && simulatedTiming === undefined) || !this.activeDelivery || this.activeShot) return;
    if (isPlayerBatting && !globalAutoAssistConfig.isDeliveryActive) return;

    this.hideAssistedPrompt();
    // Auto-hide panels to clear view
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');
    if (controlBatting) controlBatting.classList.add('hidden', 'panel-hidden');

    let timing = 0.5;
    if (simulatedTiming !== undefined) {
      timing = simulatedTiming;
    } else {
      // A swing begins 150 ms before the selected delivery reaches the crease.
      const elapsed = gameNow() - (globalAutoAssistConfig.deliveryStartTime ?? gameNow());
      timing = 0.5 + (elapsed - (deliveryDurationMs(this.activeDelivery.type, this.activeDelivery.pace) * batterContactProgress(this.activeDelivery) - 150)) / 500;
    }

    this.activeShot = {
      direction,
      type,
      timing: Math.max(0.0, Math.min(1.0, timing)),
      contactZone: battingContactZone(this.activeDelivery, timing, contactZone),
      footwork: isPlayerBatting ? this.keyboardInputManager.intent.footwork : undefined
    };
    if (isPlayerBatting) this.touchBattingControls.setLocked(true);

    this.gameScene.animateBatterSwing(direction, () => {
      // Swing visual completes
    });
  }

  // --- Ball Trajectory Animation Trigger ---

  private pendingBotShot: ShotChoice | null = null;

  // --- Ball Trajectory Animation Trigger ---

  private showBattingHelper(recommendation: string): void {
    let helper = document.getElementById('batting-helper');
    if (!helper) {
      helper = document.createElement('div');
      helper.id = 'batting-helper';
      helper.style.position = 'absolute';
      helper.style.top = '25%';
      helper.style.left = '50%';
      helper.style.transform = 'translate(-50%, -50%)';
      helper.style.textAlign = 'center';
      helper.style.pointerEvents = 'none';
      helper.style.zIndex = '1000';
      helper.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
      document.body.appendChild(helper);
    }
    helper.innerHTML = `
      <div id="recommended-shot-banner" style="color: #22d3ee; font-size: 1.5rem; font-weight: bold; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px;">RECOMMENDED: ${recommendation}</div>
      <div id="hit-space-banner" style="color: #4ade80; font-size: 2.5rem; font-weight: 900; margin-top: 10px; display: none; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 8px; border: 2px solid #4ade80; animation: pulse 1s infinite;">HIT SPACE NOW!</div>
    `;
    if (!document.getElementById('pulse-anim')) {
      const style = document.createElement('style');
      style.id = 'pulse-anim';
      style.innerHTML = `@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }`;
      document.head.appendChild(style);
    }
  }

  public hideAssistedPrompt(): void {
    const banner = document.getElementById('hit-space-banner');
    if (banner) {
      banner.style.display = 'none';
    }
    this.isBannerActive = false;
  }

  private hideBattingHelper(): void {
    this.hideAssistedPrompt();
    const helper = document.getElementById('batting-helper');
    if (helper) helper.innerHTML = '';
  }

  private deliverBall3D(): void {
    if (!this.activeDelivery || this.deliveryStarted) return;

    this.isBallActive = true;
    this.hideResultToast();
    this.deliveryStarted = true;
    this.gameScene.prepareDeliverySound();
    const generation = this.deliveryGeneration;
    let arrived = false;
    let resolved = false;

    // Lock camera in pre-contact player perspective before delivery commences
    const recShotHud = document.getElementById('recommended-shot-hud');
    if (recShotHud) {
      recShotHud.style.display = 'none';
      recShotHud.innerText = '';
    }
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    const preContactCam = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.gameScene.setCameraMode(preContactCam);
    this.controller.setCameraMode(preContactCam);

    const botRank = this.controller.state.bot.rank;
    const difficulty = botRank === 'Legend' ? 'Hard' : (botRank === 'Gold' ? 'Medium' : 'Rookie');
    const isSlowMotion = isPlayerBatting && (difficulty === 'Rookie' || (window as any).tutorialMode);

    this.isBannerActive = false;

    if (isPlayerBatting) {
      const btnBat = document.getElementById('btn-bat-swing');
      if (btnBat) btnBat.innerText = 'PRESS SPACE TO HIT';

      if (isSlowMotion) {
        const isRHB = this.controller.getCurrentInnings().batter.batterHand !== 'LHB';
        let rec = 'Straight Drive [W]';
        if (this.activeDelivery.aimTarget.x > 0.2) {
          rec = isRHB ? 'Off-side Drive [W + D] or [D]' : 'Leg-side Pull [W + A] or [A]';
        } else if (this.activeDelivery.aimTarget.x < -0.2) {
          rec = isRHB ? 'Leg-side Pull [W + A] or [A]' : 'Off-side Drive [W + D] or [D]';
        }
        this.showBattingHelper(rec);
      } else {
        this.showBattingHelper('');
        const recBanner = document.getElementById('recommended-shot-banner');
        if (recBanner) recBanner.style.display = 'none';
      }

      // Start polling for flight progression
      const checkFlight = () => {
        if (!this.isBallActive || !this.activeDelivery) return;
        if (isGamePaused()) { requestAnimationFrame(checkFlight); return; }
        if (!globalAutoAssistConfig.isDeliveryActive) {
          requestAnimationFrame(checkFlight);
          return;
        }
        
        let z = 0;
        const ballMesh = this.gameScene.scene.getMeshByName('cricketBall');
        if (ballMesh) {
          z = ballMesh.position.z;
        } else {
          z = (this.gameScene as any).currentBallPos?.z || 0;
        }
        
        const elapsed = gameNow() - (globalAutoAssistConfig.deliveryStartTime ?? gameNow());
        const reactionTrigger = elapsed >= Math.max(0, deliveryDurationMs(this.activeDelivery.type, this.activeDelivery.pace) * batterContactProgress(this.activeDelivery) - 300);
        const creaseTrigger = z <= BATTER_CONTACT_Z + (this.activeDelivery.batterPosition?.z ?? 0);

        if (creaseTrigger) {
          this.hideAssistedPrompt();
          this.hideBattingHelper();
          return;
        }

        if (reactionTrigger) {
          const recBanner = document.getElementById('recommended-shot-banner');
          if (recBanner) recBanner.style.display = 'none';
          
          const banner = document.getElementById('hit-space-banner');
          if (banner) banner.style.display = 'block';
          this.isBannerActive = true;
        }

        requestAnimationFrame(checkFlight);
      };
      requestAnimationFrame(checkFlight);
    } else {
      this.hideBattingHelper();
    }

    const onArrivedCb = () => {
      if (generation !== this.deliveryGeneration || arrived) return;
      arrived = true;
      this.hideBattingHelper();
      this.hideAssistedPrompt();
      this.isBannerActive = false;
      this.handleBallArrivalAtStumps();
    };
    
    const onResolvedCb = () => {
      if (generation !== this.deliveryGeneration || resolved) return;
      resolved = true;
      // Step 1: Detect that the ball has come to a rest or crossed boundary (triggers this callback)
      this.hideBattingHelper();
      this.hideAssistedPrompt();
      this.isBannerActive = false;
      
      const innings = this.controller.getCurrentInnings();
      const lastBall = innings.balls[innings.balls.length - 1];
      
      let shotDistanceMeters = 0;
      let hasBounced = false;

      if (lastBall && lastBall.shot && !lastBall.missed && !lastBall.isWicket && lastBall.extraType !== 'wide') {
        shotDistanceMeters = this.gameScene.getShotDistance();
        hasBounced = this.gameScene.shotBoundaryOnFull ? false : (globalAutoAssistConfig.hasBounced || false);
        
        const runs = evaluateFinalOutcome(shotDistanceMeters, hasBounced, this.gameScene.shotReachedBoundary);
        
        let title = `${runs} RUNS`;
        let desc = `Shot yielded ${runs} runs.`;
        if (runs === 6) {
           gameSound.play('boundary');
           title = `SIX! ${(shotDistanceMeters || 0).toFixed(1)}m`;
           desc = `Cleared the boundary towards ${getDirectionName(lastBall.shot.direction)}!`;
        } else if (runs === 4) {
           title = `FOUR!`;
           desc = `Bounced over the boundary towards ${getDirectionName(lastBall.shot.direction)}!`;
        } else if (runs === 0) {
           title = `Dot Ball`;
           desc = `Fielded safely. 0 runs.`;
        }
        if (lastBall.extraType === 'noball') desc += ` No-ball: front foot ${((lastBall.delivery.frontFootHeel ?? 0) * 100).toFixed(1)} cm over; one penalty and a free hit.`;
        // Step 2: Freeze the tracking camera target on ball's final location and display scoring result banner for exactly 2.0 seconds
        this.showResultToast(title, desc);
      }

      if (lastBall && lastBall.shot && !lastBall.missed && !lastBall.isWicket && lastBall.extraType !== 'wide') {
        this.controller.finalizeBallOutcome(shotDistanceMeters, hasBounced, this.gameScene.shotReachedBoundary);
        this.updateHUD();
      } else if (lastBall) {
        this.controller.handleInningsCompletion();
      }

      setGameTimeout(() => {
        if (generation !== this.deliveryGeneration) return;
        // Step 3: Fade out and hide the result banner overlay completely
        this.hideResultToast();

        // Step 5: LERP the camera back to crease setup view coordinates and unlock control panels for next delivery
        if (this.controller.state.status === 'playing') {
          const playerCam = this.controller.getActiveCameraMode();
          this.gameScene.setCameraMode(playerCam);
          this.controller.updateActiveCameraMode();
        }
        
        if ((this as any).setupActiveTurn) {
          (this as any).setupActiveTurn();
        }
      }, 2000);

    };

    if (isPlayerBatting) {
      // Bot is bowler
      (this.gameScene as any).onBallArrivedCallback = onArrivedCb;
      (this.gameScene as any).onBallResolvedCallback = onResolvedCb;
      this.cancelBattingRunUp = initBattingDelivery(true, this.gameScene.scene.getMeshByName('cricketBall'), () => {
        this.batterPositionLocked = true;
        if (this.activeDelivery) this.activeDelivery.batterPosition = { ...this.batterPosition };
        this.updateBatterMovementControls();
        gameSound.play('delivery');
      });
    } else {
      // Start delivery trajectory
      gameSound.play('delivery');
      this.gameScene.animateDelivery(
        this.activeDelivery.aimTarget,
        this.activeDelivery.length,
        this.activeDelivery.type,
        onArrivedCb,
        onResolvedCb,
        this.activeDelivery.overTheWicket ?? true,
        () => { // onCreaseCrossed
          this.hideAssistedPrompt();
        },
        isSlowMotion,
        0,
        this.activeDelivery.pace,
        this.activeDelivery.turn,
        this.activeDelivery.swing
      );
    }
  }

  private handleBallArrivalAtStumps(): void {
    // Evaluate outcome
    if (!this.activeDelivery) return;
    
    const outcome = this.controller.recordBall(this.activeDelivery, this.activeShot);
    this.updateHUD();

    this.activeDelivery = null;
    this.activeShot = null;

    let title = '';
    let desc = '';

    if (outcome.isExtra && (!outcome.shot || outcome.missed || outcome.extraType === 'wide')) {
      title = outcome.wicketReason || 'Extra Ball!';
      desc = outcome.extraType === 'noball'
        ? `Front foot ${((outcome.delivery.frontFootHeel ?? 0) * 100).toFixed(1)} cm over the line. Extra ball and free hit.`
        : 'Wide delivery. One penalty run and an extra ball.';
      this.gameScene.animateMissWicket(false);
      this.showResultToast(title, desc);
    } else if (outcome.isWicket) {
      gameSound.play(outcome.wicketReason === 'LBW' ? 'bounce' : 'wicket');
      title = 'WICKET!';
      desc = outcome.wicketReason;
      this.gameScene.animateMissWicket(true);
      this.showResultToast(title, desc);
    } else if (outcome.shot && !outcome.missed) {
      gameSound.play('bat');
      const theta_shot = (outcome.shot.direction * Math.PI) / 4 - Math.PI / 2;
      const quality = Math.max(0, 1 - Math.abs(outcome.shot.timing - 0.5) * 2 - Math.abs(outcome.shot.contactZone - 0.5)) * footworkFactor(outcome.shot.footwork, outcome.delivery.length);
      const batterPower = this.controller.getCurrentInnings().batter.stats.batting.power;
      const vOut = calculateShotTrajectory(quality, 0.5, 0.5, theta_shot, deliveryVelocityAtCrease(outcome.delivery), {x:0, y:0, z:0}, true, false, 'Medium', outcome.shot.type, batterPower);
      
      this.gameScene.animateHitPath(outcome.distance, outcome.shot.direction, vOut);
      this.controller.setCameraMode('follow_shot');
      // Result toast is deferred to onBallResolvedCallback
    } else {
      title = 'Dot Ball';
      desc = outcome.wicketReason || 'A swing and a miss!';
      this.gameScene.animateMissWicket(false);
      this.showResultToast(title, desc);
    }
  }

  // --- Result Toast Management ---

  private showResultToast(title: string, desc: string): void {
    const toast = document.getElementById('result-toast');
    const titleEl = document.getElementById('ball-outcome-title');
    const descEl = document.getElementById('ball-outcome-desc');

    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerText = desc;

    if (toast) {
      toast.classList.remove('hidden');
    }

    if (this.toastDismissTimer) {
      clearGameTimeout(this.toastDismissTimer);
    }

    // Auto-dismiss after 4 seconds
    this.toastDismissTimer = setGameTimeout(() => {
      this.hideResultToast();
    }, 4000);
  }

  private hideResultToast(): void {
    if (this.toastDismissTimer) {
      clearGameTimeout(this.toastDismissTimer);
      this.toastDismissTimer = null;
    }
    const toast = document.getElementById('result-toast');
    if (toast) {
      toast.classList.add('hidden');
    }

    // Reset camera to player perspective when toast dismisses
    if (this.controller.state.status === 'playing') {
      const playerCam = this.controller.getActiveCameraMode();
      this.gameScene.setCameraMode(playerCam);
      this.controller.updateActiveCameraMode();
    }
  }

  // --- Scoreboard and HUD updating ---

  public updateHUD(): void {
    const state = this.controller.state;
    const currentInn = this.controller.getCurrentInnings();
    
    // Batter profile badge
    const batterNameEl = document.getElementById('hud-batter-name');
    if (batterNameEl) batterNameEl.innerText = currentInn.batter.name;

    const batterStatsEl = document.getElementById('hud-batter-stats');
    if (batterStatsEl) {
      batterStatsEl.innerText = `PWR: ${currentInn.batter.stats.batting.power} | TIM: ${currentInn.batter.stats.batting.timing}`;
    }
    
    // Bowler profile badge
    const bowlerNameEl = document.getElementById('hud-bowler-name');
    if (bowlerNameEl) bowlerNameEl.innerText = currentInn.bowler.name;

    const bowlerStatsEl = document.getElementById('hud-bowler-stats');
    if (bowlerStatsEl) {
      bowlerStatsEl.innerText = `ACC: ${currentInn.bowler.stats.bowling.accuracy} | VAR: ${currentInn.bowler.stats.bowling.variation}`;
    }
    
    // Innings Title
    const inningsTitleEl = document.getElementById('hud-innings-title');
    if (inningsTitleEl) {
      inningsTitleEl.innerText = `Innings ${state.currentInningsIndex + 1}`;
    }
    
    // Legal balls count, wickets, runs score, biggest six
    const legalCount = currentInn.ballsBowled;
    const ballLimit = inningsBallLimit(state.tieBreakerActive);
    
    const ballsCountEl = document.getElementById('hud-balls-count');
    if (ballsCountEl) ballsCountEl.innerText = `${legalCount}/${ballLimit}`;

    const wicketsCountEl = document.getElementById('hud-wickets-count');
    if (wicketsCountEl) wicketsCountEl.innerText = `${currentInn.wicketsLost}`;

    const scoreCountEl = document.getElementById('hud-score-count');
    if (scoreCountEl) scoreCountEl.innerText = `${currentInn.score}`;

    const biggestSixEl = document.getElementById('hud-biggest-six');
    if (biggestSixEl) biggestSixEl.innerText = `${currentInn.biggestSix.toFixed(1)}m`;

    // 6-Ball Over Tracker Dynamic Outcome Updates
    const tracker = document.getElementById('over-tracker');
    if (tracker) {
      const balls = currentInn.balls;
      const totalSlots = balls.length + Math.max(0, ballLimit - legalCount);

      // Ensure tracker has exact number of slots (at least 6)
      while (tracker.children.length < totalSlots) {
        const dot = document.createElement('span');
        dot.className = 'over-dot gray empty upcoming';
        tracker.appendChild(dot);
      }
      while (tracker.children.length > totalSlots) {
        tracker.removeChild(tracker.lastChild!);
      }

      const dots = tracker.querySelectorAll('.over-dot');
      for (let i = 0; i < totalSlots; i++) {
        const dot = dots[i] as HTMLElement;
        if (i < balls.length) {
          const outcome = balls[i];
          if (outcome.isWicket) {
            // Red dot: Wicket
            dot.className = 'over-dot red wicket';
            dot.textContent = 'W';
            dot.title = `Ball ${i + 1}: Wicket (${outcome.wicketReason || 'Dismissed'})`;
          } else if (outcome.isExtra || outcome.extraType) {
            // Blue dot: Extra ball (Wide / No-ball)
            dot.className = 'over-dot blue extra';
            dot.textContent = outcome.extraType === 'wide' ? 'WD' : (outcome.extraType === 'noball' ? `NB${outcome.runs || ''}` : 'EX');
            dot.title = `Ball ${i + 1}: ${outcome.extraType === 'noball' ? 'No-ball' : 'Wide'} (+1 penalty${outcome.runs ? `, ${outcome.runs} off the bat` : ''})`;
          } else if (outcome.isFreeHit && !outcome.runs) {
            // Blue dot: Free hit delivery
            dot.className = 'over-dot blue extra free-hit';
            dot.textContent = 'FH';
            dot.title = `Ball ${i + 1}: Free Hit Delivery (Dot Ball - 0 runs)`;
          } else if (outcome.runs === 6) {
            // Gold dot: SIX scored (6 runs)
            dot.className = 'over-dot gold six';
            dot.textContent = '6';
            dot.title = `Ball ${i + 1}: SIX! (${outcome.distance.toFixed(1)}m)`;
          } else {
            dot.className = 'over-dot green legal';
            dot.textContent = outcome.runs ? String(outcome.runs) : '•';
            dot.title = `Ball ${i + 1}: ${outcome.runs || 0} runs`;
          }
        } else {
          // Gray/Empty outline: Upcoming/unbowled
          dot.className = 'over-dot gray empty upcoming';
          dot.textContent = `${i + 1}`;
          dot.title = `Ball ${i + 1}: Upcoming`;
        }
      }
    }

    const opponentBadge = document.getElementById('opponent-badge');
    if (opponentBadge) {
      const isPlayerBatting = currentInn.batter.id === state.player.id;
      if (isPlayerBatting) {
        opponentBadge.innerText = `Opponent: ${currentInn.bowler.name} | Right-Arm Fast`;
      } else {
        opponentBadge.innerText = `Opponent: ${currentInn.batter.name} | RHB`;
      }
    }
  }

  public setupActiveTurn(): void {
    this.cancelPendingDelivery();
    this.deliveryStarted = false;
    this.isBallActive = false;
    const state = this.controller.state;
    
    if (state.status === 'completed') {
      this.showGameOverScreen();
      return;
    }

    const innings = this.controller.getCurrentInnings();
    globalAutoAssistConfig.bowlerArm = innings.bowler.bowlingArm || 'Right';
    const isPlayerBatting = innings.batter.id === state.player.id;
    
    this.gameScene.isBotBatting = !isPlayerBatting;

    this.updateHUD();

    const opponentBadge = document.getElementById('opponent-badge');
    if (opponentBadge) {
      if (isPlayerBatting) {
        opponentBadge.innerText = `Opponent: ${innings.bowler.name} | Right-Arm Fast`;
      } else {
        opponentBadge.innerText = `Opponent: ${innings.batter.name} | RHB`;
      }
    }

    const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');

    if (isPlayerBatting) {
      // Batter mode
      this.batterPositionLocked = false;
      this.gameScene.setPlayerCreaseOffset(-0.35 + this.batterPosition.x, this.batterPosition.z);
      this.updateBatterMovementControls();
      this.gameScene.setCameraMode('batter_eye');
      this.controller.setCameraMode('batter_eye');
      if (controlBatting) {
        controlBatting.classList.remove('hidden', 'panel-hidden');
      }
      const btnBat = document.getElementById('btn-bat-swing');
      if (btnBat) {
        btnBat.innerText = 'Select Shot & Direction';
      }
      if (controlBowling) {
        controlBowling.classList.add('hidden', 'panel-hidden');
      }
      
      // Auto trigger bot delivery
      this.activeDelivery = botChooseDelivery(state.bot, this.controller.botDifficulty, innings.batter.batterHand || 'RHB');
      this.gameScene.setBowlerSide(this.activeDelivery.overTheWicket ?? true, this.activeDelivery.bowlingArm || 'Right');
      this.activeDelivery.batterPosition = { ...this.batterPosition };
      this.touchBattingControls.setLocked(false);
      this.touchBattingControls.setSuggestion(suggestedShotDirection(this.activeDelivery));
      this.gameScene.updateBounceMarker(deliveryPitchPoint(this.activeDelivery));
      globalAutoAssistConfig.currentDelivery = this.activeDelivery;

      const generation = this.deliveryGeneration;
      this.botDeliveryTimer = setGameTimeout(() => {
        if (generation !== this.deliveryGeneration) return;
        this.botDeliveryTimer = null;
        this.deliverBall3D();
      }, 1500);
    } else {
      // Bowler mode
      this.gameScene.setPlayerCreaseOffset(-0.35, 0);
      this.gameScene.setBowlerSide(this.overTheWicket, innings.bowler.bowlingArm || 'Right');
      this.gameScene.setCameraMode('bowler_eye');
      this.controller.setCameraMode('bowler_eye');
      if (controlBowling) {
        controlBowling.classList.remove('hidden', 'panel-hidden');
      }
      if (controlBatting) {
        controlBatting.classList.add('hidden', 'panel-hidden');
      }
    }
    this.keyboardInputManager.updateFeedbackOverlay();
  }

  private showGameOverScreen(): void {
    this.hideResultToast();
    this.keyboardInputManager.closeHelpModal();

    const state = this.controller.state;
    const playerInnings = state.innings.find(i => i.batter.id === state.player.id);
    const botInnings = state.innings.find(i => i.batter.id === state.bot.id);

    const playerSixes = playerInnings ? playerInnings.balls.filter(b => b.runs === 6).length : 0;
    const botSixes = botInnings ? botInnings.balls.filter(b => b.runs === 6).length : 0;
    const playerCarry = playerInnings ? playerInnings.balls.reduce((acc, b) => acc + b.distance, 0) : 0;
    const botCarry = botInnings ? botInnings.balls.reduce((acc, b) => acc + b.distance, 0) : 0;

    // 1. Winner Banner & Banner Styling
    const bannerEl = document.getElementById('summary-winner-banner');
    const iconEl = document.getElementById('summary-winner-icon');
    const titleEl = document.getElementById('summary-winner-title');
    const subtitleEl = document.getElementById('summary-winner-subtitle');
    const playerStatusBadge = document.getElementById('summary-player-status-badge');
    const botStatusBadge = document.getElementById('summary-bot-status-badge');

    if (state.winnerId === state.player.id) {
      if (bannerEl) bannerEl.className = 'winner-banner won';
      if (iconEl) iconEl.innerText = '🏆';
      if (titleEl) titleEl.innerText = 'YOU WON!';
      if (subtitleEl) subtitleEl.innerText = 'Dominant Six-Hitting Performance!';
      if (playerStatusBadge) {
        playerStatusBadge.innerText = 'WINNER';
        playerStatusBadge.className = 'scorecard-status-badge winner';
      }
      if (botStatusBadge) {
        botStatusBadge.innerText = 'RUNNER-UP';
        botStatusBadge.className = 'scorecard-status-badge runner-up';
      }
    } else if (state.winnerId === state.bot.id) {
      if (bannerEl) bannerEl.className = 'winner-banner lost';
      if (iconEl) iconEl.innerText = '⚡';
      if (titleEl) titleEl.innerText = 'BOT WON!';
      if (subtitleEl) subtitleEl.innerText = `${state.bot.name} took the crown this time!`;
      if (playerStatusBadge) {
        playerStatusBadge.innerText = 'RUNNER-UP';
        playerStatusBadge.className = 'scorecard-status-badge runner-up';
      }
      if (botStatusBadge) {
        botStatusBadge.innerText = 'WINNER';
        botStatusBadge.className = 'scorecard-status-badge winner';
      }
    } else {
      if (bannerEl) bannerEl.className = 'winner-banner tied';
      if (iconEl) iconEl.innerText = '🤝';
      if (titleEl) titleEl.innerText = "IT'S A TIE!";
      if (subtitleEl) subtitleEl.innerText = 'Dead heat across all decider tiers!';
      if (playerStatusBadge) {
        playerStatusBadge.innerText = 'TIED';
        playerStatusBadge.className = 'scorecard-status-badge tied';
      }
      if (botStatusBadge) {
        botStatusBadge.innerText = 'TIED';
        botStatusBadge.className = 'scorecard-status-badge tied';
      }
    }

    // 2. XP Badge & Dynamic Calculation Display
    const prog = state.progression || {
      xpGained: state.winnerId === state.player.id ? 100 : (state.winnerId === null ? 50 : 30),
      baseXP: state.winnerId === state.player.id ? 100 : (state.winnerId === null ? 50 : 30),
      sixBonusXP: playerSixes * 10,
      sixesCount: playerSixes,
      statUpgraded: undefined
    };

    const xpValEl = document.getElementById('summary-xp-val');
    if (xpValEl) xpValEl.innerText = `+${prog.xpGained} XP`;

    const progXpEl = document.getElementById('summary-progression-xp');
    if (progXpEl) progXpEl.innerText = `+${prog.xpGained} XP`;

    const progBreakdownEl = document.getElementById('summary-progression-breakdown');
    if (progBreakdownEl) {
      const outcomeText = state.winnerId === state.player.id ? 'Win' : (state.winnerId === null ? 'Draw' : 'Match');
      progBreakdownEl.innerText = `+${prog.baseXP} ${outcomeText} + ${prog.sixBonusXP} (${prog.sixesCount} 6s)`;
    }

    const progRankEl = document.getElementById('summary-progression-rank');
    if (progRankEl) progRankEl.innerText = `${state.player.rank} (${state.player.xp} XP)`;

    const progStatEl = document.getElementById('summary-progression-stat');
    if (progStatEl) {
      if (prog.statUpgraded) {
        progStatEl.innerText = `${prog.statUpgraded.statName} +${prog.statUpgraded.increase} (Now ${prog.statUpgraded.newValue})`;
      } else {
        progStatEl.innerText = 'Attributes Maxed';
      }
    }

    // 3. Tie-Break Ladder Explanation
    const tiebreakBox = document.getElementById('summary-tiebreak-box');
    const deciderTierEl = document.getElementById('summary-decider-tier');
    const deciderDescEl = document.getElementById('summary-decider-desc');

    if (state.tieBreakDetails) {
      if (deciderTierEl) deciderTierEl.innerText = state.tieBreakDetails.tierLabel;
      if (deciderDescEl) deciderDescEl.innerText = state.tieBreakDetails.marginText;
      if (tiebreakBox) tiebreakBox.classList.remove('hidden');
    } else {
      const winSix = Math.max(playerInnings?.biggestSix || 0, botInnings?.biggestSix || 0);
      const loseSix = Math.min(playerInnings?.biggestSix || 0, botInnings?.biggestSix || 0);
      if (deciderTierEl) deciderTierEl.innerText = 'Single Biggest Six';
      if (deciderDescEl) deciderDescEl.innerText = `Won via Single Biggest Six: ${winSix.toFixed(1)}m vs ${loseSix.toFixed(1)}m`;
      if (tiebreakBox) tiebreakBox.classList.remove('hidden');
    }

    // 4. Match Scorecards Stats Breakdown
    // Player Scorecard
    const playerNameEl = document.getElementById('summary-player-name');
    if (playerNameEl) playerNameEl.innerText = `${state.player.name} (${state.player.batterHand || 'RHB'})`;

    const playerBowlerEl = document.getElementById('summary-player-bowler');
    if (playerBowlerEl) playerBowlerEl.innerText = `vs ${botInnings ? botInnings.batter.name : state.bot.name}`;

    const playerSixEl = document.getElementById('summary-player-six');
    if (playerSixEl) playerSixEl.innerText = `${playerInnings ? playerInnings.biggestSix.toFixed(1) : '0.0'}m`;

    const playerRunsEl = document.getElementById('summary-player-runs');
    if (playerRunsEl) playerRunsEl.innerText = `${playerInnings ? playerInnings.score : 0}`;

    const playerWicketsEl = document.getElementById('summary-player-wickets');
    if (playerWicketsEl) playerWicketsEl.innerText = `${playerInnings ? playerInnings.wicketsLost : 0}/${playerInnings ? playerInnings.maxWickets : 1}`;

    const playerTotalEl = document.getElementById('summary-player-total');
    if (playerTotalEl) playerTotalEl.innerText = `${playerCarry.toFixed(1)}m`;

    const playerSixCountEl = document.getElementById('summary-player-six-count');
    if (playerSixCountEl) playerSixCountEl.innerText = `${playerSixes}`;

    this.renderMiniTracker('summary-player-tracker', playerInnings?.balls || []);

    // Bot Scorecard
    const botNameEl = document.getElementById('summary-bot-name');
    if (botNameEl) botNameEl.innerText = `${state.bot.name}`;

    const botBowlerEl = document.getElementById('summary-bot-bowler');
    if (botBowlerEl) botBowlerEl.innerText = `vs ${playerInnings ? playerInnings.batter.name : state.player.name}`;

    const botSixEl = document.getElementById('summary-bot-six');
    if (botSixEl) botSixEl.innerText = `${botInnings ? botInnings.biggestSix.toFixed(1) : '0.0'}m`;

    const botRunsEl = document.getElementById('summary-bot-runs');
    if (botRunsEl) botRunsEl.innerText = `${botInnings ? botInnings.score : 0}`;

    const botWicketsEl = document.getElementById('summary-bot-wickets');
    if (botWicketsEl) botWicketsEl.innerText = `${botInnings ? botInnings.wicketsLost : 0}/${botInnings ? botInnings.maxWickets : 1}`;

    const botTotalEl = document.getElementById('summary-bot-total');
    if (botTotalEl) botTotalEl.innerText = `${botCarry.toFixed(1)}m`;

    const botSixCountEl = document.getElementById('summary-bot-six-count');
    if (botSixCountEl) botSixCountEl.innerText = `${botSixes}`;

    this.renderMiniTracker('summary-bot-tracker', botInnings?.balls || []);

    // 5. Save personal best to Leaderboard
    if (this.recordedSummary !== state) {
      addLeaderboardEntry({
        date: new Date().toLocaleDateString(),
        opponent: state.bot.name,
        biggestSix: playerInnings?.biggestSix ?? 0,
        wicketsLost: playerInnings ? playerInnings.wicketsLost : 0,
        outcome: state.winnerId === state.player.id ? 'WON' : (state.winnerId === state.bot.id ? 'LOST' : 'TIED')
      });
      this.recordedSummary = state;
    }

    // 6. Show the modal overlay
    const modal = document.getElementById('match-summary-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('active');
    }
  }

  private renderMiniTracker(containerId: string, balls: BallOutcome[]): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (balls.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'mini-dot empty';
      emptySpan.textContent = 'No deliveries';
      container.appendChild(emptySpan);
      return;
    }

    balls.forEach((ball, idx) => {
      const dot = document.createElement('span');
      if (ball.isWicket) {
        dot.className = 'mini-dot wicket';
        dot.textContent = 'W';
        dot.title = `Ball ${idx + 1}: Wicket - ${ball.wicketReason || 'Out'}`;
      } else if (ball.isExtra || ball.extraType) {
        dot.className = 'mini-dot extra';
        dot.textContent = ball.extraType === 'wide' ? 'WD' : `NB${ball.runs || ''}`;
        dot.title = `Ball ${idx + 1}: Extra (+1 penalty${ball.runs ? `, ${ball.runs} off the bat` : ''})`;
      } else if (ball.runs === 6) {
        dot.className = 'mini-dot six';
        dot.textContent = `${Math.round(ball.distance)}m`;
        dot.title = `Ball ${idx + 1}: SIX! (${ball.distance.toFixed(1)}m)`;
      } else {
        dot.className = 'mini-dot dot';
        dot.textContent = ball.runs ? String(ball.runs) : '•';
        dot.title = `Ball ${idx + 1}: ${ball.runs || 0} runs`;
      }
      container.appendChild(dot);
    });
  }

  public handleRematch(): void {
    this.batterPosition = { x: 0, z: 0 };
    this.batterPositionLocked = false;
    this.cancelPendingDelivery();
    this.deliveryStarted = false;
    // 1. Hide summary modal
    const modal = document.getElementById('match-summary-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('active');
    }

    // 2. Reset controller match state and camera
    this.controller.reset();
    this.gameScene.setCameraMode('stadium_wide');

    // 3. Clear active in-flight balls and timing meter
    this.activeDelivery = null;
    this.activeShot = null;
    this.isBallActive = false;
    this.hideResultToast();

    // 4. Reset HUD & 6-Ball Over Tracker to 6 unbowled gray dots
    const tracker = document.getElementById('over-tracker');
    if (tracker) {
      tracker.innerHTML = '';
      for (let i = 1; i <= 6; i++) {
        const dot = document.createElement('span');
        dot.className = 'over-dot gray empty upcoming';
        dot.textContent = `${i}`;
        dot.title = `Ball ${i}: Upcoming`;
        tracker.appendChild(dot);
      }
    }

    const scoreCountEl = document.getElementById('hud-score-count');
    if (scoreCountEl) scoreCountEl.innerText = '0';

    const wicketsCountEl = document.getElementById('hud-wickets-count');
    if (wicketsCountEl) wicketsCountEl.innerText = '0';

    const ballsCountEl = document.getElementById('hud-balls-count');
    if (ballsCountEl) ballsCountEl.innerText = '0/6';

    const biggestSixEl = document.getElementById('hud-biggest-six');
    if (biggestSixEl) biggestSixEl.innerText = '0.0m';

    // 5. Reset Toss Screen UI and switch directly to Toss screen
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById('screen-toss')?.classList.add('active');

    const coin = document.getElementById('coin');
    if (coin) {
      coin.innerText = '?';
      coin.className = 'coin';
    }

    document.getElementById('toss-result-message')?.classList.add('hidden');
    document.getElementById('toss-choice-buttons')?.classList.add('hidden');
    document.getElementById('btn-start-match')?.classList.add('hidden');

    const headsBtn = document.getElementById('btn-toss-heads') as HTMLButtonElement;
    const tailsBtn = document.getElementById('btn-toss-tails') as HTMLButtonElement;
    if (headsBtn) headsBtn.disabled = false;
    if (tailsBtn) tailsBtn.disabled = false;
  }

  public handleReturnToLobby(): void {
    this.cancelPendingDelivery();
    // 1. Hide summary modal
    const modal = document.getElementById('match-summary-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('active');
    }

    this.gameScene.setCameraMode('stadium_wide');

    // 2. Switch to lobby screen
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById('screen-lobby')?.classList.add('active');

    // 3. Refresh lobby profile and leaderboard
    this.refreshLobbyView();
  }

  private refreshLobbyView(): void {
    renderProfile(this.controller.state.player);
    renderLeaderboard();
  }
}

export interface RankProgress {
  currentRank: 'Bronze' | 'Silver' | 'Gold' | 'Elite' | 'Legend';
  nextRank: string;
  rankIcon: string;
  rankClass: string;
  currentXp: number;
  tierMinXp: number;
  tierMaxXp: number;
  xpInTier: number;
  xpNeededForTier: number;
  percent: number;
  nextRankText: string;
}

export function getRankProgress(xp: number): RankProgress {
  const currentXp = Math.max(0, xp || 0);
  if (currentXp >= 1000) {
    return {
      currentRank: 'Legend',
      nextRank: 'MAX',
      rankIcon: '👑',
      rankClass: 'rank-legend',
      currentXp,
      tierMinXp: 1000,
      tierMaxXp: 1000,
      xpInTier: currentXp - 1000,
      xpNeededForTier: 0,
      percent: 100,
      nextRankText: 'Master Tier • Max Rank Achieved'
    };
  } else if (currentXp >= 600) {
    const tierMin = 600;
    const tierMax = 1000;
    const needed = tierMax - tierMin;
    const current = currentXp - tierMin;
    const percent = Math.min(100, Math.max(0, Math.round((current / needed) * 100)));
    return {
      currentRank: 'Elite',
      nextRank: 'Legend',
      rankIcon: '💎',
      rankClass: 'rank-elite',
      currentXp,
      tierMinXp: tierMin,
      tierMaxXp: tierMax,
      xpInTier: current,
      xpNeededForTier: needed,
      percent,
      nextRankText: `${tierMax - currentXp} XP to Legend (Tier 5)`
    };
  } else if (currentXp >= 300) {
    const tierMin = 300;
    const tierMax = 600;
    const needed = tierMax - tierMin;
    const current = currentXp - tierMin;
    const percent = Math.min(100, Math.max(0, Math.round((current / needed) * 100)));
    return {
      currentRank: 'Gold',
      nextRank: 'Elite',
      rankIcon: '🥇',
      rankClass: 'rank-gold',
      currentXp,
      tierMinXp: tierMin,
      tierMaxXp: tierMax,
      xpInTier: current,
      xpNeededForTier: needed,
      percent,
      nextRankText: `${tierMax - currentXp} XP to Elite (Tier 4)`
    };
  } else if (currentXp >= 100) {
    const tierMin = 100;
    const tierMax = 300;
    const needed = tierMax - tierMin;
    const current = currentXp - tierMin;
    const percent = Math.min(100, Math.max(0, Math.round((current / needed) * 100)));
    return {
      currentRank: 'Silver',
      nextRank: 'Gold',
      rankIcon: '🥈',
      rankClass: 'rank-silver',
      currentXp,
      tierMinXp: tierMin,
      tierMaxXp: tierMax,
      xpInTier: current,
      xpNeededForTier: needed,
      percent,
      nextRankText: `${tierMax - currentXp} XP to Gold (Tier 3)`
    };
  } else {
    const tierMin = 0;
    const tierMax = 100;
    const needed = tierMax - tierMin;
    const current = currentXp;
    const percent = Math.min(100, Math.max(0, Math.round((current / needed) * 100)));
    return {
      currentRank: 'Bronze',
      nextRank: 'Silver',
      rankIcon: '🥉',
      rankClass: 'rank-bronze',
      currentXp,
      tierMinXp: tierMin,
      tierMaxXp: tierMax,
      xpInTier: current,
      xpNeededForTier: needed,
      percent,
      nextRankText: `${tierMax - currentXp} XP to Silver (Tier 2)`
    };
  }
}

export function renderProfile(player: Player): void {
  // Ensure Stats popover triggers are wired
  initStatsPopover();

  const nameEl = document.getElementById('profile-name');
  if (nameEl) nameEl.innerText = player.name;

  const rankProgress = getRankProgress(player.xp || 0);

  const rankEl = document.getElementById('profile-rank');
  if (rankEl) rankEl.innerText = rankProgress.currentRank;

  const rankBadgeEl = document.getElementById('profile-rank-badge');
  if (rankBadgeEl) {
    rankBadgeEl.className = `rank-tier-badge ${rankProgress.rankClass}`;
  }

  const rankIconEl = document.getElementById('profile-rank-icon');
  if (rankIconEl) {
    rankIconEl.innerText = rankProgress.rankIcon;
  }

  const xpEl = document.getElementById('profile-xp');
  if (xpEl) xpEl.innerText = (player.xp || 0).toString();

  const xpNextEl = document.getElementById('profile-xp-next');
  if (xpNextEl) {
    xpNextEl.innerText = rankProgress.currentRank === 'Legend' ? 'MAX' : rankProgress.tierMaxXp.toString();
  }

  const xpFillEl = document.getElementById('profile-xp-fill');
  if (xpFillEl) {
    xpFillEl.style.width = `${rankProgress.percent}%`;
  }

  const xpPercentEl = document.getElementById('profile-xp-percent');
  if (xpPercentEl) {
    xpPercentEl.innerText = `${rankProgress.percent}%`;
  }

  const xpDescEl = document.getElementById('profile-xp-next-desc');
  if (xpDescEl) {
    xpDescEl.innerText = rankProgress.nextRankText;
  }

  // Batting stats
  const batPower = document.getElementById('stat-bat-power');
  if (batPower && player.stats?.batting?.power !== undefined) batPower.innerText = player.stats.batting.power.toString();
  const meterBatPower = document.getElementById('stat-meter-bat-power');
  if (meterBatPower && player.stats?.batting?.power !== undefined) meterBatPower.style.width = `${player.stats.batting.power}%`;

  const batTiming = document.getElementById('stat-bat-timing');
  if (batTiming && player.stats?.batting?.timing !== undefined) batTiming.innerText = player.stats.batting.timing.toString();
  const meterBatTiming = document.getElementById('stat-meter-bat-timing');
  if (meterBatTiming && player.stats?.batting?.timing !== undefined) meterBatTiming.style.width = `${player.stats.batting.timing}%`;

  const batTech = document.getElementById('stat-bat-tech');
  if (batTech && player.stats?.batting?.technique !== undefined) batTech.innerText = player.stats.batting.technique.toString();
  const meterBatTech = document.getElementById('stat-meter-bat-tech');
  if (meterBatTech && player.stats?.batting?.technique !== undefined) meterBatTech.style.width = `${player.stats.batting.technique}%`;

  // Bowling stats
  const bowlAcc = document.getElementById('stat-bowl-acc');
  if (bowlAcc && player.stats?.bowling?.accuracy !== undefined) bowlAcc.innerText = player.stats.bowling.accuracy.toString();
  const meterBowlAcc = document.getElementById('stat-meter-bowl-acc');
  if (meterBowlAcc && player.stats?.bowling?.accuracy !== undefined) meterBowlAcc.style.width = `${player.stats.bowling.accuracy}%`;

  const bowlVar = document.getElementById('stat-bowl-var');
  if (bowlVar && player.stats?.bowling?.variation !== undefined) bowlVar.innerText = player.stats.bowling.variation.toString();
  const meterBowlVar = document.getElementById('stat-meter-bowl-var');
  if (meterBowlVar && player.stats?.bowling?.variation !== undefined) meterBowlVar.style.width = `${player.stats.bowling.variation}%`;

  const bowlPace = document.getElementById('stat-bowl-pace');
  if (bowlPace && player.stats?.bowling?.pace !== undefined) bowlPace.innerText = player.stats.bowling.pace.toString();
  const meterBowlPace = document.getElementById('stat-meter-bowl-pace');
  if (meterBowlPace && player.stats?.bowling?.pace !== undefined) meterBowlPace.style.width = `${player.stats.bowling.pace}%`;
}

let statsPopoverEscapeListenerBound = false;

export function initStatsPopover(): void {
  const btnViewStats = document.getElementById('btn-view-stats');
  const popover = document.getElementById('player-stats-popover');
  const btnClose = document.getElementById('btn-stats-close');
  const backdrop = document.getElementById('stats-popover-backdrop');

  if (btnViewStats && popover) {
    btnViewStats.onclick = (e) => {
      e.stopPropagation();
      popover.classList.toggle('hidden');
    };
  }

  if (btnClose && popover) {
    btnClose.onclick = (e) => {
      e.stopPropagation();
      popover.classList.add('hidden');
    };
  }

  if (backdrop && popover) {
    backdrop.onclick = () => {
      popover.classList.add('hidden');
    };
  }

  if (!statsPopoverEscapeListenerBound && typeof window !== 'undefined') {
    statsPopoverEscapeListenerBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popover && !popover.classList.contains('hidden')) {
        popover.classList.add('hidden');
      }
    });
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => initStatsPopover());
  } else {
    initStatsPopover();
  }
}

export function renderLeaderboard(): void {
  const leaderboardBody = document.getElementById('leaderboard-body');
  if (!leaderboardBody) return;

  const entries = readLeaderboard();

  if (entries.length > 0) {
    leaderboardBody.innerHTML = '';
    entries.forEach((entry, index) => {
      const row = document.createElement('tr');
      row.className = `leaderboard-row ${index === 0 ? 'top-rank' : ''}`;

      const rankMedal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
      const outcome = entry.outcome;
      const outcomeClass = outcome === 'WON' ? 'badge-won' : (outcome === 'LOST' ? 'badge-lost' : 'badge-tied');
      const wicketsVal = entry.wicketsLost;
      const sixVal = entry.biggestSix.toFixed(1);

      row.innerHTML = `
        <td class="col-rank">
          <span class="leaderboard-rank-pill rank-pos-${index + 1}">#${index + 1} ${rankMedal}</span>
        </td>
        <td class="col-opponent">
          <span class="opponent-name"></span>
        </td>
        <td class="col-six">
          <strong class="six-stat"><span class="fire-icon">💥</span> ${sixVal}m</strong>
        </td>
        <td class="col-wickets">
          <span class="wickets-stat ${wicketsVal === 0 ? 'flawless' : 'lost'}">${wicketsVal}/6</span>
        </td>
        <td class="col-outcome">
          <span class="badge ${outcomeClass}">${outcome}</span>
        </td>
      `;
      row.querySelector('.opponent-name')!.textContent = entry.opponent;
      leaderboardBody.appendChild(row);
    });
  } else {
    leaderboardBody.innerHTML = '<tr class="empty-row"><td colspan="5">No matches played yet. Step onto the pitch to set your high score!</td></tr>';
  }
}
