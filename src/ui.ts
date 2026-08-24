import { MatchController } from './game';
import { GameScene } from './scene';
import { DeliveryChoice, ShotChoice, ShotType } from './types';
import { botChooseShot } from './bot';
import { checkExtraBall, getLineTypeFromAimX } from './formula';
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
  private activeDelivery: DeliveryChoice | null = null;
  private activeShot: ShotChoice | null = null;
  private deliveryStartFrame = 0;
  
  // Selections
  private selectedShotType: ShotType = 'lofted';
  private selectedBowlType: 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin' = 'fast';

  // Result Toast Auto-dismiss Timer
  private toastDismissTimer: any = null;

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
    if (isPlayerBatting || this.isTimingBarActive) return;

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
    this.activeShot = botChooseShot(
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

  private executeBattingSwingGesture(direction: number, type: ShotType): void {
    const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
    if (!isPlayerBatting || !this.activeDelivery || this.activeShot) return;

    // Auto-hide panels to clear view
    const controlBatting = document.getElementById('control-batting') || document.getElementById('setup-batting-panel');
    if (controlBatting) controlBatting.classList.add('hidden', 'panel-hidden');

    // Calculate relative timing of swing based on how far the ball has traveled.
    // Ball triggers arrived callback at frame 60.
    const currentFrame = (Date.now() - this.deliveryStartFrame) / (1000 / 60);
    const arrivalFrame = 50; // Sweet spot of ball crossing the crease
    
    // Convert to relative ratio centered at 0.5
    const diff = currentFrame - arrivalFrame;
    const timing = 0.5 + (diff / 40); // bounds mapped

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

  private deliverBall3D(): void {
    if (!this.activeDelivery) return;

    this.hideResultToast();
    this.deliveryStartFrame = Date.now();

    // Start delivery trajectory
    this.gameScene.animateDelivery(
      this.activeDelivery.aimTarget,
      this.activeDelivery.length,
      this.activeDelivery.releaseTiming,
      () => this.handleBallArrivalAtStumps(),
      () => this.setupActiveTurn()
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
    } else if (outcome.distance > 0) {
      title = outcome.distance >= 70 ? `SIX HITTED! (${outcome.distance.toFixed(1)}m)` : `Hit: ${outcome.distance.toFixed(1)}m`;
      desc = `Cleared the boundary at Aim Direction ${outcome.shot?.direction}!`;
      this.gameScene.animateHitPath(outcome.distance, outcome.shot?.direction || 0);
    } else {
      title = 'Dot Ball';
      desc = outcome.wicketReason || 'A swing and a miss!';
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
          } else if (outcome.isFreeHit && outcome.distance < 70) {
            // Blue dot: Free hit delivery
            dot.className = 'over-dot blue extra free-hit';
            dot.textContent = 'FH';
            dot.title = `Ball ${i + 1}: Free Hit Delivery (${outcome.distance > 0 ? outcome.distance.toFixed(1) + 'm' : '0 runs'})`;
          } else if (outcome.distance >= 70) {
            // Gold dot: SIX scored (6 runs)
            dot.className = 'over-dot gold six';
            dot.textContent = '6';
            dot.title = `Ball ${i + 1}: SIX! (${outcome.distance.toFixed(1)}m)`;
          } else {
            // Green dot: Legal delivery (0-5 runs)
            dot.className = 'over-dot green legal';
            dot.textContent = outcome.distance > 0 ? `${Math.round(outcome.distance)}m` : '•';
            dot.title = `Ball ${i + 1}: Legal Delivery (${outcome.distance > 0 ? outcome.distance.toFixed(1) + 'm' : 'Dot ball'})`;
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
    const state = this.controller.state;
    
    if (state.status === 'completed') {
      this.showGameOverScreen();
      return;
    }

    const innings = this.controller.getCurrentInnings();
    const isPlayerBatting = innings.batter.id === state.player.id;

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

      setTimeout(() => {
        this.deliverBall3D();
      }, 1500);
    } else {
      // Bowler mode
      this.gameScene.setCameraMode('bowler_eye');
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
    document.getElementById('screen-gameplay')!.classList.remove('active');
    const gameOverScreen = document.getElementById('screen-gameover')!;
    gameOverScreen.classList.add('active');

    const state = this.controller.state;
    const playerInnings = state.innings.find(i => i.batter.id === state.player.id)!;
    const botInnings = state.innings.find(i => i.batter.id === state.bot.id)!;

    const titleEl = document.getElementById('gameover-title')!;
    const resultMsgEl = document.getElementById('gameover-result-msg')!;
    
    if (state.winnerId === state.player.id) {
      titleEl.innerText = 'CONGRATULATIONS!';
      resultMsgEl.innerText = 'You won the match!';
      resultMsgEl.className = 'badge success-btn';
    } else if (state.winnerId === state.bot.id) {
      titleEl.innerText = 'DEFEAT!';
      resultMsgEl.innerText = `${state.bot.name} won the match!`;
      resultMsgEl.className = 'badge warning-btn';
    } else {
      titleEl.innerText = 'TIE GAME!';
      resultMsgEl.innerText = 'Sudden death draw!';
      resultMsgEl.className = 'badge secondary-btn';
    }

    document.getElementById('gameover-player-six')!.innerText = `${playerInnings.biggestSix.toFixed(1)}m`;
    document.getElementById('gameover-player-wickets')!.innerText = `${playerInnings.wicketsLost}/${playerInnings.maxWickets}`;
    document.getElementById('gameover-player-total')!.innerText = `${playerInnings.balls.reduce((acc, b) => acc + b.distance, 0).toFixed(1)}m`;

    document.getElementById('gameover-bot-six')!.innerText = `${botInnings.biggestSix.toFixed(1)}m`;
    document.getElementById('gameover-bot-wickets')!.innerText = `${botInnings.wicketsLost}/${botInnings.maxWickets}`;
    document.getElementById('gameover-bot-total')!.innerText = `${botInnings.balls.reduce((acc, b) => acc + b.distance, 0).toFixed(1)}m`;

    const xpGained = state.winnerId === state.player.id ? 100 : 30;
    document.getElementById('progression-gains')!.innerText = `+${xpGained} XP Gained!`;

    // Save personal best
    const entries = JSON.parse(localStorage.getItem('six_hitting_contest_leaderboard') || '[]');
    entries.push({
      date: new Date().toLocaleDateString(),
      opponent: state.bot.name,
      biggestSix: playerInnings.biggestSix.toFixed(1),
      outcome: state.winnerId === state.player.id ? 'WON' : 'LOST'
    });
    entries.sort((a: any, b: any) => parseFloat(b.biggestSix) - parseFloat(a.biggestSix));
    localStorage.setItem('six_hitting_contest_leaderboard', JSON.stringify(entries.slice(0, 10)));
  }
}
