import { Player, DeliveryChoice, DeliveryType, ShotChoice, ShotType } from './types';
import * as BABYLON from 'babylonjs';

export function calculateBounceTarget(line: string, length: string, hand: 'RHB' | 'LHB' = 'RHB'): BABYLON.Vector3 {
  let x = 0.0;
  if (line.toLowerCase() === 'off') x = 0.45;
  if (line.toLowerCase() === 'leg') x = -0.45;
  if (line.toLowerCase() === 'middle') x = 0.0;
  if (hand === 'LHB') x = -x;

  let z = -4.2;
  switch (length.toLowerCase()) {
    case 'yorker': z = -8.2; break;
    case 'full': z = -6.2; break;
    case 'good': z = -4.2; break;
    case 'short': z = -2.2; break;
    case 'bouncer': z = -0.2; break;
  }
  return new BABYLON.Vector3(x, 0.08, z);
}

/** Map screen coordinates from the bowler's camera to the pitch. */
export function bowlingTargetFromScreen(x: number, y: number): { x: number; z: number } {
  const horizontal = Math.max(0, Math.min(1, x));
  const vertical = Math.max(0, Math.min(1, y));
  return { x: (0.5 - horizontal) * 3, z: -8.2 + vertical * 8.7 };
}

export const BAT_ANIMATION_LEAD_TIME = 0.15; // 150ms swing apex delay
export const BATTER_CREASE_Z = -8.8;
export const BATTER_STUMPS_Z = -10;
export const BATTER_CONTACT_Z = -8.4;
export const BALL_AIR_DAMPING = 0.9985;
// A 22.6 cm circumference ball has an approximately 3.6 cm radius.
export const BALL_RADIUS_METERS = 0.036;
// The modeled wicket is 9 inches wide and 28 inches high, in metres.
export const WICKET_WIDTH_METERS = 0.2286;
export const STUMP_HEIGHT_METERS = 0.7112;

export function deliveryDurationMs(type: DeliveryType, pace = 0.5): number {
  // Approximately 18.8 m from release to the crease: faster balls arrive
  // sooner, while spin gives the batter more time in flight.
  const base = { fast: 600, medium: 750, slow: 1050, offspin: 1000, legspin: 1000 }[type];
  return base * (1.2 - Math.max(0, Math.min(1, pace)) * 0.4);
}

export function deliveryTurn(type: DeliveryType, turn = 0.5): number {
  const strength = Math.max(0, Math.min(1, turn)) * 0.4;
  // For a right-arm bowler, off-break moves from a right-hander's off
  // side (positive X) towards leg; a leg-break turns the other way.
  return type === 'offspin' ? -strength : type === 'legspin' ? strength : 0;
}

/** Approximate pre-bounce swing, measured in metres in world coordinates. */
export function deliverySwingAtBounce(type: DeliveryType, swing = 0, bounceZ = -3.5): number {
  if (type === 'offspin' || type === 'legspin') return 0;
  const direction = Math.max(-1, Math.min(1, swing));
  const flightFraction = Math.max(0, Math.min(1, (10 - bounceZ) / (10 - BATTER_CREASE_Z)));
  // Screen-left is positive X from the bowler's end.
  return -direction * 0.45 * flightFraction;
}

export function deliverySwingAtCrease(type: DeliveryType, swing = 0, bounceZ = -3.5): number {
  const fraction = Math.max(0.01, Math.min(1, (10 - bounceZ) / (10 - BATTER_CREASE_Z)));
  return deliverySwingAtBounce(type, swing, bounceZ) * (1 + 2 * (1 - fraction) / fraction);
}

/** Release side is mirrored for left-arm bowling and around-the-wicket. */
export function deliveryReleaseX(delivery: Pick<DeliveryChoice, 'bowlingArm' | 'overTheWicket'>): number {
  const arm = delivery.bowlingArm === 'Left' ? -1 : 1;
  return 0.6 * arm * (delivery.overTheWicket === false ? -1 : 1);
}

