import type { DeliveryType } from './types';

export function isSpinDelivery(type: DeliveryType): boolean {
  return type === 'offspin' || type === 'legspin';
}

/** Keep mouse, touch and keyboard delivery selection in sync. */
export function updateBowlingAdjustmentVisibility(type: DeliveryType): void {
  const spin = isSpinDelivery(type);
  document.getElementById('bowl-pace-control')?.classList.toggle('hidden', spin);
  document.getElementById('bowl-swing-control')?.classList.toggle('hidden', spin);
  document.getElementById('bowl-turn-control')?.classList.toggle('hidden', !spin);
}
