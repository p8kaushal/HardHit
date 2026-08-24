export function calculateDeliveryVelocity(
  X_release: number,
  X_target_crease: number,
  t_flight: number,
  Ax_swing: number,
  X_spin: number
): number {
  return (X_target_crease - X_release - 0.5 * Ax_swing * Math.pow(t_flight, 2) - X_spin) / t_flight;
}

export function calculateProjectedCreaseX(
  X_release: number,
  Vx: number,
  t_flight: number,
  Ax_swing: number,
  X_spin_post_bounce: number
): number {
  return X_release + (Vx * t_flight) + (0.5 * Ax_swing * Math.pow(t_flight, 2)) + X_spin_post_bounce;
}