/** Approximate retained lateral velocity after pitching. */
export function deliveryBaseCreaseX(delivery: DeliveryChoice): number {
  if (delivery.overTheWicket === undefined) return delivery.aimTarget.x;
  const beforePitch = 10 - delivery.aimTarget.z;
  const afterPitch = delivery.aimTarget.z - BATTER_CREASE_Z;
  return delivery.aimTarget.x + (delivery.aimTarget.x - deliveryReleaseX(delivery)) * afterPitch / beforePitch * 0.75;
}

export function deliveryCreaseX(delivery: DeliveryChoice): number {
  return deliveryBaseCreaseX(delivery) + deliverySwingAtCrease(delivery.type, delivery.swing, delivery.aimTarget.z) + deliveryTurn(delivery.type, delivery.turn);
}

/** Approximate heel position at front-foot landing, behind the crease negative. */
export function sampleFrontFootLanding(accuracy: number, pace: number, sample: number): number {
  const skill = Math.max(0, Math.min(100, accuracy)) / 100;
  const effort = Math.max(0, Math.min(1, pace));
  const spread = 0.04 + (1 - skill) * 0.10;
  const random = Math.max(0, Math.min(1, sample));
  return -0.08 + (effort - 0.5) * 0.04 + (random * 2 - 1) * spread;
}

/** A heel at or beyond the line leaves no modeled part of the foot behind it. */
export function isFrontFootNoBall(delivery: Pick<DeliveryChoice, 'frontFootHeel'>): boolean {
  return delivery.frontFootHeel !== undefined && Number.isFinite(delivery.frontFootHeel) && delivery.frontFootHeel >= 0;
}

/** Actual pitch point, including any movement before the bounce. */
export function deliveryPitchPoint(delivery: DeliveryChoice): { x: number; z: number } {
  const progress = (10 - delivery.aimTarget.z) / (10 - BATTER_CREASE_Z);
  const point = sampleDeliveryPath(delivery, progress);
  return { x: point.x, z: point.z };
}

/** Fraction of the standard flight when the ball reaches the batter's stance. */
export function batterContactProgress(delivery: DeliveryChoice): number {
  const z = Math.max(-0.3, Math.min(0.8, delivery.batterPosition?.z ?? 0));
  return Math.max(0, Math.min(1, (BATTER_CONTACT_Z + z - 10) / (BATTER_CREASE_Z - 10)));
}

/** Sample the shared incoming path; progress 1 is the modeled popping crease. */
export function sampleDeliveryPath(delivery: DeliveryChoice, progress: number): { x: number; y: number; z: number } {
  const start = { x: deliveryReleaseX(delivery), y: 1.9, z: 10 };
  const bounce = { x: delivery.aimTarget.x, y: BALL_RADIUS_METERS, z: delivery.aimTarget.z };
  const end = { x: deliveryBaseCreaseX(delivery), y: deliveryArrivalHeight(delivery.aimTarget.z, delivery.type, delivery.pace), z: BATTER_CREASE_Z };
  return getDeliveryFlightPosition(progress, start, bounce, end, delivery.type, delivery.turn, delivery.swing, delivery.pace);
}

export function deliveryContactPoint(delivery: DeliveryChoice): { x: number; y: number; z: number } {
  return sampleDeliveryPath(delivery, batterContactProgress(delivery));
}

/** Approximate incoming velocity at contact from the same path used on screen. */
export function deliveryVelocityAtCrease(delivery: DeliveryChoice): { x: number; y: number; z: number } {
  const contact = batterContactProgress(delivery);
  const before = sampleDeliveryPath(delivery, Math.max(0, contact - 0.01));
  const atCrease = sampleDeliveryPath(delivery, contact);
  const seconds = deliveryDurationMs(delivery.type, delivery.pace) / 1000 * 0.01;
  return { x: (atCrease.x - before.x) / seconds, y: (atCrease.y - before.y) / seconds, z: (atCrease.z - before.z) / seconds };
}

