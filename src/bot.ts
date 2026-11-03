import { Player, DeliveryChoice, ShotChoice, ShotType } from './types';
import { deliveryContactPoint, getAimXFromLineType, sampleFrontFootLanding } from './formula';


// Unused constants removed

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
export function botChooseDelivery(bowler: Player, difficulty: 'Rookie' | 'Medium' | 'Hard' = 'Medium', batterHand: 'RHB' | 'LHB' = 'RHB'): DeliveryChoice {
  const pace = bowler.stats.bowling.pace;
  const deliveryType: import('./types').DeliveryType = pace > 70 ? 'fast' : (pace > 40 ? 'medium' : 'slow');

  const lines: import('./types').LineType[] = ['off', 'middle', 'leg'];
  const lengths: import('./types').LengthType[] = ['bouncer', 'short', 'good', 'full', 'yorker'];

  let line = lines[Math.floor(Math.random() * lines.length)];
  let length = lengths[Math.floor(Math.random() * lengths.length)];
  
  if (difficulty === 'Hard' && Math.random() > 0.4) {
    line = 'off';
    length = Math.random() > 0.5 ? 'good' : 'yorker';
  } else if (difficulty === 'Medium' && Math.random() > 0.6) {
    line = Math.random() > 0.5 ? 'off' : 'middle';
    length = 'good';
  }

  // Use formula utility if available, else approximate
  const baseAimX = getAimXFromLineType(line, batterHand);

  let aimZ = -3.5;
  if (length === 'yorker') aimZ = -7.5;
  else if (length === 'full') aimZ = -5.5;
  else if (length === 'good') aimZ = -3.5;
  else if (length === 'short') aimZ = -1.5;
  else if (length === 'bouncer') aimZ = 0.5;

  const errorMargin = (100 - bowler.stats.bowling.accuracy) / 100;
  const xWobble = (Math.random() - 0.5) * errorMargin;
  const zWobble = (Math.random() - 0.5) * errorMargin * 2;

  const releaseTiming = 0.45 + (Math.random() * 0.1); 

  return {
    aimTarget: { x: baseAimX + xWobble, z: aimZ + zWobble },
    line,
    length,
    type: deliveryType,
    releaseTiming,
    frontFootHeel: sampleFrontFootLanding(bowler.stats.bowling.accuracy, 0.5, Math.random()),
    bowlingArm: bowler.bowlingArm || 'Right',
    overTheWicket: Math.random() > 0.3
  };
}

/**
 * Bot generates its shot response.
 */
export function botChooseShot(
  batter: Player,
  _bowler: Player,
  delivery: DeliveryChoice,
  difficulty: 'Rookie' | 'Medium' | 'Hard' = 'Medium'
): ShotChoice {
  let shotType: ShotType = 'lofted';
  
  if (difficulty === 'Rookie') {
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
  const lineAtBatter = deliveryContactPoint(delivery).x;
  if (lineAtBatter > 0.3) {
    // Aim off side: zones 1, 2, 3
    direction = [1, 2, 3][Math.floor(Math.random() * 3)];
  } else if (lineAtBatter < -0.3) {
    // Aim leg side: zones 5, 6, 7
    direction = [5, 6, 7][Math.floor(Math.random() * 3)];
  } else {
    // Straight: zones 0, 4
    direction = [0, 4, 1, 7][Math.floor(Math.random() * 4)];
  }

  // Timing is normalised to the same 0..1 scale as player input. A zero
  // offset centres decisions on arrival; difficulty changes consistency.
  let timingStdDev = 0.12;
  
  if (difficulty === 'Medium') {
    // Medium: ~75% contact, ~14-20 runs/over
    timingStdDev = 0.075;
  } else if (difficulty === 'Hard') {
    // Hard: ~92% contact, ~26-34 runs/over
    timingStdDev = 0.045;
  }
  
  const arrivalFrame = 50;
  const swingFrame = randomNormal(arrivalFrame, timingStdDev * 40);
  const timing = clamp(0.5 + (swingFrame - arrivalFrame) / 40, 0.15, 0.85);
  
  // Contact execution scales dynamically with batter Timing stat
  const timingStat = batter.stats.batting.timing;
  const contactStdDev = Math.max(0.02, 0.18 - (timingStat / 100) * 0.15);
  const contactZone = clamp(randomNormal(0.5, contactStdDev), 0.15, 0.85);

  return {
    type: shotType,
    direction,
    timing,
    contactZone
  };
}
