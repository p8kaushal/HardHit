import { BALL_RADIUS_METERS, BATTER_CONTACT_Z, BATTER_CREASE_Z, batterContactProgress, deliveryContactPoint, deliveryDurationMs, sampleDeliveryPath } from './formula';
import type { BatBallContactEvent, DeliveryChoice, ShotChoice } from './types';

/** Modeled blade dimensions in metres; width uses the MCC bat gauge maximum. */
export const BAT_BLADE_LENGTH_METERS = 0.64;
export const BAT_BLADE_HALF_WIDTH_METERS = 0.054;
export const BAT_SWING_DURATION_SECONDS = 0.3;
const BAT_BLADE_SHOULDER_METERS = 0.11;
const SWEEP_STEP_SECONDS = 1 / 1200;
const SWING_KEYS: ReadonlyArray<readonly [number, number]> = [[0, -0.2], [4 / 60, -1.4], [10 / 60, 1.1], [18 / 60, -0.2]];

function interpolateSwingAngle(elapsedSeconds: number, hand: 'RHB' | 'LHB'): number {
  const time = Math.max(0, Math.min(BAT_SWING_DURATION_SECONDS, elapsedSeconds));
  let angle = SWING_KEYS[SWING_KEYS.length - 1][1];
  for (let index = 1; index < SWING_KEYS.length; index++) {
    const [endTime, endAngle] = SWING_KEYS[index];
    if (time <= endTime) {
      const [startTime, startAngle] = SWING_KEYS[index - 1];
      const fraction = (time - startTime) / (endTime - startTime);
      angle = startAngle + (endAngle - startAngle) * fraction;
      break;
    }
  }
  // The same shoulder rotation mirrors in the two handed stances.
  return hand === 'RHB' ? -angle : angle;
}

function closestPointOnSegment(point: { x: number; y: number; z: number }, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) {
  const segment = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const lengthSquared = segment.x ** 2 + segment.y ** 2 + segment.z ** 2;
  const fraction = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * segment.x + (point.y - start.y) * segment.y + (point.z - start.z) * segment.z) / lengthSquared))
    : 0;
  const closest = { x: start.x + segment.x * fraction, y: start.y + segment.y * fraction, z: start.z + segment.z * fraction };
  const distance = Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z);
  return { closest, fraction, distance };
}

/**
 * Sweep the modeled bat blade against the same incoming path used for rendering.
 * Timing is the existing swing-start input; assistance explicitly compresses
 * its offset before collision detection. The return is the earliest sphere/blade
 * overlap, sampled at 1,200 Hz to avoid tunnelling at delivery speeds.
 */
export function findBatBallContact(
  delivery: DeliveryChoice,
  shot: ShotChoice,
  hand: 'RHB' | 'LHB',
  assistMultiplier = 0,
): BatBallContactEvent | null {
  const durationSeconds = deliveryDurationMs(delivery.type, delivery.pace) / 1000;
  const contactTimeSeconds = durationSeconds * batterContactProgress(delivery);
  const assist = Math.max(0, Math.min(1, Number.isFinite(assistMultiplier) ? assistMultiplier : 0));
  const timing = Math.max(0, Math.min(1, Number.isFinite(shot.timing) ? shot.timing : 0.5));
  const swingStartSeconds = contactTimeSeconds - 0.15 + (timing - 0.5) * 0.5 * (1 - assist);
  const startSeconds = Math.max(0, swingStartSeconds);
  const endSeconds = Math.min(contactTimeSeconds, swingStartSeconds + BAT_SWING_DURATION_SECONDS);
  if (endSeconds < startSeconds) return null;

  // Legacy records without a release-side selection used an unshifted target
  // path; retain their historical centre stance. Live deliveries always carry
  // the side and use the explicit RHB stance anchor.
  const batterX = (delivery.overTheWicket === undefined ? deliveryContactPoint(delivery).x : -0.24) + (delivery.batterPosition?.x ?? 0);
  // The grip is 20 cm in front of the popping crease so the blade intersects
  // the authored contact plane as it rotates through the strike.
  const batterZ = BATTER_CREASE_Z + 0.2 + (delivery.batterPosition?.z ?? 0);
  const pivot = { x: batterX, y: 0.91, z: batterZ };
  let timeSeconds = startSeconds;
  while (timeSeconds <= endSeconds + 1e-10) {
    const progress = Math.min(1, timeSeconds / durationSeconds);
    const ballPosition = sampleDeliveryPath(delivery, progress);
    const angle = interpolateSwingAngle(timeSeconds - swingStartSeconds, hand);
    const shoulderY = -BAT_BLADE_SHOULDER_METERS;
    const toeY = -BAT_BLADE_LENGTH_METERS;
    const pointOnBlade = (localY: number) => {
      const localX = -localY * Math.sin(angle);
      const localVertical = localY * Math.cos(angle);
      // Local X is mirrored by the two stance rotations. Both sweep toward
      // the bowler (+Z) when the swing is moving through the ball.
      const worldZ = hand === 'RHB' ? -localX : localX;
      return { x: pivot.x, y: pivot.y + localVertical, z: pivot.z + worldZ };
    };
    const shoulder = pointOnBlade(shoulderY);
    const toe = pointOnBlade(toeY);
    const closest = closestPointOnSegment(ballPosition, shoulder, toe);
    if (closest.distance <= BALL_RADIUS_METERS + BAT_BLADE_HALF_WIDTH_METERS) {
      const velocityStep = 0.001;
      const beforeTime = Math.max(0, timeSeconds - velocityStep);
      const afterTime = Math.min(durationSeconds, timeSeconds + velocityStep);
      const before = sampleDeliveryPath(delivery, beforeTime / durationSeconds);
      const after = sampleDeliveryPath(delivery, afterTime / durationSeconds);
      const elapsed = afterTime - beforeTime;
      return {
        timeSeconds,
        ballPosition: { ...ballPosition },
        incomingVelocity: elapsed > 0
          ? { x: (after.x - before.x) / elapsed, y: (after.y - before.y) / elapsed, z: (after.z - before.z) / elapsed }
          : { x: 0, y: 0, z: 0 },
        bladePosition: closest.closest,
        bladeFraction: closest.fraction,
      };
    }
    timeSeconds += SWEEP_STEP_SECONDS;
  }
  return null;
}

/** Bat pivot pose matching the striking plane used by collision and rendering. */
export function battingPivotPosition(batterPosition: { x?: number; z?: number } = {}) {
  return {
    x: -0.24 + (batterPosition.x ?? 0),
    y: 0.91,
    z: BATTER_CREASE_Z + 0.2 + (batterPosition.z ?? 0),
    contactPlaneZ: BATTER_CONTACT_Z + (batterPosition.z ?? 0),
  };
}

/** Local bat-pivot coordinates below the handed batter root. */
export function batPivotLocalPosition(hand: 'RHB' | 'LHB') {
  return hand === 'RHB'
    ? { x: -0.2, y: 0.91, z: 0.11 }
    : { x: 0.2, y: 0.91, z: -0.11 };
}
