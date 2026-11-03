import type { DeliveryType } from './types';

export function isSpinDelivery(type: DeliveryType): boolean {
  return type === 'offspin' || type === 'legspin';
}

/** Keep mouse, touch and keyboard delivery selection in sync. */
export function updateBowlingAdjustmentVisibility(type: DeliveryType): void {
  const spin = isSpinDelivery(type);
  document.getElementById('bowl-pace-control')?.classList.toggle('hidden', false);
  document.getElementById('bowl-swing-control')?.classList.toggle('hidden', spin);
  document.getElementById('bowl-turn-control')?.classList.toggle('hidden', !spin);
}

/** Display the actual selected magnitude and direction beside each slider. */
export function initBowlingAdjustmentReadouts(): void {
  for (const name of ['pace', 'swing', 'turn'] as const) {
    const input = document.getElementById(`bowl-${name}`) as HTMLInputElement;
    const output = document.getElementById(`bowl-${name}-value`) as HTMLOutputElement;
    const update = () => {
      const value = input.valueAsNumber;
      output.textContent = name === 'swing'
        ? value === 0 ? 'STRAIGHT' : `${value < 0 ? '←' : '→'} ${Math.abs(value)}%`
        : `${value}%`;
      input.setAttribute('aria-valuetext', name === 'swing'
        ? value === 0 ? 'Straight' : `${Math.abs(value)} percent ${value < 0 ? 'left' : 'right'}`
        : `${value} percent`);
    };
    input.addEventListener('input', update);
    update();
  }
}
