import { MatchController } from './game';
import { GameScene } from './scene';
import { DeliveryChoice, ShotChoice, ShotType } from './types';
import { botChooseShot } from './bot';
import { checkExtraBall } from './formula';

export class UIManager {
  private controller: MatchController;
  private gameScene: GameScene;

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

  constructor(controller: MatchController) {
    this.controller = controller;
    this.gameScene = new GameScene('game-canvas');
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

    // Global listeners
    window.addEventListener('mouseup', () => this.triggerReleaseMeter());
    window.addEventListener('touchend', () => this.triggerReleaseMeter());

    // Keyboard fallbacks
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const isPlayerBatting = this.controller.getCurrentInnings().batter.id === this.controller.state.player.id;
        if (isPlayerBatting && this.gameScene.scene.activeCamera?.name === 'camBatter') {
          this.executeKeyboardBatSwing();
        } else if (!isPlayerBatting && this.gameScene.scene.activeCamera?.name === 'camBowler') {
          this.startBowlingReleaseMeter();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.triggerReleaseMeter();
      }
    });

    // Next Ball transition
    document.getElementById('btn-next-ball')!.onclick = () => {
      document.getElementById('control-transition')!.classList.add('hidden');
      this.setupActiveTurn();
    };
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

    // Pitch the ball
    this.activeDelivery = {
      aimTarget: { x: this.currentAimTargetX, z: this.currentAimTargetZ },
      line: this.currentAimTargetX > 0.4 ? 'off' : (this.currentAimTargetX < -0.4 ? 'leg' : 'middle'),
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

    this.deliveryStartFrame = Date.now();
    this.gameScene.setCameraMode('follow_shot');

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

    // Triggers overlay outcome text
    const titleEl = document.getElementById('ball-outcome-title')!;
    const descEl = document.getElementById('ball-outcome-desc')!;
    
    if (checkExtraBall(outcome.delivery).isExtra) {
      titleEl.innerText = outcome.wicketReason;
      descEl.innerText = 'Bowler committed an illegal delivery. Extra ball!';
      this.gameScene.animateMissWicket(false);
    } else if (outcome.isWicket) {
      titleEl.innerText = 'WICKET!';
      descEl.innerText = outcome.wicketReason;
      this.gameScene.animateMissWicket(true);
    } else if (outcome.distance > 0) {
      titleEl.innerText = outcome.distance >= 70 ? `SIX HITTED! (${outcome.distance}m)` : `Hit: ${outcome.distance}m`;
      descEl.innerText = `Cleared the boundary at Aim Direction ${outcome.shot?.direction}!`;
      this.gameScene.animateHitPath(outcome.distance, outcome.shot?.direction || 0);
    } else {
      titleEl.innerText = 'Dot Ball';
      descEl.innerText = outcome.wicketReason || 'A swing and a miss!';
      this.gameScene.animateMissWicket(false);
    }

    document.getElementById('control-transition')!.classList.remove('hidden');
  }

  // --- Scoreboard and HUD updating ---

  public updateHUD(): void {
    const state = this.controller.state;
    const currentInn = this.controller.getCurrentInnings();
    
    document.getElementById('hud-batter-name')!.innerText = currentInn.batter.name;
    document.getElementById('hud-batter-stats')!.innerText = `PWR: ${currentInn.batter.stats.batting.power} | TIM: ${currentInn.batter.stats.batting.timing}`;
    
    document.getElementById('hud-bowler-name')!.innerText = currentInn.bowler.name;
    document.getElementById('hud-bowler-stats')!.innerText = `ACC: ${currentInn.bowler.stats.bowling.accuracy} | VAR: ${currentInn.bowler.stats.bowling.variation}`;
    
    document.getElementById('hud-innings-title')!.innerText = `Innings ${state.currentInningsIndex + 1}`;
    
    const legalCount = currentInn.balls.filter(b => !checkExtraBall(b.delivery).isExtra).length;
    document.getElementById('hud-balls-count')!.innerText = `${legalCount}/6`;
    document.getElementById('hud-wickets-count')!.innerText = `${currentInn.wicketsLost}/${currentInn.maxWickets}`;
    document.getElementById('hud-biggest-six')!.innerText = `${currentInn.biggestSix.toFixed(1)}m`;
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

    if (isPlayerBatting) {
      // Batter mode
      this.gameScene.setCameraMode('batter_eye');
      document.getElementById('control-batting')!.classList.remove('hidden');
      document.getElementById('control-bowling')!.classList.add('hidden');
      
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
      document.getElementById('control-bowling')!.classList.remove('hidden');
      document.getElementById('control-batting')!.classList.add('hidden');
    }
  }

  private showGameOverScreen(): void {
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
