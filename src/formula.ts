import { Player, DeliveryChoice, ShotChoice, ShotType } from './types';

export const SIX_THRESHOLD = 70;
export const BAT_ANIMATION_LEAD_TIME = 0.15; // 150ms swing apex delay

/**
 * Predicted Arrival Z Timestamp Solver
 */
export function calculateBallArrival(
  releaseZ: number,
  creaseZ: number,
  vZ: number,
  deceleration: number,
  timeDilation: number
): number {
  const distance = Math.abs(creaseZ - releaseZ);
  const flightDuration = distance / vZ;
  return flightDuration * timeDilation * (1 + deceleration);
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
    // Generous spatial raycast frustum sweeping on Easy mode
    if (Math.abs(ballX) <= 0.89) {
      coneWidth = 360; // Guarantee bat contact for balls inside pitch bounds
    } else {
      coneWidth = 45; // Rookie Bot default
    }
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
  _Q: number,
  _t_input: number,
  _t_ideal: number,
  theta_shot: number,
  _V_in: { x: number, y: number, z: number },
  _V_bat: { x: number, y: number, z: number },
  _isRHB: boolean = true,
  _isHuman: boolean = false,
  _difficulty: string = 'Medium',
  shotType: string = 'power'
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
  
  let Vx = Vz * Math.tan(theta_shot);
  
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

export function evaluateFinalOutcome(distance: number, hasBounced: boolean): number {
  if (distance >= 65 && !hasBounced) {
    return 6;
  } else if (distance >= 65 && hasBounced) {
    return 4;
  } else if (distance >= 40 && distance < 65) {
    return distance >= 55 ? 3 : 2;
  } else if (distance >= 15 && distance < 40) {
    return distance >= 25 ? 2 : 1;
  } else {
    return distance >= 5 ? 1 : 0;
  }
}


export function calculateShotDistance(ball: { position: { x: number, z: number } } | any): number {
  if (!ball || !ball.position) return 0.0;
  const dx = ball.position.x - 0.0;
  const dz = ball.position.z - (-18.5);
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