/** Whether the existing simplified pad model intercepts the delivery. */
export function deliveryHitsPad(delivery: DeliveryChoice): boolean {
  const impactZ = BATTER_CONTACT_Z + (delivery.batterPosition?.z ?? 0);
  const progress = (impactZ - 10) / (BATTER_CREASE_Z - 10);
  const impact = sampleDeliveryPath(delivery, progress);
  return Math.abs(impact.x - (delivery.batterPosition?.x ?? 0)) <= 0.30 + BALL_RADIUS_METERS && impact.y >= 0.18 && impact.y <= 1.05;
}

/** Simplified pad and stump geometry, in metres, for a missed delivery. */
export function resolveMissedDelivery(delivery: DeliveryChoice, hand: 'RHB' | 'LHB', offeredShot: boolean): 'lbw' | 'bowled' | null {
  if (isFrontFootNoBall(delivery)) return null;
  const ballRadius = BALL_RADIUS_METERS;
  const stumpHalfWidth = WICKET_WIDTH_METERS / 2;
  const stumpHeight = STUMP_HEIGHT_METERS;
  const impactZ = BATTER_CONTACT_Z + (delivery.batterPosition?.z ?? 0);
  const progress = (impactZ - 10) / (BATTER_CREASE_Z - 10);
  const impact = sampleDeliveryPath(delivery, progress);
  const wicketProgress = (10 - BATTER_STUMPS_Z) / (10 - BATTER_CREASE_Z);
  const wicket = sampleDeliveryPath(delivery, wicketProgress);
  const hitsWicket = Math.abs(wicket.x) <= stumpHalfWidth + ballRadius && wicket.y <= stumpHeight + ballRadius;
  if (!hitsWicket) return null;

  // This is a simplified fixed stance; it represents a pad, not a full body mesh.
  if (!deliveryHitsPad(delivery)) return 'bowled';
  const legSign = hand === 'RHB' ? -1 : 1;
  const pitchX = deliveryPitchPoint(delivery).x;
  if (delivery.aimTarget.z > impactZ && pitchX * legSign > stumpHalfWidth + ballRadius) return null;
  const impactInLine = Math.abs(impact.x) <= stumpHalfWidth + ballRadius;
  const impactOutsideOff = impact.x * legSign < -(stumpHalfWidth + ballRadius);
  return impactInLine || (!offeredShot && impactOutsideOff) ? 'lbw' : null;
}

/** Contact varies with timing and the line the ball actually reaches. */
export function battingContactZone(delivery: DeliveryChoice, timing: number, baseContact?: number): number {
  const base = baseContact ?? 0.5 + (timing - 0.5) * 0.4;
  return Math.max(0, Math.min(1, base + (deliveryContactPoint(delivery).x - (delivery.batterPosition?.x ?? 0)) * 0.25));
}

/** Ballistic vertical motion, with a simplified rebound from the pitch. */
export function deliveryVerticalPosition(progress: number, releaseY: number, bounceY: number, bounceProgress: number, durationSeconds: number): number {
  const bounceTime = Math.max(0.001, bounceProgress * durationSeconds);
  const t = Math.max(0, progress) * durationSeconds;
  const initialVelocity = (bounceY - releaseY) / bounceTime + 0.5 * 9.81 * bounceTime;
  if (t <= bounceTime) return releaseY + initialVelocity * t - 0.5 * 9.81 * t * t;
  const impactVelocity = initialVelocity - 9.81 * bounceTime;
  const reboundVelocity = Math.max(0, -impactVelocity) * 0.55;
  const afterBounce = t - bounceTime;
  return Math.max(bounceY, bounceY + reboundVelocity * afterBounce - 0.5 * 9.81 * afterBounce * afterBounce);
}

