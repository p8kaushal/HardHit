import { Player, DeliveryChoice, ShotChoice, ShotType } from './types';

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
  shot: ShotChoice
): { isWicket: boolean; reason: string; safeWindowMs: number } {
  const shotRisk = SHOT_RISKS[shot.type];
  const ballThreat = getBallThreat(bowler, delivery);
  const techniqueResist = batter.stats.batting.technique / 100;
  
  const effectiveRisk = shotRisk * ballThreat * (1 - techniqueResist);
  const safeWindowMs = 180 * (1 - effectiveRisk);
  
  // Map relative shot timing (0.0 to 1.0) to milliseconds deviation
  // Perfect timing is 0.5. Swing window is 500ms total.
  const deviationMs = Math.abs(shot.timing - 0.5) * 500;
  
  const isWicket = deviationMs > safeWindowMs / 2;
  let reason = '';
  
  if (isWicket) {
    if (shot.timing < 0.5) {
      reason = shot.timing < 0.25 ? 'Bowled - played too early!' : 'LBW - beaten by length!';
    } else {
      reason = shot.timing > 0.75 ? 'Caught - top edge carried to the deep!' : 'Edged and Caught!';
    }
  }
  
  return {
    isWicket,
    reason,
    safeWindowMs
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
  safeWindowMs: number
): { distance: number; isMiscueWicket: boolean; miscueReason: string } {
  const power = batter.stats.batting.power;
  const mult = SHOT_MULTIPLIERS[shot.type];
  
  const baseDistance = power * mult * 1.5; // Base scaling to hit ~55-75m at power=50/mult=1.1
  
  // Timing modifier
  const deviationMs = Math.abs(shot.timing - 0.5) * 500;
  let timingModifier = 0.2; // poor
  
  if (deviationMs <= safeWindowMs * 0.1) {
    timingModifier = 1.0; // perfect
  } else if (deviationMs <= safeWindowMs * 0.25) {
    timingModifier = 0.8; // good
  } else if (deviationMs <= safeWindowMs * 0.5) {
    timingModifier = 0.5; // early/late
  }
  
  // Contact modifier
  const contactDev = Math.abs(shot.contactZone - 0.5);
  let contactModifier = 0.4; // edge
  if (contactDev <= 0.08) {
    contactModifier = 1.0; // sweet spot
  } else if (contactDev <= 0.2) {
    contactModifier = 0.7; // good contact
  }
  
  // Bowling resistance
  const acc = bowler.stats.bowling.accuracy;
  const varStat = bowler.stats.bowling.variation;
  const diff = DELIVERY_DIFFICULTIES[delivery.length] || 0.4;
  const bowlingResistance = ((acc + varStat) / 2 / 100) * diff * 30;
  
  let distance = (baseDistance * timingModifier * contactModifier) - bowlingResistance;
  distance = Math.max(0, parseFloat(distance.toFixed(1)));
  
  // Miscue check: Lofted or Power shots falling below 12 meters are resolved as caught
  let isMiscueWicket = false;
  let miscueReason = '';
  if ((shot.type === 'power' || shot.type === 'lofted') && distance < 12.0 && distance > 0) {
    isMiscueWicket = true;
    miscueReason = 'Caught! Miscued shot did not carry and was caught in the infield.';
  }
  
  return {
    distance,
    isMiscueWicket,
    miscueReason
  };
}

/**
 * Check for wide/no-ball based on release timing.
 */
export function checkExtraBall(delivery: DeliveryChoice): { isExtra: boolean; type: 'wide' | 'noball' | null } {
  if (delivery.releaseTiming < 0.08) {
    return { isExtra: true, type: 'wide' };
  } else if (delivery.releaseTiming > 0.92) {
    return { isExtra: true, type: 'noball' };
  }
  return { isExtra: false, type: null };
}
