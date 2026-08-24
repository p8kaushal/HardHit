import { MatchController } from './game';
import { GameScene } from './scene';
import { DeliveryChoice, Player, ShotChoice, ShotType } from './types';
import { botChooseShot } from './bot';
import { checkExtraBall, getLineTypeFromAimX, SIX_THRESHOLD } from './formula';
import { KeyboardInputManager } from './input';

export class UIManager {
  private controller: MatchController;
  private gameScene: GameScene;
  private keyboardInputManager: KeyboardInputManager;

  // Gesture/Swipe Tracking
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartPosTime = 0;
  private isPointerDown = false;
  
  // Aiming Target (Bowling Crease Coordinate offsets)
  private currentAimTargetX = 0;
  private currentAimTargetZ = 12.0; // good length default
  
  // Timing Meter
  private isTimingBarActive = false;
  private timingCursorVal = 0;
  private timingDirection = 1;
  
  // Active deliveries / shots
  public isBallActive = false;
  private activeDelivery: DeliveryChoice | null = null;
  private activeShot: ShotChoice | null = null;
  private deliveryStartFrame = 0;
  
  // Selections
  private selectedShotType: ShotType = 'lofted';
  private selectedBowlType: 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin' = 'fast';

  // Result Toast Auto-dismiss Timer
  private toastDismissTimer: any = null;
  private botDeliveryTimer: any = null;

  public setController(controller: MatchController) {
    this.controller = controller;
  }

  constructor(controller: MatchController) {
    this.controller = controller;
    this.gameScene = new GameScene('game-canvas');
    this.keyboardInputManager = new KeyboardInputManager(
      () => this.controller.getCurrentInnings().batter.id === this.controller.state.player.id,
      () => this.startBowlingReleaseMeter(),
      () => this.triggerReleaseMeter(),
      (direction, type) => this.executeBattingSwingGesture(direction, type),
      () => this.controller.getCurrentInnings().batter.batterHand || 'RHB'
    );
    this.initEventListeners();
    this.updateHUD();

    this.gameScene.botBattingTriggerCallback = () => {
      const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
      if (!isPlayerBatting && this.pendingBotShot && !this.activeShot) {
        const difficulty = this.controller.state.bot.rank === 'Legend' ? 'Hard' : (this.controller.state.bot.rank === 'Gold' ? 'Medium' : 'Easy');
        let offset = 0;
        if (difficulty === 'Easy') {
          offset = (Math.random() - 0.5) * 0.16;
        } else if (difficulty === 'Medium') {
          offset = (Math.random() - 0.5) * 0.08;
        } else if (difficulty === 'Hard') {
          offset = (Math.random() - 0.5) * 0.02;
        }
        const simulatedTiming = 0.5 + offset;
        this.executeBattingSwingGesture(this.pendingBotShot.direction, this.pendingBotShot.type, Math.max(0.0, Math.min(1.0, simulatedTiming)));
      }
    };
  }

