export interface BatterPosition { x: number; z: number }

/** Offsets are metres relative to the batter's starting stance. */
export function moveBatter(position: BatterPosition, dx: number, dz: number): BatterPosition {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value * 100) / 100));
  return { x: clamp(position.x + dx, -0.6, 0.6), z: clamp(position.z + dz, -0.3, 0.8) };
}