export function deliveryArrivalHeight(bounceZ: number, type: DeliveryType = 'medium', pace = 0.5): number {
  const bounceProgress = (bounceZ - 10) / (BATTER_CREASE_Z - 10);
  return deliveryVerticalPosition(1, 1.9, BALL_RADIUS_METERS, bounceProgress, deliveryDurationMs(type, pace) / 1000);
}

/** Front foot suits fuller balls; back foot gives more room for shorter balls. */
export function footworkFactor(footwork: ShotChoice['footwork'], length: DeliveryChoice['length']): number {
  if (!footwork) return 1;
  const shortBall = length === 'short' || length === 'bouncer';
  return (footwork === 'back_foot') === shortBall ? 1.08 : 0.8;
}

/** Assistance applies only to a human batting against the offline bot. */
export function battingAssistanceMultiplier(batter: Player, bowler: Player, difficulty: 'Rookie' | 'Medium' | 'Hard'): number {
  if (batter.isBot || !bowler.isBot) return 0;
  return difficulty === 'Rookie' ? 0.8 : difficulty === 'Medium' ? 0.4 : 0;
}

/** Flight quality uses the same assisted timing offset as contact decisions. */
export function shotFlightQuality(shot: ShotChoice, delivery: DeliveryChoice, assistMultiplier: number): number {
  const assist = Math.max(0, Math.min(1, assistMultiplier));
  const timingError = Math.abs(shot.timing - 0.5) * (1 - assist);
  return Math.max(0, 1 - timingError * 2 - Math.abs(shot.contactZone - 0.5)) * footworkFactor(shot.footwork, delivery.length);
}

/** Apply a 60 Hz damping coefficient consistently at any frame rate. */
export function frameIndependentDamping(perFrame: number, elapsedSeconds: number): number {
  return Math.pow(perFrame, Math.max(0, elapsedSeconds) * 60);
}

export function deliveryAnimationStep(elapsedMs: number, speedScale: number): number {
  return Math.min(Math.max(elapsedMs, 0), 50) * 60 / 1000 * speedScale;
}

export function bowlingReleaseTiming(elapsedMs: number): number {
  return Math.max(0, Math.min(1, elapsedMs / 2400));
}

/** Early and late releases deviate in opposite directions; accuracy limits the error. */
export function bowlingExecutionTarget(target: { x: number; z: number }, timing: number, accuracy: number): { x: number; z: number } {
  const error = (Math.max(0, Math.min(1, timing)) - 0.5) * 2;
  // Skill reduces release error, but a mistimed release still changes the ball.
  const inaccuracy = 0.25 + 0.75 * (1 - Math.max(0, Math.min(100, accuracy)) / 100);
  return {
    x: Math.max(-1.5, Math.min(1.5, target.x + error * inaccuracy * 0.3)),
    z: Math.max(-8.2, Math.min(0.5, target.z - error * inaccuracy))
  };
}

const DELIVERY_DIFFICULTIES: Record<string, number> = {
  yorker: 0.8,
  full: 0.5,
  good: 0.4,
  short: 0.3,
  bouncer: 0.6
};

const SHOT_RISKS: Record<ShotType, number> = {
  defensive: 0.02,
  grounded: 0.1,
  lofted: 0.35,
  power: 0.6
};

const SHOT_MULTIPLIERS: Record<ShotType, number> = {
  defensive: 0.0,
  grounded: 0.3,
  lofted: 0.85,
  power: 1.1
};

/**
 * Calculates ball threat based on bowler stats and delivery choice.
 */
export function getBallThreat(bowler: Player, delivery: DeliveryChoice): number {
  const acc = bowler.stats.bowling.accuracy;
  const varStat = bowler.stats.bowling.variation;
  const diff = DELIVERY_DIFFICULTIES[delivery.length] || 0.4;
  return (acc / 100) * 0.5 + (varStat / 100) * 0.3 + diff;
}

