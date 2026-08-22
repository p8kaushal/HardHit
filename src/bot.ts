import { Player, DeliveryChoice, ShotChoice, ShotType, LineType, LengthType, DeliveryType } from './types';
import { getBallThreat } from './formula';

const LINES: LineType[] = ['off', 'middle', 'leg'];
const LENGTHS: LengthType[] = ['bouncer', 'short', 'good', 'full', 'yorker'];
const TYPES: DeliveryType[] = ['fast', 'medium', 'slow', 'offspin', 'legspin'];

// Map Line to default X target
const LINE_X_MAP: Record<LineType, number> = {
  middle: 0.0,
  off: 0.9,
  leg: -0.9
};

// Map Length to default Z offset from bowling crease (total distance 20m)
const LENGTH_Z_MAP: Record<LengthType, number> = {
  yorker: 17.5,
  full: 15.0,
  good: 12.0,
  short: 9.5,
  bouncer: 7.0
};

function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdDev * randStdNormal;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Bot generates its 3D delivery parameters.
 */
export function botChooseDelivery(_botPlayer: Player, _difficulty: 'Easy' | 'Medium' | 'Hard'): DeliveryChoice {
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  const length = LENGTHS[Math.floor(Math.random() * LENGTHS.length)];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  
  // Calculate raw targeting coordinates
  let baseTargetX = LINE_X_MAP[line];
  let baseTargetZ = LENGTH_Z_MAP[length];
  
  // Apply aiming inaccuracy deviation depending on bowler Accuracy stat
  const accuracyStat = _botPlayer.stats.bowling.accuracy;
  const inaccuracy = Math.max(0.05, 0.65 - (accuracyStat / 100) * 0.55);
  
  const targetX = clamp(baseTargetX + randomNormal(0, inaccuracy), -1.5, 1.5);
  const targetZ = clamp(baseTargetZ + randomNormal(0, inaccuracy * 1.5), 4.0, 19.5);

  // Release timing accuracy scales with Accuracy stat
  const timingStdDev = Math.max(0.015, 0.15 - (accuracyStat / 100) * 0.13);

  const releaseTiming = clamp(randomNormal(0.5, timingStdDev), 0.05, 0.95);

  return {
    aimTarget: { x: targetX, z: targetZ },
    line,
    length,
    type,
    releaseTiming
  };
}

/**
 * Bot generates its shot response.
 */
export function botChooseShot(
  botPlayer: Player,
  bowler: Player,
  delivery: DeliveryChoice,
  difficulty: 'Easy' | 'Medium' | 'Hard'
): ShotChoice {
  let shotType: ShotType = 'lofted';
  
  if (difficulty === 'Easy') {
    const rand = Math.random();
    if (rand < 0.2) shotType = 'defensive';
    else if (rand < 0.5) shotType = 'grounded';
    else if (rand < 0.8) shotType = 'lofted';
    else shotType = 'power';
  } else {
    const threat = getBallThreat(bowler, delivery);
    if (threat > 0.85) {
      shotType = Math.random() < 0.5 ? 'defensive' : 'grounded';
    } else if (threat < 0.55) {
      shotType = Math.random() < 0.4 ? 'power' : 'lofted';
    } else {
      shotType = Math.random() < 0.6 ? 'lofted' : 'grounded';
    }
  }

  // Aim direction (0-7 clock) based on ball line
  let direction = Math.floor(Math.random() * 8);
  if (delivery.aimTarget.x > 0.3) {
    // Aim off side: zones 1, 2, 3
    direction = [1, 2, 3][Math.floor(Math.random() * 3)];
  } else if (delivery.aimTarget.x < -0.3) {
    // Aim leg side: zones 5, 6, 7
    direction = [5, 6, 7][Math.floor(Math.random() * 3)];
  } else {
    // Straight: zones 0, 4
    direction = [0, 4, 1, 7][Math.floor(Math.random() * 4)];
  }

  // Timing execution scales dynamically with batter Timing stat
  const timingStat = botPlayer.stats.batting.timing;
  const timingStdDev = Math.max(0.015, 0.15 - (timingStat / 100) * 0.13);
  
  const timing = clamp(randomNormal(0.5, timingStdDev), 0.15, 0.85);
  
  // Contact execution scales dynamically with batter Timing stat
  const contactStdDev = Math.max(0.02, 0.18 - (timingStat / 100) * 0.15);
  const contactZone = clamp(randomNormal(0.5, contactStdDev), 0.15, 0.85);

  return {
    type: shotType,
    direction,
    timing,
    contactZone
  };
}
