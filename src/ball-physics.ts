import { BALL_AIR_DAMPING, BALL_RADIUS_METERS, frameIndependentDamping } from './formula';

export interface BallState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  hasBounced: boolean;
  reachedBoundary: boolean;
  boundaryOnFull?: boolean;
  stopped: boolean;
}

/** Advance fixed simulation steps while bounding catch-up after a long stall. */
export function advanceBallFrame(state: BallState, accumulator: number, elapsedSeconds: number): number {
  const step = 1 / 120;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.min(elapsedSeconds, 0.25)) : 0;
  let remaining = Math.max(0, accumulator) + elapsed;
  let steps = 0;
  while (remaining + 1e-10 >= step && steps < 30) {
    stepBall(state, step);
    remaining = Math.max(0, remaining - step);
    steps++;
    if (state.stopped || (state.reachedBoundary && (!state.boundaryOnFull || state.hasBounced))) break;
  }
  return remaining;
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
  const crossing = state.reachedBoundary ? Infinity : c >= 0 ? 0 : a > 0 && discriminant >= 0 ? (-b + Math.sqrt(discriminant)) / (2 * a) : Infinity;
  const impact = previous.y > BALL_RADIUS_METERS && p.y <= BALL_RADIUS_METERS
    ? (previous.y - BALL_RADIUS_METERS) / (previous.y - p.y)
    : previous.y <= BALL_RADIUS_METERS && p.y <= BALL_RADIUS_METERS ? 0 : Infinity;
  if (crossing >= 0 && crossing <= 1 && crossing < impact) {
    state.reachedBoundary = true;
    state.boundaryOnFull = !state.hasBounced;
    if (state.hasBounced) {
      p.x = previous.x + dx * crossing;
      p.y = previous.y + (p.y - previous.y) * crossing;
      p.z = previous.z + dz * crossing;
      state.stopped = false;
      return;
    }
  }

  // For a six, carry ends at first ground contact. Interpolate within this
  // physics step rather than measuring the overshoot after penetration.
  if (state.reachedBoundary && state.boundaryOnFull && impact >= 0 && impact <= 1) {
    p.x = previous.x + dx * impact;
    p.y = BALL_RADIUS_METERS;
    p.z = previous.z + dz * impact;
    state.hasBounced = true;
    return;
  }

  if (p.y <= BALL_RADIUS_METERS) {
    p.y = BALL_RADIUS_METERS;
    state.hasBounced = true;
    if (v.y < 0) v.y = Math.abs(v.y) * 0.55;
    // Settle small hops and apply grass friction while the ball is on the turf.
    if (v.y < 0.45) v.y = 0;
    const friction = frameIndependentDamping(0.92, dt);
    v.x *= friction;
    v.z *= friction;
  }
  if (!state.reachedBoundary && crossing >= 0 && crossing <= 1) {
    state.reachedBoundary = true;
    state.boundaryOnFull = false;
  }
  state.stopped = p.y <= BALL_RADIUS_METERS && Math.abs(v.y) < 0.45 && Math.hypot(v.x, v.z) < 0.3;
}
