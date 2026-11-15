import { BALL_RADIUS_METERS, BATTER_CONTACT_Z, BATTER_CREASE_Z, batterContactProgress, deliveryContactPoint, deliveryDurationMs, sampleDeliveryPath } from './formula';
import type { BatBallContactEvent, DeliveryChoice, ShotChoice } from './types';

/** Modeled blade dimensions in metres; width uses the MCC bat gauge maximum. */
export const BAT_BLADE_LENGTH_METERS = 0.64;
export const BAT_BLADE_HALF_WIDTH_METERS = 0.054;
export const BAT_SWING_DURATION_SECONDS = 0.3;
const BAT_BLADE_SHOULDER_METERS = 0.11;
const SWEEP_STEP_SECONDS = 1 / 1200;
/** Swing rotation keys in seconds/radians; scene animation uses these same values. */
const BAT_SWING_KEYS_V1: ReadonlyArray<readonly [number, number]> = [[0, -0.2], [4 / 60, -1.4], [10 / 60, 1.1], [18 / 60, -0.2]];
/** V2 preserves the contact pose while matching published distal bat speed at impact. */
export const BAT_SWING_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, -0.2], [4 / 60, -1.4], [0.13, 0], [0.17, 1.4293333333333333], [18 / 60, -0.2],
];

function interpolateSwingAngle(elapsedSeconds: number, hand: 'RHB' | 'LHB', model: 'swept-blade-v1' | 'swept-blade-v2'): number {
  const time = Math.max(0, Math.min(BAT_SWING_DURATION_SECONDS, elapsedSeconds));
  const keys = model === 'swept-blade-v1' ? BAT_SWING_KEYS_V1 : BAT_SWING_KEYS;
  let angle = keys[keys.length - 1][1];
  for (let index = 1; index < keys.length; index++) {
    const [endTime, endAngle] = keys[index];
    if (time <= endTime) {
      const [startTime, startAngle] = keys[index - 1];
      const fraction = (time - startTime) / (endTime - startTime);
      angle = startAngle + (endAngle - startAngle) * fraction;
      break;
    }
  }
  // The same shoulder rotation mirrors in the two handed stances.
  return hand === 'RHB' ? -angle : angle;
}

function bladePoint(pivot: { x: number; y: number; z: number }, localY: number, angle: number, hand: 'RHB' | 'LHB') {
  const localX = -localY * Math.sin(angle);
  const localVertical = localY * Math.cos(angle);
  const worldZ = hand === 'RHB' ? -localX : localX;
  return { x: pivot.x, y: pivot.y + localVertical, z: pivot.z + worldZ };
}