/**
 * Evaluates whether a batting stroke results in a wicket.
 * Returns { isWicket: boolean; reason: string; safeWindowMs: number }
 */
export function evaluateWicket(
  batter: Player,
  bowler: Player,
  delivery: DeliveryChoice,
  shot: ShotChoice,
  assistMultiplier: number = 0
): { isWicket: boolean; reason: string; safeWindowMs: number; isEdgeFallback?: boolean; outerToleranceMs?: number; missed?: boolean } {
  const shotRisk = SHOT_RISKS[shot.type];
  const ballThreat = getBallThreat(bowler, delivery);
  const techniqueResist = batter.stats.batting.technique / 100;
  
  const effectiveRisk = shotRisk * ballThreat * (1 - techniqueResist);
  const footwork = footworkFactor(shot.footwork, delivery.length);
  const safeWindowMs = 180 * (1 - effectiveRisk) * footwork;
  
  let outerToleranceMs = safeWindowMs / 2;
  if (!batter.isBot && bowler.isBot) {
    const rank = bowler.rank;
    if (rank === 'Elite' || rank === 'Legend') {
      outerToleranceMs = 80;
    } else if (rank === 'Gold') {
      outerToleranceMs = 120;
    } else {
      outerToleranceMs = 180;
    }
  } else if (!batter.isBot && !bowler.isBot) {
    outerToleranceMs = 120; // Default for PvP
  }
  // The default tolerance is derived from safeWindowMs and is already scaled.
  if (!batter.isBot) outerToleranceMs *= footwork;
  
  // Map relative shot timing (0.0 to 1.0) to milliseconds deviation
  // Perfect timing is 0.5. Swing window is 500ms total.
  const rawTimingOffset = Math.abs(shot.timing - 0.5);
  const effectiveOffset = rawTimingOffset * (1 - assistMultiplier);
  const deviationMs = effectiveOffset * 500;
  
  const isCleanHit = deviationMs <= safeWindowMs / 2;
  const isWithinTolerance = deviationMs <= outerToleranceMs;
  
  let isWicket = false;
  let isEdgeFallback = !isCleanHit && isWithinTolerance;
  let reason = '';
  const missed = !isWithinTolerance || Math.abs(deliveryContactPoint(delivery).x - (delivery.batterPosition?.x ?? 0)) > 1.25;

  // Shot direction is the intended outgoing direction, not the incoming
  // ball's contact angle. Timing determines contact and must not rewrite aim.
  
  if (missed) {
    const dismissal = resolveMissedDelivery(delivery, batter.batterHand || 'RHB', true);
    isWicket = dismissal !== null;
    reason = dismissal === 'lbw' ? 'LBW' : dismissal === 'bowled' ? 'Bowled' : 'Missed delivery!';
  }
  
  return {
    isWicket,
    reason,
    safeWindowMs,
    isEdgeFallback,
    outerToleranceMs,
    missed
  };
}

/**
 * Computes hit carry distance in meters.
 */
