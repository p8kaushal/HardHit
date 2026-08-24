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
export function botChooseDelivery(_botPlayer: Player, difficulty: 'Easy' | 'Medium' | 'Hard'): DeliveryChoice {
  const line = LINES[Math.floor(Math.random() * LINES.length)];
  const length = LENGTHS[Math.floor(Math.random() * LENGTHS.length)];
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  
  // Calculate raw targeting coordinates
  let baseTargetX = LINE_X_MAP[line];
  let baseTargetZ = LENGTH_Z_MAP[length];
  
  // Apply aiming inaccuracy deviation depending on bowler Accuracy stat
  const accuracyStat = _botPlayer.stats.bowling.accuracy;
  const inaccuracy = Math.max(0.05, 0.65 - (accuracyStat / 100) * 0.55);
  
  let targetX = clamp(baseTargetX + randomNormal(0, inaccuracy), -1.5, 1.5);
  const targetZ = clamp(baseTargetZ + randomNormal(0, inaccuracy * 1.5), 4.0, 19.5);

  // Calibrate accuracy metrics: Rookie bowls 90% legal, Medium 95%, Hard 98%
  let legalChance = 0.90;
  if (difficulty === 'Medium') legalChance = 0.95;
  else if (difficulty === 'Hard') legalChance = 0.98;

  if (Math.random() < legalChance) {
    // Force legal delivery (for RHB defaults)
    targetX = clamp(targetX, -0.88, 0.14);
  } else {
    // Force illegal delivery (wide on leg side, but clamped to 0.7 later in game.ts)
    targetX = 0.5; // > 0.15 is wide for RHB
  }

  // Release timing accuracy scales with Accuracy stat
  const timingStdDev = Math.max(0.015, 0.15 - (accuracyStat / 100) * 0.13);

  // Bound bot release timing calculations between 0.15 and 0.85
  const releaseTiming = clamp(randomNormal(0.5, timingStdDev), 0.15, 0.85);

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

  // Adjust bot timing standard deviation based on difficulty
  let timingStdDev = 0.10; // Rookie/Easy bot default (±0.10s)
  if (difficulty === 'Medium') timingStdDev = 0.05;
  else if (difficulty === 'Hard') timingStdDev = 0.02;
  
  // Bot swings relative to the actual ball crease arrival frame (arrivalFrame = 50)
  // ui.ts calculation: timing = 0.5 + (currentFrame - 50) / 40
  // So randomFrame = randomNormal(50, timingStdDev * 40)
  const arrivalFrame = 50;
  const swingFrame = randomNormal(arrivalFrame, timingStdDev * 40);
  const timing = clamp(0.5 + (swingFrame - arrivalFrame) / 40, 0.15, 0.85);
  
  // Contact execution scales dynamically with batter Timing stat
  const timingStat = botPlayer.stats.batting.timing;
  const contactStdDev = Math.max(0.02, 0.18 - (timingStat / 100) * 0.15);
  const contactZone = clamp(randomNormal(0.5, contactStdDev), 0.15, 0.85);

  return {
    type: shotType,
    direction,
    timing,
    contactZone
  };
}
