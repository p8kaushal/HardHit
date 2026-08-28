import { InputIntent, ShotType } from './types';
import { globalAutoAssistConfig, resolveShot } from './game';

export let activeInputManager: KeyboardInputManager | null = null;

export class KeyboardInputManager {
  public intent: InputIntent;
  private isPlayerBatting: () => boolean;
  private getBatterHandedness: () => 'RHB' | 'LHB';
  private onReleaseMeterStart: () => void;
  private onReleaseMeterEnd: (timing: number) => void;
  private onBatSwing: (direction: number, type: ShotType) => void;

  // Track key hold state
  private spacePressed = false;

  // Lists of options for arrow key cycling
  // We will dynamically compute the aimX based on handedness, so we just track line index 0,1,2 for Leg, Middle, Off
  private currentLineIdx = 1; // Start middle

  private bowlingLengths: number[] = [7.0, 9.5, 12.0, 15.0, 17.5]; // Bouncer, Short, Good, Full, Yorker
  private bowlingLengthLabels: string[] = ['Bouncer', 'Short', 'Good Length', 'Full', 'Yorker'];
  private currentLengthIdx = 2; // Start Good Length

  constructor(
    isPlayerBatting: () => boolean,
    onReleaseMeterStart: () => void,
    onReleaseMeterEnd: (timing: number) => void,
    onBatSwing: (direction: number, type: ShotType) => void,
    getBatterHandedness: () => 'RHB' | 'LHB'
  ) {
    activeInputManager = this;
    this.isPlayerBatting = isPlayerBatting;
    this.getBatterHandedness = getBatterHandedness;
    this.onReleaseMeterStart = onReleaseMeterStart;
    this.onReleaseMeterEnd = onReleaseMeterEnd;
    this.onBatSwing = onBatSwing;

    this.intent = {
      aimX: 0.0,
      aimZ: 12.0,
      aimDirection: 0,
      deliveryType: 'fast',
      shotType: 'grounded',
      releaseTiming: 0.5,
      swingTiming: 0.5
    };

    this.setupListeners();
    this.updateFeedbackOverlay();
  }

