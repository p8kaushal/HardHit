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
  const drag = frameIndependentDamping(BALL_AIR_DAMPING, dt);
  v.x *= drag;
  v.y = v.y * drag - 9.81 * dt;
  v.z *= drag;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

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
  state.reachedBoundary = Math.hypot(p.x, p.z) >= 65;
  state.stopped = p.y <= 0.075 && Math.abs(v.y) < 0.45 && Math.hypot(v.x, v.z) < 0.3;
}