export function calculateDistance(
  batter: Player,
  bowler: Player,
  delivery: DeliveryChoice,
  shot: ShotChoice,
  safeWindowMs: number,
  isEdgeFallback: boolean = false,
  assistMultiplier: number = 0
): { distance: number; isMiscueWicket: boolean; miscueReason: string } {
  const power = batter.stats.batting.power;
  const mult = SHOT_MULTIPLIERS[shot.type];
  
  const baseDistance = power * mult * 1.5;
  
  const rawTimingOffset = Math.abs(shot.timing - 0.5);
  const effectiveOffset = rawTimingOffset * (1 - assistMultiplier);
  const deviationMs = effectiveOffset * 500;
  let timingModifier = 0.2;
  
  if (deviationMs <= safeWindowMs * 0.1) {
    timingModifier = 1.0;
  } else if (deviationMs <= safeWindowMs * 0.25) {
    timingModifier = 0.8;
  } else if (deviationMs <= safeWindowMs * 0.5) {
    timingModifier = 0.5;
  } else if (isEdgeFallback) {
    timingModifier = 0.15;
  }
  
  const contactDev = Math.abs(shot.contactZone - 0.5);
  let contactModifier = 0.4;
  if (contactDev <= 0.08) {
    contactModifier = 1.0;
  } else if (contactDev <= 0.2) {
    contactModifier = 0.7;
  }
  if (isEdgeFallback) {
    contactModifier = 0.3;
  }
  
  const acc = bowler.stats.bowling.accuracy;
  const varStat = bowler.stats.bowling.variation;
  const diff = DELIVERY_DIFFICULTIES[delivery.length] || 0.4;
  const bowlingResistance = ((acc + varStat) / 2 / 100) * diff * 30;
  
  let distance = (baseDistance * timingModifier * contactModifier) - bowlingResistance;
  if (!isEdgeFallback && deviationMs > safeWindowMs / 2) {
    distance = 0;
  } else {
    distance = Math.max(0, parseFloat(distance.toFixed(1)));
  }

  // Safe Edge Deflection System overrides distance for 1-2 runs
  const isSafeEdge = isEdgeFallback && assistMultiplier >= 0.3;
  if (isSafeEdge) {
    distance = 15.0 + Math.random() * 10.0; // 15 to 25 meters (safe 1-2 runs distance)
  }
  
  // There are no simulated fielders yet, so a short hit cannot be called caught.
  const isMiscueWicket = false;
  const miscueReason = '';

  // Calibrate carry/roll equations so the resulting shot carries/rolls at least 25m to 55m.
  if (!batter.isBot && bowler.isBot && bowler.rank === 'Bronze') { // Rookie mode
    if (distance > 0 && distance < 25) {
      distance = 25.0 + Math.random() * 30.0; // 25 to 55m
    }
  }
  
  return {
    distance,
    isMiscueWicket,
    miscueReason
  };
}

/**
 * Check the modeled front-foot landing and the line at the batter.
 */
export function checkExtraBall(delivery: DeliveryChoice, _batterHand: 'RHB' | 'LHB' = 'RHB'): { isExtra: boolean; type: 'wide' | 'noball' | null } {
  if (isFrontFootNoBall(delivery)) {
    return { isExtra: true, type: 'noball' };
  }

  const ballX = deliveryContactPoint(delivery).x;
  const relativeX = ballX - (delivery.batterPosition?.x ?? 0);
  // Moving away cannot turn a delivery reachable from the original stance into a wide.
  if (Math.abs(ballX) > 0.89 && Math.abs(relativeX) > 0.89) {
    return { isExtra: true, type: 'wide' };
  }

  return { isExtra: false, type: null };
}

export function getLineTypeFromAimX(aimX: number, batterHand: 'RHB' | 'LHB' = 'RHB'): import('./types').LineType {
  if (batterHand === 'RHB') {
    if (aimX > 0.2) return 'off';
    if (aimX < -0.2) return 'leg';
    return 'middle';
  } else { // LHB
    if (aimX < -0.2) return 'off';
    if (aimX > 0.2) return 'leg';
    return 'middle';
  }
}

export function getAimXFromLineType(line: import('./types').LineType, batterHand: 'RHB' | 'LHB' = 'RHB'): number {
  let target = 0;
  if (line === 'off') target = 0.45;
  if (line === 'leg') target = -0.45;
  return batterHand === 'LHB' ? -target : target;
}

export const delta_t_base = 0.15;

export const M_bot: Record<string, number> = {
  Rookie: 1.8,
  Medium: 1.0,
  Hard: 0.5
};

export const M_shot: Record<string, number> = {
  defensive: 1.6,
  grounded: 1.2,
  lofted: 0.7,
  power: 0.7
};