  private boundHandleKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private boundHandleKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);

  private setupListeners(): void {
    window.addEventListener('keydown', this.boundHandleKeyDown);
    window.addEventListener('keyup', this.boundHandleKeyUp);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('keyup', this.boundHandleKeyUp);
  }

  public toggleHelpModal(): void {
    const modal = document.getElementById('keyboard-help-modal');
    if (modal) {
      if (modal.classList.contains('hidden')) {
        this.openHelpModal();
      } else {
        this.closeHelpModal();
      }
    }
  }

  public openHelpModal(): void {
    const modal = document.getElementById('keyboard-help-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.updateFeedbackOverlay();
    }
  }

  public closeHelpModal(): void {
    const modal = document.getElementById('keyboard-help-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  public isHelpModalOpen(): boolean {
    const modal = document.getElementById('keyboard-help-modal');
    return modal ? !modal.classList.contains('hidden') : false;
  }

  public updateFeedbackOverlay(): void {
    const modeBadge = document.getElementById('help-mode-badge');
    const modeDetails = document.getElementById('help-mode-details');
    if (!modeBadge || !modeDetails) return;

    const batting = this.isPlayerBatting();
    if (batting) {
      const directions = [
        'Straight (↑)',
        'Off-Side High (↗)',
        'Off-Side Flat (→)',
        'Behind Off (↘)',
        'Behind Leg (↓)',
        'Behind Leg High (↙)',
        'Leg-Side Flat (←)',
        'Leg-Side High (↖)'
      ];
      modeBadge.innerText = 'BATTING MODE';
      modeBadge.className = 'status-indicator-badge batting';
      modeDetails.innerHTML = `Aim: <strong>${directions[this.intent.aimDirection]}</strong> | Shot: <strong>${this.intent.shotType.toUpperCase()}</strong>`;
    } else {
      modeBadge.innerText = 'BOWLING MODE';
      modeBadge.className = 'status-indicator-badge bowling';
      modeDetails.innerHTML = `Line: <strong>${this.getBowlingLineLabel(this.currentLineIdx)}</strong> | Len: <strong>${this.bowlingLengthLabels[this.currentLengthIdx]}</strong> | Type: <strong>${this.intent.deliveryType.toUpperCase()}</strong>`;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Only capture when playing screen is active
    const gameplayScreen = document.getElementById('screen-gameplay');
    if (!gameplayScreen || !gameplayScreen.classList.contains('active')) return;

    // Toggle Help Modal on 'H' / 'h'
    if (e.key === 'h' || e.key === 'H') {
      this.toggleHelpModal();
      return;
    }

    // Close Help Modal on Escape
    if (e.key === 'Escape') {
      if (this.isHelpModalOpen()) {
        this.closeHelpModal();
        return;
      }
    }

    const batting = this.isPlayerBatting();

    if (batting) {
      this.handleBattingKeys(e);
    } else {
      this.handleBowlingKeys(e);
    }

    this.updateFeedbackOverlay();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.pressedKeys.delete(e.key.toLowerCase());
    if (e.code === 'Space') {
      this.spacePressed = false;
      const batting = this.isPlayerBatting();
      if (!batting) {
        // End release meter on bowling release
        this.onReleaseMeterEnd(this.intent.releaseTiming);
      }
    }
  }

  public getAimXForIndex(idx: number): number {
    return [-0.8, 0.0, 0.8][idx];
  }

  public getBowlingLineLabel(idx: number): string {
    const hand = this.getBatterHandedness();
    if (idx === 0) return hand === 'RHB' ? 'Off Side' : 'Leg Side';
    if (idx === 2) return hand === 'RHB' ? 'Leg Side' : 'Off Side';
    return 'Middle';
  }

  private handleBowlingKeys(e: KeyboardEvent): void {
    // 1. Aim (Arrow Keys / WASD)
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.currentLineIdx = Math.max(0, this.currentLineIdx - 1);
      this.intent.aimX = this.getAimXForIndex(this.currentLineIdx);
      this.triggerBowlingAimUpdate();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.currentLineIdx = Math.min(2, this.currentLineIdx + 1);
      this.intent.aimX = this.getAimXForIndex(this.currentLineIdx);
      this.triggerBowlingAimUpdate();
    }

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      this.currentLengthIdx = Math.min(this.bowlingLengths.length - 1, this.currentLengthIdx + 1);
      this.intent.aimZ = this.bowlingLengths[this.currentLengthIdx];
      this.triggerBowlingAimUpdate();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      this.currentLengthIdx = Math.max(0, this.currentLengthIdx - 1);
      this.intent.aimZ = this.bowlingLengths[this.currentLengthIdx];
      this.triggerBowlingAimUpdate();
    }

    // 2. Delivery Type Selector (Keys 1-5)
    if (e.key === '1') this.intent.deliveryType = 'fast';
    else if (e.key === '2') this.intent.deliveryType = 'medium';
    else if (e.key === '3') this.intent.deliveryType = 'slow';
    else if (e.key === '4') this.intent.deliveryType = 'offspin';
    else if (e.key === '5') this.intent.deliveryType = 'legspin';

    // Synchronize selector button visuals in DOM
    this.syncBowlTypeDOM();

    // 3. Spacebar Meter
    if (e.code === 'Space' && !this.spacePressed) {
      this.spacePressed = true;
      this.onReleaseMeterStart();
    }
  }

  private pressedKeys = new Set<string>();

  private handleBattingKeys(e: KeyboardEvent): void {
    this.pressedKeys.add(e.key.toLowerCase());
    
    // Footwork selections
    if (e.key.toLowerCase() === 'q') (this.intent as any).footwork = 'front';
    if (e.key.toLowerCase() === 'e') (this.intent as any).footwork = 'back';
    
    // Calculate 8-way direction based on WASD or Arrows
    const up = this.pressedKeys.has('w') || this.pressedKeys.has('arrowup');
    const down = this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown');
    const left = this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft');
    const right = this.pressedKeys.has('d') || this.pressedKeys.has('arrowright');

    let dir = -1;
    if (up && !right && !left) dir = 0; // Straight
    else if (up && right) dir = 1; // Off-Side High
    else if (right && !up && !down) dir = 2; // Off-Side Flat
    else if (down && right) dir = 3; // Behind Off
    else if (down && !right && !left) dir = 4; // Behind Leg
    else if (down && left) dir = 5; // Behind Leg High
    else if (left && !up && !down) dir = 6; // Leg-Side Flat
    else if (up && left) dir = 7; // Leg-Side High

    if (dir !== -1) {
      this.intent.aimDirection = dir;
      this.syncAimClockDOM();
    }

    // Numpad 1-8 Direct selection
    if (e.code.startsWith('Numpad') && e.key >= '1' && e.key <= '8') {
      const num = parseInt(e.key) - 1;
      this.intent.aimDirection = num;
      this.syncAimClockDOM();
    }

    // 2. Shot Type Selector (Keys 1-4)
    if (e.key === '1') this.intent.shotType = 'lofted';
    else if (e.key === '2') this.intent.shotType = 'power';
    else if (e.key === '3') this.intent.shotType = 'grounded';
    else if (e.key === '4') this.intent.shotType = 'defensive';

    this.syncShotTypeDOM();

    // 3. Swing trigger (Spacebar)
    if (e.code === 'Space' && !this.spacePressed) {
      this.spacePressed = true;
      
      // Calculate temporal Time-To-Impact (TTI) engine
      const t_input = performance.now();
      
      const releaseZ = 10.5;
      const creaseZ = -8.2;
      const vZ = 20.0;
      const deceleration = 0.15;
      const timeDilation = 1.0;
      
      // We calculate flightDurationSeconds
      const distance = Math.abs(creaseZ - releaseZ);
      const flightDurationSeconds = (distance / vZ) * timeDilation * (1 + deceleration);
      
      const deliveryStartTime = globalAutoAssistConfig.deliveryStartTime || (t_input - 500);
      const t_arrival_ms = deliveryStartTime + (flightDurationSeconds * 1000);
      
      const delta_t_ms = Math.abs(t_input - (t_arrival_ms - 150));
      globalAutoAssistConfig.delta_t = delta_t_ms;
      
      // Calculate ballZ based on time elapsed since deliveryStartTime
      const timeElapsedSec = (t_input - deliveryStartTime) / 1000;
      // Ball travels from bowler stumps (z ≈ -11.5) to batsman stumps (z ≈ 9.4)
      const calculatedBallZ = -11.5 + (20.0 * timeElapsedSec);
      globalAutoAssistConfig.ballZ = calculatedBallZ;
      
      console.log("[BATTING TELEMETRY]", { t_input, t_arrival_ms, delta_t_ms, ballZ: calculatedBallZ });
      
      // Clear HUD instantly on swing
      const banner = document.getElementById('hit-space-banner');
      if (banner) banner.style.display = 'none';
      const recBanner = document.getElementById('recommended-shot-banner');
      if (recBanner) recBanner.style.display = 'none';

      const delivery = globalAutoAssistConfig.currentDelivery;
      const botTier = 'Medium'; // fallback
      const deliveryLength = delivery ? delivery.length : 'good';
      resolveShot(delta_t_ms, botTier, this.intent.shotType, deliveryLength);
      
      this.onBatSwing(this.intent.aimDirection, this.intent.shotType);
    }
  }

  private triggerBowlingAimUpdate(): void {
    // Direct position setting is cleaner, but let's fire custom dispatch
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      const customEvent = {
        clientX: canvas.getBoundingClientRect().left + (this.intent.aimX / 3.0 + 0.5) * canvas.getBoundingClientRect().width,
        clientY: canvas.getBoundingClientRect().top + (1.0 - (this.intent.aimZ - 4.0) / 15.0) * canvas.getBoundingClientRect().height
      };
      const e = new PointerEvent('pointermove', {
        clientX: customEvent.clientX,
        clientY: customEvent.clientY
      });
      canvas.dispatchEvent(e);
    }
  }

  private syncBowlTypeDOM(): void {
    const buttons = document.querySelectorAll('#bowl-type-group .btn');
    buttons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-val') === this.intent.deliveryType) {
        btn.classList.add('active');
      }
    });
  }

  private syncShotTypeDOM(): void {
    const buttons = document.querySelectorAll('#bat-type-group .btn');
    buttons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-val') === this.intent.shotType) {
        btn.classList.add('active');
      }
    });
  }

  private syncAimClockDOM(): void {
    const clockButtons = document.querySelectorAll('.clock-btn');
    clockButtons.forEach(btn => {
      btn.classList.remove('active');
      if (parseInt(btn.getAttribute('data-val') || '0') === this.intent.aimDirection) {
        btn.classList.add('active');
      }
    });
  }
}
