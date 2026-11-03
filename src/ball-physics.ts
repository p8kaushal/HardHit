import { BALL_AIR_DAMPING, frameIndependentDamping } from './formula';

export interface BallState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  hasBounced: boolean;
  reachedBoundary: boolean;
  stopped: boolean;
}

/** Advance one small, fixed interval in metres and seconds. */
export function stepBall(state: BallState, dt: number): void {
  const { position: p, velocity: v } = state;
  const previous = { x: p.x, y: p.y, z: p.z };
  const drag = frameIndependentDamping(BALL_AIR_DAMPING, dt);
  v.x *= drag;
  v.y = v.y * drag - 9.81 * dt;
  v.z *= drag;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

  // Compare the rope crossing and ground impact within this step. At high
  // speed they can occur in the same frame, but their order decides 4 or 6.
  const dx = p.x - previous.x;
  const dz = p.z - previous.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (previous.x * dx + previous.z * dz);
  const c = previous.x * previous.x + previous.z * previous.z - 65 * 65;
  const discriminant = b * b - 4 * a * c;
  const crossing = c >= 0 ? 0 : a > 0 && discriminant >= 0 ? (-b + Math.sqrt(discriminant)) / (2 * a) : Infinity;
  const impact = previous.y > 0.075 && p.y <= 0.075
    ? (previous.y - 0.075) / (previous.y - p.y)
    : previous.y <= 0.075 ? 0 : Infinity;
  if (crossing >= 0 && crossing <= 1 && crossing < impact) {
    p.x = previous.x + dx * crossing;
    p.y = previous.y + (p.y - previous.y) * crossing;
    p.z = previous.z + dz * crossing;
    state.reachedBoundary = true;
    state.stopped = false;
    return;
  }

  if (p.y <= 0.075) {
    p.y = 0.075;
    state.hasBounced = true;
    if (v.y < 0) v.y = Math.abs(v.y) * 0.55;
    // Settle small hops and apply grass friction while the ball is on the turf.
    if (v.y < 0.45) v.y = 0;
    const friction = frameIndependentDamping(0.92, dt);
    v.x *= friction;
    v.z *= friction;
  }
  state.reachedBoundary = crossing >= 0 && crossing <= 1;
  state.stopped = p.y <= 0.075 && Math.abs(v.y) < 0.45 && Math.hypot(v.x, v.z) < 0.3;
}