  private initEventListeners(): void {
    const canvas = document.getElementById('game-canvas')!;

    // Touch & Pointer gesture handlers for pitch aiming & batting swipes
    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));

    // Shot selector
    const batTypeButtons = document.querySelectorAll('#bat-type-group .btn');
    batTypeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        batTypeButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        this.selectedShotType = target.getAttribute('data-val') as ShotType;
        this.keyboardInputManager.intent.shotType = this.selectedShotType;
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bowl type selector
    const bowlTypeButtons = document.querySelectorAll('#bowl-type-group .btn');
    bowlTypeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        bowlTypeButtons.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        this.selectedBowlType = target.getAttribute('data-val') as any;
        this.keyboardInputManager.intent.deliveryType = this.selectedBowlType;
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
        const lineVal = target.getAttribute('data-val');
        const hand = this.controller.getCurrentInnings().batter.batterHand || 'RHB';
        let aimX = 0.0;
        if (lineVal === 'off') {
          aimX = hand === 'RHB' ? -0.8 : 0.8;
        } else if (lineVal === 'leg') {
          aimX = hand === 'RHB' ? 0.8 : -0.8;
        }
        this.keyboardInputManager.intent.aimX = aimX;
        this.currentAimTargetX = this.keyboardInputManager.intent.aimX;
        
        // Redraw landing shadow disc marker
        this.gameScene.updateBounceMarker({ x: this.currentAimTargetX, z: this.currentAimTargetZ });
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
        const lenVal = target.getAttribute('data-val');
        if (lenVal === 'yorker') this.keyboardInputManager.intent.aimZ = 18.0;
        else if (lenVal === 'full') this.keyboardInputManager.intent.aimZ = 15.0;
        else if (lenVal === 'good') this.keyboardInputManager.intent.aimZ = 12.0;
        else if (lenVal === 'short') this.keyboardInputManager.intent.aimZ = 9.0;
        else if (lenVal === 'bouncer') this.keyboardInputManager.intent.aimZ = 6.0;
        this.currentAimTargetZ = this.keyboardInputManager.intent.aimZ;

        // Redraw landing shadow disc marker
        this.gameScene.updateBounceMarker({ x: this.currentAimTargetX, z: this.currentAimTargetZ });
        this.keyboardInputManager.updateFeedbackOverlay();
      });
    });

    // Bat Clock direction selectors sync
    const clockButtons = document.querySelectorAll('#aim-clock .clock-btn');
    clockButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
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
    btnBowl.addEventListener('mousedown', () => this.startBowlingReleaseMeter());
    btnBowl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startBowlingReleaseMeter();
    });

    const btnBat = document.getElementById('btn-bat-swing')!;
    btnBat.addEventListener('mousedown', () => this.executeKeyboardBatSwing());
    btnBat.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.executeKeyboardBatSwing();
    });

    // Help button and modal listeners
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

    // Stats Popover Listeners
    initStatsPopover();

    // Global listeners
    window.addEventListener('mouseup', () => this.triggerReleaseMeter());
    window.addEventListener('touchend', () => this.triggerReleaseMeter());
  }

  // --- Pointer & Aim Gesture Recognition ---

  private handlePointerDown(e: PointerEvent): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    this.isPointerDown = true;
    this.swipeStartX = e.clientX;
    this.swipeStartY = e.clientY;
    this.swipeStartPosTime = Date.now();

    // In bowling phase, tap position directly sets aim target on pitch
    if (!isPlayerBatting) {
      this.updateBowlingAim(e);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isPointerDown) return;
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (!isPlayerBatting) {
      this.updateBowlingAim(e);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (isPlayerBatting) {
      // Resolve batting swipe gesture
      const dx = e.clientX - this.swipeStartX;
      const dy = e.clientY - this.swipeStartY;
      const dt = Date.now() - this.swipeStartPosTime;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 30) {
        // Swipe detected! Determine angle (0-7 clock direction)
        // 0 points straight up (Z-axis direction), angles rotate clockwise
        let angle = Math.atan2(dx, -dy); // Y axis pointing down on screens
        if (angle < 0) angle += Math.PI * 2;
        const clockDirection = Math.round((angle / (Math.PI * 2)) * 8) % 8;

        // Swipe speed determines lofted/power vs grounded/defensive
        const speed = dist / dt;
        let shotType = this.selectedShotType;
        if (speed > 1.2) {
          shotType = 'power';
        } else if (speed > 0.6) {
          shotType = 'lofted';
        } else {
          shotType = 'grounded';
        }

        this.executeBattingSwingGesture(clockDirection, shotType);
      }
    }
  }

  private updateBowlingAim(e: PointerEvent): void {
    const canvas = document.getElementById('game-canvas')!;
    const rect = canvas.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width; // 0 to 1
    const relativeY = (e.clientY - rect.top) / rect.height; // 0 to 1

    // Map X to Line offset (-1.5 to 1.5 meters)
    this.currentAimTargetX = (relativeX - 0.5) * 3.0;
    // Map Y to Length offset (Z-axis distance from crease 3m to 19m)
    this.currentAimTargetZ = 4.0 + (1.0 - relativeY) * 15.0;

    // Redraw landing shadow disc marker
    this.gameScene.updateBounceMarker({ x: this.currentAimTargetX, z: this.currentAimTargetZ });
  }

  // --- Release Meter Animations ---

  private startBowlingReleaseMeter(): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (isPlayerBatting || this.isTimingBarActive || this.isBallActive) return;

    this.isBallActive = true;
    this.isTimingBarActive = true;
    this.timingCursorVal = 0;
    this.timingDirection = 1;

    // Auto-hide panels to clear pitch view during timing release
    const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');
    if (controlBowling) controlBowling.classList.add('hidden', 'panel-hidden');
    if (controlBatting) controlBatting.classList.add('hidden', 'panel-hidden');

    const widget = document.getElementById('timing-widget')!;
    widget.classList.remove('hidden');
    document.getElementById('timing-instruction')!.innerText = 'Release SPACE or Pointer on perfect zone!';

    this.runTimingMeterLoop();
  }

  private runTimingMeterLoop(): void {
    if (!this.isTimingBarActive) return;

    this.timingCursorVal += this.timingDirection * 0.035;
    if (this.timingCursorVal >= 1.0) {
      this.timingCursorVal = 1.0;
      this.timingDirection = -1;
    } else if (this.timingCursorVal <= 0.0) {
      this.timingCursorVal = 0.0;
      this.timingDirection = 1;
    }

    const cursor = document.getElementById('timing-bar-cursor')!;
    cursor.style.left = `${this.timingCursorVal * 100}%`;

    requestAnimationFrame(() => this.runTimingMeterLoop());
  }

  private triggerReleaseMeter(): void {
    if (!this.isTimingBarActive) return;
    this.isTimingBarActive = false;
    document.getElementById('timing-widget')!.classList.add('hidden');

    const finalTiming = this.timingCursorVal;
    
    // Sync parameters with keyboard intent
    this.selectedBowlType = this.keyboardInputManager.intent.deliveryType;
    this.currentAimTargetX = this.keyboardInputManager.intent.aimX;
    this.currentAimTargetZ = this.keyboardInputManager.intent.aimZ;

    // Pitch the ball
    this.activeDelivery = {
      aimTarget: { x: this.currentAimTargetX, z: this.currentAimTargetZ },
      line: getLineTypeFromAimX(this.currentAimTargetX, this.controller.getCurrentInnings().batter.batterHand || 'RHB'),
      length: this.currentAimTargetZ > 16 ? 'yorker' : (this.currentAimTargetZ > 13.5 ? 'full' : (this.currentAimTargetZ > 11 ? 'good' : (this.currentAimTargetZ > 8 ? 'short' : 'bouncer'))),
      type: this.selectedBowlType,
      releaseTiming: finalTiming
    };

    // Hide bowler setup panel
    document.getElementById('control-bowling')!.classList.add('hidden');

    // Bot decides batting response
    this.pendingBotShot = botChooseShot(
      this.controller.state.bot,
      this.controller.state.player,
      this.activeDelivery,
      this.controller.state.bot.rank === 'Legend' ? 'Hard' : (this.controller.state.bot.rank === 'Gold' ? 'Medium' : 'Easy')
    );

    this.deliverBall3D();
  }

  // --- Batting Swings ---

  private executeKeyboardBatSwing(): void {
    // Keyboard fallback swing
    const clockDirection = 0; // Straight up
    this.executeBattingSwingGesture(clockDirection, this.selectedShotType);
  }

  public executeBattingSwingGesture(direction: number, type: ShotType, simulatedTiming?: number): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if ((!isPlayerBatting && simulatedTiming === undefined) || !this.activeDelivery || this.activeShot) return;

    // Auto-hide panels to clear view
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');
    if (controlBatting) controlBatting.classList.add('hidden', 'panel-hidden');

    let timing = 0.5;
    if (simulatedTiming !== undefined) {
      timing = simulatedTiming;
    } else {
      // Calculate relative timing of swing based on how far the ball has traveled.
      // Ball triggers arrived callback at frame 60.
      const currentFrame = (Date.now() - this.deliveryStartFrame) / (1000 / 60);
      const arrivalFrame = 50; // Sweet spot of ball crossing the crease
      
      // Convert to relative ratio centered at 0.5
      const diff = currentFrame - arrivalFrame;
      timing = 0.5 + (diff / 40); // bounds mapped
    }

    this.activeShot = {
      direction,
      type,
      timing: Math.max(0.0, Math.min(1.0, timing)),
      contactZone: 0.44 + Math.random() * 0.12 // sweet spot MVP variation
    };

    this.gameScene.animateBatterSwing(direction, () => {
      // Swing visual completes
    });
  }

  // --- Ball Trajectory Animation Trigger ---

  private pendingBotShot: ShotChoice | null = null;

  // --- Ball Trajectory Animation Trigger ---

  private deliverBall3D(): void {
    if (!this.activeDelivery || this.deliveryStartFrame > Date.now() - 100) return; // Prevent double trigger in same frame

    this.isBallActive = true;
    this.hideResultToast();
    this.deliveryStartFrame = Date.now();

    // Lock camera in pre-contact player perspective before delivery commences
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    const preContactCam = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.gameScene.setCameraMode(preContactCam);
    this.controller.setCameraMode(preContactCam);

    // Start delivery trajectory
    this.gameScene.animateDelivery(
      this.activeDelivery.aimTarget,
      this.activeDelivery.length,
      this.activeDelivery.releaseTiming,
      () => this.handleBallArrivalAtStumps(),
      () => this.setupActiveTurn(),
      true
    );
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

    if (checkExtraBall(outcome.delivery, this.controller.getCurrentInnings().batter.batterHand || 'RHB').isExtra) {
      title = outcome.wicketReason || 'Extra Ball!';
      desc = 'Bowler committed an illegal delivery. Extra ball!';
      this.gameScene.animateMissWicket(false);
    } else if (outcome.isWicket) {
      title = 'WICKET!';
      desc = outcome.wicketReason;
      this.gameScene.animateMissWicket(true);
    } else if (outcome.distance >= SIX_THRESHOLD) {
      title = `SIX! ${outcome.distance.toFixed(1)}m`;
      desc = `Cleared the boundary at Aim Direction ${outcome.shot?.direction}!`;
      this.gameScene.animateHitPath(outcome.distance, outcome.shot?.direction || 0);
      this.controller.setCameraMode('follow_shot');
    } else {
      title = 'Dot Ball';
      desc = outcome.shot ? 'Shot failed to clear the boundary. 0 runs scored.' : (outcome.wicketReason || 'A swing and a miss!');
      this.gameScene.animateMissWicket(false);
    }

    this.showResultToast(title, desc);
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
      clearTimeout(this.toastDismissTimer);
    }

    // Auto-dismiss after 4 seconds
    this.toastDismissTimer = setTimeout(() => {
      this.hideResultToast();
    }, 4000);
  }

  private hideResultToast(): void {
    if (this.toastDismissTimer) {
      clearTimeout(this.toastDismissTimer);
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
    const legalCount = currentInn.balls.filter(b => !checkExtraBall(b.delivery, currentInn.batter.batterHand || 'RHB').isExtra).length;
    
    const ballsCountEl = document.getElementById('hud-balls-count');
    if (ballsCountEl) ballsCountEl.innerText = `${legalCount}/6`;

    const wicketsCountEl = document.getElementById('hud-wickets-count');
    if (wicketsCountEl) wicketsCountEl.innerText = `${currentInn.wicketsLost}/${currentInn.maxWickets}`;

    const scoreCountEl = document.getElementById('hud-score-count');
    if (scoreCountEl) scoreCountEl.innerText = `${currentInn.score}`;

    const biggestSixEl = document.getElementById('hud-biggest-six');
    if (biggestSixEl) biggestSixEl.innerText = `${currentInn.biggestSix.toFixed(1)}m`;

    // 6-Ball Over Tracker Dynamic Outcome Updates
    const tracker = document.getElementById('over-tracker');
    if (tracker) {
      const balls = currentInn.balls;
      const totalSlots = Math.max(6, balls.length);

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
            dot.textContent = outcome.extraType === 'wide' ? 'WD' : (outcome.extraType === 'noball' ? 'NB' : 'EX');
            dot.title = `Ball ${i + 1}: Extra Delivery (${outcome.extraType ? outcome.extraType.toUpperCase() : 'Extra'} +1 Run)`;
          } else if (outcome.isFreeHit && outcome.distance < SIX_THRESHOLD) {
            // Blue dot: Free hit delivery
            dot.className = 'over-dot blue extra free-hit';
            dot.textContent = 'FH';
            dot.title = `Ball ${i + 1}: Free Hit Delivery (Dot Ball - 0 runs)`;
          } else if (outcome.distance >= SIX_THRESHOLD) {
            // Gold dot: SIX scored (6 runs)
            dot.className = 'over-dot gold six';
            dot.textContent = '6';
            dot.title = `Ball ${i + 1}: SIX! (${outcome.distance.toFixed(1)}m)`;
          } else {
            // Green dot: Dot Ball (0 runs)
            dot.className = 'over-dot green legal';
            dot.textContent = '•';
            dot.title = `Ball ${i + 1}: Dot Ball (0 runs)`;
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
    this.isBallActive = false;
    const state = this.controller.state;
    
    if (state.status === 'completed') {
      this.showGameOverScreen();
      return;
    }

    const innings = this.controller.getCurrentInnings();
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
      this.gameScene.setCameraMode('batter_eye');
      this.controller.setCameraMode('batter_eye');
      if (controlBatting) {
        controlBatting.classList.remove('hidden', 'panel-hidden');
      }
      if (controlBowling) {
        controlBowling.classList.add('hidden', 'panel-hidden');
      }
      
      // Auto trigger bot delivery
      this.activeDelivery = {
        aimTarget: { x: (Math.random() - 0.5) * 1.5, z: 6.0 + Math.random() * 11.5 },
        line: 'middle',
        length: 'good',
        type: 'fast',
        releaseTiming: 0.5
      };

      if (this.botDeliveryTimer) clearTimeout(this.botDeliveryTimer);
      this.botDeliveryTimer = setTimeout(() => {
        this.deliverBall3D();
      }, 1500);
    } else {
      // Bowler mode
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

    const playerSixes = playerInnings ? playerInnings.balls.filter(b => b.distance >= SIX_THRESHOLD).length : 0;
    const botSixes = botInnings ? botInnings.balls.filter(b => b.distance >= SIX_THRESHOLD).length : 0;
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
    const entries = JSON.parse(localStorage.getItem('six_hitting_contest_leaderboard') || '[]');
    entries.push({
      date: new Date().toLocaleDateString(),
      opponent: state.bot.name,
      biggestSix: playerInnings ? playerInnings.biggestSix.toFixed(1) : '0.0',
      wicketsLost: playerInnings ? playerInnings.wicketsLost : 0,
      outcome: state.winnerId === state.player.id ? 'WON' : (state.winnerId === state.bot.id ? 'LOST' : 'TIED')
    });
    // Sort primarily by single biggest six (m) descending and secondarily by fewest wickets lost ascending
    entries.sort((a: any, b: any) => {
      const sixA = parseFloat(a.biggestSix) || 0;
      const sixB = parseFloat(b.biggestSix) || 0;
      if (Math.abs(sixB - sixA) > 0.001) {
        return sixB - sixA;
      }
      const wA = typeof a.wicketsLost === 'number' ? a.wicketsLost : (parseInt(a.wicketsLost, 10) || 0);
      const wB = typeof b.wicketsLost === 'number' ? b.wicketsLost : (parseInt(b.wicketsLost, 10) || 0);
      return wA - wB;
    });
    localStorage.setItem('six_hitting_contest_leaderboard', JSON.stringify(entries.slice(0, 10)));

    // 6. Show the modal overlay
    const modal = document.getElementById('match-summary-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('active');
    }
  }

  private renderMiniTracker(containerId: string, balls: any[]): void {
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
        dot.textContent = ball.extraType === 'wide' ? 'WD' : 'NB';
        dot.title = `Ball ${idx + 1}: Extra Delivery (+1 Run)`;
      } else if (ball.distance >= SIX_THRESHOLD) {
        dot.className = 'mini-dot six';
        dot.textContent = `${Math.round(ball.distance)}m`;
        dot.title = `Ball ${idx + 1}: SIX! (${ball.distance.toFixed(1)}m)`;
      } else {
        dot.className = 'mini-dot dot';
        dot.textContent = '•';
        dot.title = `Ball ${idx + 1}: Dot Ball (0 runs)`;
      }
      container.appendChild(dot);
    });
  }

  public handleRematch(): void {
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
    this.isTimingBarActive = false;
    this.isBallActive = false;
    if (this.botDeliveryTimer) {
      clearTimeout(this.botDeliveryTimer);
      this.botDeliveryTimer = null;
    }
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
    if (wicketsCountEl) wicketsCountEl.innerText = '0/1';

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

  const key = 'six_hitting_contest_leaderboard';
  const entries: any[] = JSON.parse(localStorage.getItem(key) || '[]');

  // Sort primarily by single biggest six (m) descending and secondarily by fewest wickets lost ascending
  entries.sort((a: any, b: any) => {
    const sixA = parseFloat(a.biggestSix) || 0;
    const sixB = parseFloat(b.biggestSix) || 0;
    if (Math.abs(sixB - sixA) > 0.001) {
      return sixB - sixA;
    }
    const wA = typeof a.wicketsLost === 'number' ? a.wicketsLost : (parseInt(a.wicketsLost, 10) || 0);
    const wB = typeof b.wicketsLost === 'number' ? b.wicketsLost : (parseInt(b.wicketsLost, 10) || 0);
    return wA - wB;
  });

  if (entries.length > 0) {
    leaderboardBody.innerHTML = '';
    entries.forEach((entry: any, index: number) => {
      const row = document.createElement('tr');
      row.className = `leaderboard-row ${index === 0 ? 'top-rank' : ''}`;

      const rankMedal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
      const outcome = (entry.outcome || 'TIED').toUpperCase();
      const outcomeClass = outcome === 'WON' ? 'badge-won' : (outcome === 'LOST' ? 'badge-lost' : 'badge-tied');
      const wicketsVal = entry.wicketsLost !== undefined ? entry.wicketsLost : 0;
      const sixVal = parseFloat(entry.biggestSix || '0').toFixed(1);

      row.innerHTML = `
        <td class="col-rank">
          <span class="leaderboard-rank-pill rank-pos-${index + 1}">#${index + 1} ${rankMedal}</span>
        </td>
        <td class="col-opponent">
          <span class="opponent-name">${entry.opponent || 'Bot'}</span>
        </td>
        <td class="col-six">
          <strong class="six-stat"><span class="fire-icon">💥</span> ${sixVal}m</strong>
        </td>
        <td class="col-wickets">
          <span class="wickets-stat ${wicketsVal === 0 ? 'flawless' : 'lost'}">${wicketsVal}/1</span>
        </td>
        <td class="col-outcome">
          <span class="badge ${outcomeClass}">${outcome}</span>
        </td>
      `;
      leaderboardBody.appendChild(row);
    });
  } else {
    leaderboardBody.innerHTML = '<tr class="empty-row"><td colspan="5">No matches played yet. Step onto the pitch to set your high score!</td></tr>';
  }
}