export const M_delivery: Record<string, number> = {
  good: 1.0,
  full: 0.8,
  short: 0.8,
  yorker: 0.6,
  bouncer: 0.6
};

export function calculateEffectiveWindow(botTier: string, shotType: string, deliveryLength: string): number {
  const m_bot = M_bot[botTier] || 1.0;
  const m_shot = M_shot[shotType] || 1.0;
  const m_del = M_delivery[deliveryLength] || 1.0;
  return delta_t_base * m_bot * m_shot * m_del;
}

export function calculateContactQuality(delta_t: number, delta_t_window: number): number {
  return Math.max(0, 1 - (delta_t / delta_t_window));
}

export function getContactQualityTier(Q: number): string {
  if (Q >= 0.85) return 'Perfect';
  if (Q >= 0.40) return 'Good / Early-Late';
  return 'Poor';
}

export function calculateShotTrajectory(
  Q: number,
  _t_input: number,
  _t_ideal: number,
  theta_shot: number,
  V_in: { x: number, y: number, z: number },
  _V_bat: { x: number, y: number, z: number },
  _isRHB: boolean = true,
  _isHuman: boolean = false,
  _difficulty: string = 'Medium',
  shotType: string = 'power',
  batterPower: number = 50
): { x: number, y: number, z: number } {
  let Vy = 0;
  let Vz = 0;
  
  switch (shotType) {
    case 'lofted':
      Vy = 16.0;
      Vz = 34.0;
      break;
    case 'power':
      Vy = 8.0;
      Vz = 44.0;
      break;
    case 'grounded':
      Vy = 0.0;
      Vz = 30.0;
      break;
    case 'defensive':
      Vy = 2.0;
      Vz = 8.0;
      break;
    default:
      Vy = 8.0;
      Vz = 44.0;
      break;
  }
  
  // Use a unit direction vector: tangent loses the sign of the forward
  // component and becomes unbounded for straight and backward shots.
  let Vx = Vz * Math.cos(theta_shot);
  Vz *= -Math.sin(theta_shot);
  
  let mag = Math.sqrt(Vx * Vx + Vy * Vy + Vz * Vz);
  let cap = 40.0;
  if (shotType === 'grounded') cap = 28.0;
  else if (shotType === 'lofted') cap = 34.0;
  else if (shotType === 'power') cap = 38.0;
  
  if (mag > cap) {
    const scale = cap / mag;
    Vx *= scale;
    Vy *= scale;
    Vz *= scale;
  }

  // Imperfect timing/contact reduces exit speed instead of producing the
  // same flight for every successful shot of a given type.
  const quality = Math.max(0, Math.min(1, Number.isFinite(Q) ? Q : 0));
  const powerFactor = 0.75 + Math.max(0, Math.min(100, batterPower)) / 200;
  const incomingSpeed = Math.hypot(V_in.x, V_in.y, V_in.z);
  const incomingFactor = incomingSpeed > 0 ? Math.max(0.9, Math.min(1.08, 0.9 + incomingSpeed * 0.003)) : 1;
  const speedFactor = (0.55 + 0.45 * quality) * powerFactor * incomingFactor;
  Vx *= speedFactor;
  Vy *= speedFactor;
  Vz *= speedFactor;
  // Poor contact carries more of the incoming ball's lateral movement.
  Vx += V_in.x * 0.12 * (1 - quality);
  Vz += V_in.z * 0.03 * (1 - quality);
  
  return { x: Vx, y: Vy, z: Vz };
}

/**
 * Dynamically evaluate runs based on final physical distance and bounce status.
 */
