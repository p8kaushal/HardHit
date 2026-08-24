import { Player, DeliveryChoice, ShotChoice, ShotType, LineType, LengthType, DeliveryType } from './types';


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

  // Calibrate accuracy metrics: Rookie bowls <8% wides, Medium <3%, Hard 0%
  let legalChance = 0.93; // 93% chance of being legal (leaves 7% chance for illegal, which is < 8%)
  if (difficulty === 'Medium') legalChance = 0.98; // 98% -> 2% < 3%
  else if (difficulty === 'Hard') legalChance = 1.00; // 0% wides

  if (Math.random() < legalChance) {
    // Force legal delivery (for RHB defaults)
    targetX = clamp(targetX, -0.88, 0.14);
  } else {
    // Force illegal delivery (wide on leg side, but clamped to 0.7 later in game.ts)
    targetX = 0.5; // > 0.15 is wide for RHB
  }

  // Release timing accuracy scales with Accuracy stat
  const timingStdDev = Math.max(0.015, 0.15 - (accuracyStat / 100) * 0.13);

  // Bound bot release timing calculations based on difficulty
  let timingMin = 0.15, timingMax = 0.85;
  if (difficulty === 'Medium') {
    timingMin = 0.35;
    timingMax = 0.65;
  } else if (difficulty === 'Hard') {
    timingMin = 0.5;
    timingMax = 0.5;
  }

  const releaseTiming = clamp(randomNormal(0.5, timingStdDev), timingMin, timingMax);

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
  _bowler: Player,
  delivery: DeliveryChoice,
  difficulty: 'Easy' | 'Medium' | 'Hard'
): ShotChoice {
  let shotType: ShotType = 'lofted';
  
  if (difficulty === 'Easy') {
    const rand = Math.random();
    if (rand < 0.1) shotType = 'defensive';
    else if (rand < 0.2) shotType = 'grounded';
    else if (rand < 0.4) shotType = 'lofted';
    else shotType = 'power';
  } else if (difficulty === 'Medium') {
    const rand = Math.random();
    if (rand < 0.05) shotType = 'defensive';
    else if (rand < 0.1) shotType = 'grounded';
    else if (rand < 0.3) shotType = 'lofted';
    else shotType = 'power';
  } else {
    // Hard: Very aggressive
    const rand = Math.random();
    if (rand < 0.05) shotType = 'grounded';
    else if (rand < 0.35) shotType = 'lofted';
    else shotType = 'power';
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
  // Calibrated to hit GDD targets:
  // Rookie: ~40% contact, ~6-10 runs/over
  let timingStdDev = 0.04;
  let timingOffset = -0.21; 
  
  if (difficulty === 'Medium') {
    // Medium: ~75% contact, ~14-20 runs/over
    timingStdDev = 0.03;
    timingOffset = -0.13;
  } else if (difficulty === 'Hard') {
    // Hard: ~92% contact, ~26-34 runs/over
    timingStdDev = 0.02;
    timingOffset = -0.07;
  }
  
  const arrivalFrame = 50;
  const swingFrame = randomNormal(arrivalFrame + (timingOffset * 40), timingStdDev * 40);
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
