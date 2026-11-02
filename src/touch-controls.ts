import type { ShotType } from './types';

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
  private readonly knob: HTMLElement;

  constructor(private readonly stick: HTMLElement, buttons: NodeListOf<HTMLButtonElement>, private readonly onShot: (direction: number, type: ShotType) => void) {
    this.knob = stick.querySelector<HTMLElement>('.touch-stick-knob')!;
    stick.addEventListener('pointerdown', event => {
      if (this.pointerId !== null) return;
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
      this.direction = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
      stick.setAttribute('aria-label', 'Shot aim: Straight. Drag to change direction.');
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
    buttons.forEach(button => button.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.onShot(this.direction, button.dataset.shot as ShotType);
    }));
  }

  private update(event: PointerEvent): void {
    const rect = this.stick.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    if (!radius) return;
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = (event.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(x, y);
    const scale = distance > 1 ? 1 / distance : 1;
    this.knob.style.transform = `translate(calc(-50% + ${x * scale * radius * 0.55}px), calc(-50% + ${y * scale * radius * 0.55}px))`;
    this.direction = directionFromStick(x, y) ?? 0;
    const labels = ['Straight', 'Forward right', 'Right', 'Back right', 'Back', 'Back left', 'Left', 'Forward left'];
    this.stick.setAttribute('aria-label', `Shot aim: ${labels[this.direction]}. Drag to change direction.`);
  }
}
