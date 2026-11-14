import { BALL_AIR_DAMPING, BALL_RADIUS_METERS, frameIndependentDamping } from './formula';
import type { BallPhysicsEvent } from './types';

export interface BallState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  hasBounced: boolean;
  reachedBoundary: boolean;
  boundaryOnFull?: boolean;
  stopped: boolean;
  elapsedSeconds?: number;
  physicsEvents?: BallPhysicsEvent[];
}

function recordPhysicsEvent(state: BallState, kind: BallPhysicsEvent['kind'], timeSeconds: number, position: BallState['position'], boundaryOnFull?: boolean): void {
  const events = state.physicsEvents ??= [];
  events.push({
    sequence: events.length,
    timeSeconds,
    kind,
    position: { ...position },
    velocity: { ...state.velocity },
    ...(boundaryOnFull === undefined ? {} : { boundaryOnFull }),
  });
}

/** Advance fixed simulation steps while bounding catch-up after a long stall. */
export function advanceBallFrame(
  state: BallState,
  accumulator: number,
  elapsedSeconds: number,
  onStep?: (state: Readonly<BallState>, stepSeconds: number) => boolean | void,
  continueAfterRest = false,
): number {
  const step = 1 / 120;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.min(elapsedSeconds, 0.25)) : 0;
  let remaining = Math.max(0, accumulator) + elapsed;
  let steps = 0;
  while (remaining + 1e-10 >= step && steps < 30) {
    // After physical rest, only the observer (for example a pursuing fielder)
    // advances. Residual sub-threshold velocity must not move the ball again.
    if (!state.stopped) stepBall(state, step);
    remaining = Math.max(0, remaining - step);
    steps++;
    const intercepted = onStep?.(state, step) === true;
    if (intercepted) state.stopped = true;
    if (intercepted || (state.stopped && !continueAfterRest) || (state.reachedBoundary && (!state.boundaryOnFull || state.hasBounced))) break;
  }
  return remaining;
}

/** Advance one small, fixed interval in metres and seconds. */
export function stepBall(state: BallState, dt: number): void {
  const { position: p, velocity: v } = state;
  const stepStartSeconds = state.elapsedSeconds ?? 0;
  const previous = { x: p.x, y: p.y, z: p.z };
  const atFraction = (fraction: number) => ({
    x: previous.x + (p.x - previous.x) * fraction,
    y: previous.y + (p.y - previous.y) * fraction,
    z: previous.z + (p.z - previous.z) * fraction,
  });
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
    recordPhysicsEvent(state, 'boundary_crossing', stepStartSeconds + crossing * dt, atFraction(crossing), state.boundaryOnFull);
    if (state.hasBounced) {
      p.x = previous.x + dx * crossing;
      p.y = previous.y + (p.y - previous.y) * crossing;
      p.z = previous.z + dz * crossing;
      state.stopped = false;
      state.elapsedSeconds = stepStartSeconds + dt;
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
    recordPhysicsEvent(state, 'ground_contact', stepStartSeconds + impact * dt, { ...p });
    state.elapsedSeconds = stepStartSeconds + dt;
    return;
  }

  if (p.y <= BALL_RADIUS_METERS) {
    const firstGroundContact = !state.hasBounced;
    const groundPosition = impact >= 0 && impact <= 1 ? atFraction(impact) : { x: p.x, y: BALL_RADIUS_METERS, z: p.z };
    p.y = BALL_RADIUS_METERS;
    state.hasBounced = true;
    if (v.y < 0) v.y = Math.abs(v.y) * 0.55;
    // Settle small hops and apply grass friction while the ball is on the turf.
    if (v.y < 0.45) v.y = 0;
    const friction = frameIndependentDamping(0.92, dt);
    v.x *= friction;
    v.z *= friction;
    if (firstGroundContact) recordPhysicsEvent(state, 'ground_contact', stepStartSeconds + (impact >= 0 && impact <= 1 ? impact : 1) * dt, groundPosition);
  }
  if (!state.reachedBoundary && crossing >= 0 && crossing <= 1) {
    state.reachedBoundary = true;
    state.boundaryOnFull = false;
    const boundaryPosition = atFraction(crossing);
    if (impact <= crossing) boundaryPosition.y = BALL_RADIUS_METERS;
    recordPhysicsEvent(state, 'boundary_crossing', stepStartSeconds + crossing * dt, boundaryPosition, false);
  }
  state.stopped = p.y <= BALL_RADIUS_METERS && Math.abs(v.y) < 0.45 && Math.hypot(v.x, v.z) < 0.3;
  if (state.stopped) recordPhysicsEvent(state, 'rest', stepStartSeconds + dt, { ...p });
  state.elapsedSeconds = stepStartSeconds + dt;
}
