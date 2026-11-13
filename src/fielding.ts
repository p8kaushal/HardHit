export interface FieldingTrajectorySample {
  timeSeconds: number;
  position: { x: number; y: number; z: number };
}

export interface FielderReachProfile {
  position: { x: number; z: number };
  reactionSeconds: number;
  speedMetersPerSecond: number;
  reachRadiusMeters: number;
}

export type FielderPositionName = 'keeper' | 'close' | 'point' | 'cover' | 'midOff' | 'midOn' | 'squareLeg' | 'fineLeg' | 'longBoundary';

export interface FieldingPosition {
  name: FielderPositionName;
  position: { x: number; z: number };
}

const DEFAULT_FIELD_LAYOUT: ReadonlyArray<FieldingPosition> = [
  { name: 'keeper', position: { x: 0, z: -11.5 } },
  { name: 'close', position: { x: -4, z: -14 } },
  { name: 'point', position: { x: 25, z: -6 } },
  { name: 'cover', position: { x: 30, z: 14 } },
  { name: 'midOff', position: { x: -17, z: 25 } },
  { name: 'midOn', position: { x: 17, z: 25 } },
  { name: 'squareLeg', position: { x: -23, z: -17 } },
  { name: 'fineLeg', position: { x: 20, z: -35 } },
  { name: 'longBoundary', position: { x: -12, z: 47 } },
];

/** Provisional starting positions mirrored around the pitch for batter handedness. */
export function createDefaultFieldLayout(hand: 'RHB' | 'LHB' = 'RHB'): FieldingPosition[] {
  const mirror = hand === 'RHB' ? 1 : -1;
  return DEFAULT_FIELD_LAYOUT.map(fielder => ({
    name: fielder.name,
    position: { x: fielder.position.x * mirror, z: fielder.position.z },
  }));
}

/** Map 0–100 ratings to explicitly provisional movement limits. */
export function fielderReachProfileFromRatings(
  position: { x: number; z: number },
  agility: number,
  reaction: number,
): FielderReachProfile {
  if (![agility, reaction].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error('Fielding ratings must be between 0 and 100');
  }
  return {
    position: { ...position },
    reactionSeconds: 0.45 - reaction * 0.003,
    speedMetersPerSecond: 2 + agility * 0.04,
    reachRadiusMeters: 0.3 + agility * 0.003,
  };
}

export interface FieldingInterception {
  sampleIndex: number;
  timeSeconds: number;
  position: { x: number; y: number; z: number };
  distanceMeters: number;
  movementMeters: number;
}

/** Return the earliest sampled ball position a fielder can reach after reacting. */
export function findEarliestInterception(
  trajectory: readonly FieldingTrajectorySample[],
  fielder: FielderReachProfile,
): FieldingInterception | null {
  if (
    !Number.isFinite(fielder.position.x) || !Number.isFinite(fielder.position.z) ||
    !Number.isFinite(fielder.reactionSeconds) || fielder.reactionSeconds < 0 ||
    !Number.isFinite(fielder.speedMetersPerSecond) || fielder.speedMetersPerSecond < 0 ||
    !Number.isFinite(fielder.reachRadiusMeters) || fielder.reachRadiusMeters < 0
  ) throw new Error('Invalid fielder reach profile');

  let previousTime = -Infinity;
  for (const [index, sample] of trajectory.entries()) {
    if (
      !Number.isFinite(sample.timeSeconds) || sample.timeSeconds < 0 || sample.timeSeconds < previousTime ||
      !Number.isFinite(sample.position.x) || !Number.isFinite(sample.position.y) || !Number.isFinite(sample.position.z)
    ) throw new Error(`Invalid trajectory sample at index ${index}`);
    previousTime = sample.timeSeconds;
  }

  for (const [index, sample] of trajectory.entries()) {
    const movementSeconds = Math.max(0, sample.timeSeconds - fielder.reactionSeconds);
    const movementMeters = movementSeconds * fielder.speedMetersPerSecond;
    const distanceMeters = Math.hypot(sample.position.x - fielder.position.x, sample.position.z - fielder.position.z);
    if (distanceMeters <= fielder.reachRadiusMeters + movementMeters) {
      return {
        sampleIndex: index,
        timeSeconds: sample.timeSeconds,
        position: { ...sample.position },
        distanceMeters,
        movementMeters,
      };
    }
  }
  return null;
}