export function getParabolicFlightPosition(
  progress: number,
  release: { x: number, y: number, z: number },
  bounce: { x: number, y: number, z: number },
  end: { x: number, y: number, z: number }
): { x: number, y: number, z: number } {
  const totalZ = end.z - release.z;
  const t_bounce = totalZ !== 0 ? (bounce.z - release.z) / totalZ : 0.5;
  
  let x = 0;
  let y = 0;
  let z = 0;
  
  if (progress <= t_bounce) {
    const f = t_bounce > 0 ? progress / t_bounce : 1.0;
    x = release.x + (bounce.x - release.x) * f;
    z = release.z + (bounce.z - release.z) * f;
    y = release.y + (bounce.y - release.y) * f + 0.4 * f * (1 - f);
  } else {
    const f = (1 - t_bounce) > 0 ? (progress - t_bounce) / (1 - t_bounce) : 1.0;
    x = bounce.x + (end.x - bounce.x) * f;
    z = bounce.z + (end.z - bounce.z) * f;
    y = bounce.y + (end.y - bounce.y) * f + 0.3 * f * (1 - f);
  }
  
  return { x, y, z };
}

/** Apply pace swing in flight and spin turn after the bounce. */
export function getDeliveryFlightPosition(
  progress: number,
  release: { x: number; y: number; z: number },
  bounce: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  type: DeliveryType,
  turn = 0.5,
  swing = 0,
  pace = 0.5
): { x: number; y: number; z: number } {
  const position = getParabolicFlightPosition(progress, release, bounce, end);
  const bounceProgress = (bounce.z - release.z) / (end.z - release.z);
  const swingProgress = bounceProgress > 0 ? Math.max(0, progress / bounceProgress) : 1;
  const swingFactor = swingProgress <= 1 ? swingProgress * swingProgress : 1 + 2 * (swingProgress - 1);
  position.x += deliverySwingAtBounce(type, swing, bounce.z) * swingFactor;
  position.y = deliveryVerticalPosition(progress, release.y, bounce.y, bounceProgress, deliveryDurationMs(type, pace) / 1000);
  if (progress > bounceProgress && bounceProgress < 1) {
    position.x += deliveryTurn(type, turn) * (progress - bounceProgress) / (1 - bounceProgress);
  }
  return position;
}

export function evaluateFinalOutcome(distance: number, hasBounced: boolean, reachedBoundary = distance >= 65): number {
  if (reachedBoundary && !hasBounced) {
    return 6;
  } else if (reachedBoundary && hasBounced) {
    return 4;
  } else if (distance >= 40) {
    return distance >= 55 ? 3 : 2;
  } else if (distance >= 15 && distance < 40) {
    return distance >= 25 ? 2 : 1;
  } else {
    return distance >= 5 ? 1 : 0;
  }
}


export function calculateShotDistance(ball: { position: { x: number, z: number } }, origin = { x: 0, z: -8.8 }): number {
  if (!ball || !ball.position) return 0.0;
  const dx = ball.position.x - origin.x;
  const dz = ball.position.z - origin.z;
  let shotDistanceMeters = Math.hypot(dx, dz);
  
  if (isNaN(shotDistanceMeters) || !isFinite(shotDistanceMeters) || shotDistanceMeters < 0) {
    shotDistanceMeters = 0.0;
  }
  return Math.min(shotDistanceMeters, 130.0);
}

export function getDirectionName(dir: number): string {
  switch(dir) {
    case 0: return "Straight Drive";
    case 1: return "Off-side Cover Drive";
    case 2: return "Point / Square Cut";
    case 3: return "Third Man / Behind Off";
    case 4: return "Fine Leg / Behind Leg";
    case 5: return "Leg-side glance";
    case 6: return "On-side sweep";
    case 7: return "Leg-side On Drive / Pull";
    default: return "Unknown Direction";
  }
}

export function getAimZFromLength(length: import('./types').LengthType): number {
  switch (length) {
    case 'yorker': return -8.2;
    case 'full': return -6.5;
    case 'good': return -4.5;
    case 'short': return -2.5;
    case 'bouncer': return -0.5;
    default: return -4.5;
  }
}
