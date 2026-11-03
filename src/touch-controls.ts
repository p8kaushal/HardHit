import type { ShotType } from './types';
import type { DeliveryChoice } from './types';
import { deliveryContactPoint } from './formula';

const DIRECTION_LABELS = ['Straight', 'Forward right', 'Right', 'Back right', 'Behind', 'Back left', 'Left', 'Forward left'];

/** A simple line-based guide, not a guarantee of a successful shot. */
export function suggestedShotDirection(delivery: DeliveryChoice): number {
  const line = deliveryContactPoint(delivery).x - (delivery.batterPosition?.x ?? 0);
  return line > 0.2 ? 1 : line < -0.2 ? 7 : 0;
}

/** Map a stick vector to the game's clockwise eight-way shot direction. */
export function directionFromStick(x: number, y: number, deadZone = 0.18): number | null {
  if (Math.hypot(x, y) < deadZone) return null;
  const angle = Math.atan2(x, -y);
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

/** Independent pointer capture permits aiming and striking with different fingers. */
export class TouchBattingControls {
  private pointerId: number | null = null;
  private direction = 0;
  private locked = false;
  private readonly knob: HTMLElement;

  constructor(private readonly stick: HTMLElement, buttons: NodeListOf<HTMLButtonElement>, private readonly onShot: (direction: number, type: ShotType) => void) {
    this.knob = stick.querySelector<HTMLElement>('.touch-stick-knob')!;
    stick.addEventListener('pointerdown', event => {
      if (this.locked || this.pointerId !== null) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      this.update(event);
    });
    stick.addEventListener('pointermove', event => {
      if (event.pointerId === this.pointerId) this.update(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    buttons.forEach(button => button.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onShot(this.direction, button.dataset.shot as ShotType);
    }));
  }

  public setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) this.pointerId = null;
  }

  public cancelPointer(): void {
    this.pointerId = null;
  }

  public setSuggestion(direction: number): void {
    this.stick.style.setProperty('--suggested-angle', `${direction * 45}deg`);
    this.stick.setAttribute('data-suggestion', DIRECTION_LABELS[direction]);
  }

  private update(event: PointerEvent): void {
    const rect = this.stick.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    if (!radius) return;
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = (event.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(x, y);
    const direction = directionFromStick(x, y);
    if (direction === null) return;
    const scale = distance > 1 ? 1 / distance : 1;
    this.knob.style.transform = `translate(calc(-50% + ${x * scale * radius * 0.55}px), calc(-50% + ${y * scale * radius * 0.55}px))`;
    this.direction = direction;
    this.stick.style.setProperty('--selected-angle', `${direction * 45}deg`);
    this.stick.setAttribute('aria-label', `Shot aim locked: ${DIRECTION_LABELS[direction]}. Drag to select another direction.`);
  }
}
