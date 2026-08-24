import { Player, DeliveryChoice, ShotChoice, ShotType } from './types';

export const SIX_THRESHOLD = 70;

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
): { isWicket: boolean; reason: string; safeWindowMs: number; isEdgeFallback?: boolean; outerToleranceMs?: number } {
  const shotRisk = SHOT_RISKS[shot.type];
  const ballThreat = getBallThreat(bowler, delivery);
  const techniqueResist = batter.stats.batting.technique / 100;
  
  const effectiveRisk = shotRisk * ballThreat * (1 - techniqueResist);
  const safeWindowMs = 180 * (1 - effectiveRisk);
  
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
  
  // Map relative shot timing (0.0 to 1.0) to milliseconds deviation
  // Perfect timing is 0.5. Swing window is 500ms total.
  const rawTimingOffset = Math.abs(shot.timing - 0.5);
  const effectiveOffset = rawTimingOffset * (1 - assistMultiplier);
  const deviationMs = effectiveOffset * 500;
  
  const isCleanHit = deviationMs <= safeWindowMs / 2;
  const isWithinTolerance = deviationMs <= outerToleranceMs;
  
  let isWicket = !isWithinTolerance;
  let isEdgeFallback = !isCleanHit && isWithinTolerance;
  let reason = '';

  // 1. Difficulty Sweeping Collision Cones
  const batX = batter.batterHand === 'LHB' ? -0.45 : 0.45;
  const ballX = delivery.aimTarget.x;
  const deltaX = ballX - batX;
  const deltaZ = -1.0; 
  const ballAngle = Math.atan2(deltaZ, deltaX);
  
  const baseAngle = (shot.direction * Math.PI) / 4 - Math.PI / 2;
  const swingAngle = Math.atan2(Math.sin(baseAngle), (batter.batterHand === 'RHB' ? -1 : 1) * Math.cos(baseAngle));
  
  let angleDiff = Math.abs(ballAngle - swingAngle);
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  angleDiff = Math.abs(angleDiff);
  const angleDiffDeg = angleDiff * (180 / Math.PI);
  
  let coneWidth = 10; // Hard Bot (or no assist)
  if (assistMultiplier >= 0.7) {
    coneWidth = 45; // Rookie Bot
  } else if (assistMultiplier >= 0.3) {
    coneWidth = 25; // Medium Bot
  }
  
  const isInsideCone = angleDiffDeg <= coneWidth / 2;

  if (!isInsideCone) {
    isWicket = true;
    reason = 'Play and miss! Swung down the wrong line.';
  } else {
    // 2. Safe Edge Deflection System (resolveShot physics)
    if (!isCleanHit && coneWidth > 10) {
      isWicket = false; // Force 0% dismissal probability
      isEdgeFallback = true;
      // Override trajectory vector to vacant outfield (Third Man = 3, Fine Leg = 5)
      shot.direction = deltaX < 0 ? 3 : 5; 
      // Shot type will be processed safely in calculateDistance
    }
  }
  
  if (!batter.isBot && bowler.isBot && bowler.rank === 'Bronze') {
    isWicket = false;
    if (!isCleanHit) {
      isEdgeFallback = true;
    }
  }
  
  if (isWicket && !reason) {
    if (shot.timing < 0.5) {
      reason = shot.timing < 0.25 ? 'Bowled - played too early!' : 'LBW - beaten by length!';
    } else {
      reason = shot.timing > 0.75 ? 'Caught - top edge carried to the deep!' : 'Edged and Caught!';
    }
  }
  
  return {
    isWicket,
    reason,
    safeWindowMs,
    isEdgeFallback,
    outerToleranceMs
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
  
  // Miscue check: Lofted or Power shots falling below 12 meters are resolved as caught
  let isMiscueWicket = false;
  let miscueReason = '';
  if (!isSafeEdge && (shot.type === 'power' || shot.type === 'lofted') && distance < 12.0 && distance > 0) {
    if (!batter.isBot && bowler.isBot && bowler.rank === 'Bronze') {
      // Forgive miscue wicket in Rookie mode
    } else {
      isMiscueWicket = true;
      miscueReason = 'Caught! Miscued shot did not carry and was caught in the infield.';
    }
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
export function checkExtraBall(delivery: DeliveryChoice, _batterHand: 'RHB' | 'LHB' = 'RHB'): { isExtra: boolean; type: 'wide' | 'noball' | null } {
  if (delivery.releaseTiming < 0.05) {
    return { isExtra: true, type: 'wide' };
  } else if (delivery.releaseTiming > 0.95) {
    return { isExtra: true, type: 'noball' };
  }

  const x = delivery.aimTarget.x;
  // Measure strictly relative to absolute pitch center line (X=0.0m) bypassing stance offsets
  if (Math.abs(x) > 0.89) {
    return { isExtra: true, type: 'wide' };
  }

  return { isExtra: false, type: null };
}

export function getLineTypeFromAimX(aimX: number, batterHand: 'RHB' | 'LHB' = 'RHB'): import('./types').LineType {
  if (batterHand === 'RHB') {
    if (aimX < -0.2) return 'off';
    if (aimX > 0.2) return 'leg';
    return 'middle';
  } else { // LHB
    if (aimX > 0.2) return 'off';
    if (aimX < -0.2) return 'leg';
    return 'middle';
  }
}

export function getAimXFromLineType(line: import('./types').LineType, batterHand: 'RHB' | 'LHB' = 'RHB'): number {
  let target = 0;
  if (line === 'off') target = -0.6;
  if (line === 'leg') target = 0.4;
  return batterHand === 'LHB' ? -target : target;
}

export function verifyFormulas(): void {
  console.log("=== [FORMULA VERIFIER START] ===");
  
  const mockBatter: Player = {
    id: "test_bat",
    name: "Test Batter",
    isBot: false,
    xp: 0,
    rank: "Bronze",
    stats: {
      batting: { power: 50, timing: 50, placement: 50, technique: 50, stamina: 50 },
      bowling: { pace: 50, swing: 50, spin: 50, accuracy: 50, stamina: 50, variation: 50 }
    }
  };

  const mockBowler: Player = {
    id: "test_bowl",
    name: "Test Bowler",
    isBot: true,
    xp: 0,
    rank: "Bronze",
    stats: {
      batting: { power: 50, timing: 50, placement: 50, technique: 50, stamina: 50 },
      bowling: { pace: 50, swing: 50, spin: 50, accuracy: 50, stamina: 50, variation: 50 }
    }
  };

  const delivery: DeliveryChoice = {
    aimTarget: { x: 0, z: 12.0 },
    line: "middle",
    length: "good",
    type: "fast",
    releaseTiming: 0.5
  };

  const shotPerfect: ShotChoice = {
    direction: 0,
    type: "power",
    timing: 0.5,
    contactZone: 0.5
  };

  const w1 = evaluateWicket(mockBatter, mockBowler, delivery, shotPerfect);
  const d1 = calculateDistance(mockBatter, mockBowler, delivery, shotPerfect, w1.safeWindowMs);
  console.log(`[TEST 1] Perfect Power Swing: Wicket=${w1.isWicket} (Reason: ${w1.reason || 'None'}), Distance=${d1.distance}m`);

  const shotEarly: ShotChoice = {
    direction: 0,
    type: "power",
    timing: 0.2,
    contactZone: 0.5
  };
  const w2 = evaluateWicket(mockBatter, mockBowler, delivery, shotEarly);
  const d2 = calculateDistance(mockBatter, mockBowler, delivery, shotEarly, w2.safeWindowMs);
  console.log(`[TEST 2] Early Power Swing: Wicket=${w2.isWicket} (Reason: ${w2.reason || 'None'}), Distance=${d2.distance}m`);

  const badDelivery: DeliveryChoice = {
    aimTarget: { x: 0, z: 12.0 },
    line: "middle",
    length: "good",
    type: "fast",
    releaseTiming: 0.02
  };
  const e3 = checkExtraBall(badDelivery);
  console.log(`[TEST 3] Bad bowler release: isExtra=${e3.isExtra}, type=${e3.type}`);

  console.log("=== [FORMULA VERIFIER END] ===");
}

/**
 * Restrict lateral spin/seam velocity impulse (Vx) for all bot difficulties
 * so spin breaks do not push deliveries outside the wide lines (|X| > 0.89m)
 */
export function clampLateralVelocity(vx: number, difficulty: string): number {
  let maxVx = 0.21; // Easy/Rookie: aim up to 0.68 (0.89 - 0.68 = 0.21)
  if (difficulty === 'Medium') {
    maxVx = 0.44; // Medium: aim up to 0.45 (0.89 - 0.45 = 0.44)
  } else if (difficulty === 'Hard') {
    maxVx = 0.67; // Hard: aim up to 0.22 (0.89 - 0.22 = 0.67)
  }
  return Math.max(-maxVx, Math.min(maxVx, vx));
}
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
