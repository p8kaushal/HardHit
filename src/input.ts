import { InputIntent, ShotType } from './types';

export class KeyboardInputManager {
  public intent: InputIntent;
  private isPlayerBatting: () => boolean;
  private onReleaseMeterStart: () => void;
  private onReleaseMeterEnd: (timing: number) => void;
  private onBatSwing: (direction: number, type: ShotType) => void;

  // Track key hold state
  private spacePressed = false;

  // Lists of options for arrow key cycling
  private bowlingLines: number[] = [-0.9, 0.0, 0.9]; // Leg, Middle, Off
  private bowlingLineLabels: string[] = ['Leg Side', 'Middle', 'Off Side'];
  private currentLineIdx = 1; // Start middle

  private bowlingLengths: number[] = [7.0, 9.5, 12.0, 15.0, 17.5]; // Bouncer, Short, Good, Full, Yorker
  private bowlingLengthLabels: string[] = ['Bouncer', 'Short', 'Good Length', 'Full', 'Yorker'];
  private currentLengthIdx = 2; // Start Good Length

  constructor(
    isPlayerBatting: () => boolean,
    onReleaseMeterStart: () => void,
    onReleaseMeterEnd: (timing: number) => void,
    onBatSwing: (direction: number, type: ShotType) => void
  ) {
    this.isPlayerBatting = isPlayerBatting;
    this.onReleaseMeterStart = onReleaseMeterStart;
    this.onReleaseMeterEnd = onReleaseMeterEnd;
    this.onBatSwing = onBatSwing;

    this.intent = {
      aimX: 0.0,
      aimZ: 12.0,
      aimDirection: 0,
      deliveryType: 'fast',
      shotType: 'lofted',
      releaseTiming: 0.5,
      swingTiming: 0.5
    };

    this.setupListeners();
    this.updateFeedbackOverlay();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
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
      modeDetails.innerHTML = `Line: <strong>${this.bowlingLineLabels[this.currentLineIdx]}</strong> | Len: <strong>${this.bowlingLengthLabels[this.currentLengthIdx]}</strong> | Type: <strong>${this.intent.deliveryType.toUpperCase()}</strong>`;
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
    if (e.code === 'Space') {
      this.spacePressed = false;
      const batting = this.isPlayerBatting();
      if (!batting) {
        // End release meter on bowling release
        this.onReleaseMeterEnd(this.intent.releaseTiming);
      }
    }
  }

  private handleBowlingKeys(e: KeyboardEvent): void {
    // 1. Aim (Arrow Keys / WASD)
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.currentLineIdx = Math.max(0, this.currentLineIdx - 1);
      this.intent.aimX = this.bowlingLines[this.currentLineIdx];
      this.triggerBowlingAimUpdate();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.currentLineIdx = Math.min(this.bowlingLines.length - 1, this.currentLineIdx + 1);
      this.intent.aimX = this.bowlingLines[this.currentLineIdx];
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

  private handleBattingKeys(e: KeyboardEvent): void {
    // 1. Aim Direction cycle (Arrow Keys / WASD)
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.intent.aimDirection = (this.intent.aimDirection + 7) % 8; // Cycle counter-clockwise
      this.syncAimClockDOM();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.intent.aimDirection = (this.intent.aimDirection + 1) % 8; // Cycle clockwise
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

    // Synchronize selector button visuals in DOM
    this.syncShotTypeDOM();

    // 3. Swing trigger (Spacebar)
    if (e.code === 'Space' && !this.spacePressed) {
      this.spacePressed = true;
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