/** Centerline point on the visible blade, measured from shoulder toward toe. */
export function batBladeWorldPoint(
  pivot: { x: number; y: number; z: number },
  alongBlade: number,
  angle: number,
  hand: 'RHB' | 'LHB',
) {
  const distance = Math.max(0, Math.min(BAT_BLADE_LENGTH_METERS, alongBlade));
  return bladePoint(pivot, -(BAT_BLADE_SHOULDER_METERS + distance), angle, hand);
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
  contactModel: 'swept-blade-v1' | 'swept-blade-v2' = 'swept-blade-v2',
): BatBallContactEvent | null {
  const durationSeconds = deliveryDurationMs(delivery.type, delivery.pace) / 1000;
  const contactTimeSeconds = durationSeconds * batterContactProgress(delivery);
  const assist = Math.max(0, Math.min(1, Number.isFinite(assistMultiplier) ? assistMultiplier : 0));
  const timing = Math.max(0, Math.min(1, Number.isFinite(shot.timing) ? shot.timing : 0.5));
  const swingStartSeconds = contactTimeSeconds - 0.15 + (timing - 0.5) * 0.5 * (1 - assist);
  const startSeconds = Math.max(0, swingStartSeconds);
  const endSeconds = Math.min(contactTimeSeconds, swingStartSeconds + BAT_SWING_DURATION_SECONDS);
  if (endSeconds < startSeconds) return null;

  const pivot = contactModel === 'swept-blade-v1'
    ? { x: delivery.overTheWicket === undefined ? deliveryContactPoint(delivery).x : -0.24, y: 0.91, z: BATTER_CREASE_Z + 0.2 + (delivery.batterPosition?.z ?? 0) }
    : delivery.overTheWicket === undefined
      ? { ...battingPivotPosition(hand, delivery.batterPosition), x: deliveryContactPoint(delivery).x + (delivery.batterPosition?.x ?? 0) }
      : battingPivotPosition(hand, delivery.batterPosition);
  let timeSeconds = startSeconds;
  while (timeSeconds <= endSeconds + 1e-10) {
    const progress = Math.min(1, timeSeconds / durationSeconds);
    const ballPosition = sampleDeliveryPath(delivery, progress);
    const angle = interpolateSwingAngle(timeSeconds - swingStartSeconds, hand, contactModel);
    const shoulder = batBladeWorldPoint(pivot, 0, angle, hand);
    const toe = batBladeWorldPoint(pivot, BAT_BLADE_LENGTH_METERS, angle, hand);
    const closest = closestPointOnSegment(ballPosition, shoulder, toe);
    if (closest.distance <= BALL_RADIUS_METERS + BAT_BLADE_HALF_WIDTH_METERS) {
      const velocityStep = 0.001;
      const beforeTime = Math.max(0, timeSeconds - velocityStep);
      const afterTime = Math.min(durationSeconds, timeSeconds + velocityStep);
      const before = sampleDeliveryPath(delivery, beforeTime / durationSeconds);
      const after = sampleDeliveryPath(delivery, afterTime / durationSeconds);
      const elapsed = afterTime - beforeTime;
      const impactAlongBlade = BAT_BLADE_LENGTH_METERS * closest.fraction;
      const impactAngle = interpolateSwingAngle(timeSeconds - swingStartSeconds, hand, contactModel);
      const velocityBeforeTime = Math.max(swingStartSeconds, timeSeconds - velocityStep);
      const velocityElapsed = timeSeconds - velocityBeforeTime;
      const priorAngle = interpolateSwingAngle(velocityBeforeTime - swingStartSeconds, hand, contactModel);
      const priorBladePoint = batBladeWorldPoint(pivot, impactAlongBlade, priorAngle, hand);
      const currentBladePoint = batBladeWorldPoint(pivot, impactAlongBlade, impactAngle, hand);
      const priorTip = batBladeWorldPoint(pivot, BAT_BLADE_LENGTH_METERS, priorAngle, hand);
      const currentTip = batBladeWorldPoint(pivot, BAT_BLADE_LENGTH_METERS, impactAngle, hand);
      return {
        timeSeconds,
        ballPosition: { ...ballPosition },
        incomingVelocity: elapsed > 0
          ? { x: (after.x - before.x) / elapsed, y: (after.y - before.y) / elapsed, z: (after.z - before.z) / elapsed }
          : { x: 0, y: 0, z: 0 },
        bladePosition: closest.closest,
        bladeFraction: closest.fraction,
        // The current collision model has no bat-face rotation about the blade
        // axis. Across-face offset is therefore the signed world-X offset;
        // along-blade position is measured from the shoulder toward the toe.
        ...(contactModel === 'swept-blade-v2' ? {
          faceCoordinates: {
            alongBlade: Math.max(0, Math.min(1, closest.fraction)) * BAT_BLADE_LENGTH_METERS,
            acrossBlade: Math.max(-BAT_BLADE_HALF_WIDTH_METERS, Math.min(BAT_BLADE_HALF_WIDTH_METERS, ballPosition.x - pivot.x)),
          },
          batVelocity: velocityElapsed > 0
            ? { x: 0, y: (currentBladePoint.y - priorBladePoint.y) / velocityElapsed, z: (currentBladePoint.z - priorBladePoint.z) / velocityElapsed }
            : { x: 0, y: 0, z: 0 },
          batTipVelocity: velocityElapsed > 0
            ? { x: 0, y: (currentTip.y - priorTip.y) / velocityElapsed, z: (currentTip.z - priorTip.z) / velocityElapsed }
            : { x: 0, y: 0, z: 0 },
        } : {}),
      };
    }
    timeSeconds += SWEEP_STEP_SECONDS;
  }
  return null;
}

/** Bat pivot pose matching the striking plane used by collision and rendering. */
export function battingPivotPosition(hand: 'RHB' | 'LHB', batterPosition: { x?: number; z?: number } = {}) {
  const local = batPivotLocalPosition(hand);
  // Match the scene's batter-root yaw (+/- 90 degrees) and its default root
  // offset. batterPosition contains movement relative to that starting stance.
  const stance = hand === 'RHB' ? Math.PI / 2 : -Math.PI / 2;
  const worldX = local.x * Math.cos(stance) + local.z * Math.sin(stance);
  const worldZ = -local.x * Math.sin(stance) + local.z * Math.cos(stance);
  return {
    x: -0.35 + worldX + (batterPosition.x ?? 0),
    y: local.y,
    z: BATTER_CREASE_Z + worldZ + (batterPosition.z ?? 0),
    contactPlaneZ: BATTER_CONTACT_Z + (batterPosition.z ?? 0),
  };
}

/** Local bat-pivot coordinates below the handed batter root. */
export function batPivotLocalPosition(hand: 'RHB' | 'LHB') {
  return hand === 'RHB'
    ? { x: -0.2, y: 0.91, z: 0.11 }
    : { x: 0.2, y: 0.91, z: -0.11 };
}
