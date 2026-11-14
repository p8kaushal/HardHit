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

export const FIELDING_SECONDS_PER_RUN = 2.8;
export const FIELDING_MAX_RUNS = 3;

/** A caught ball dismisses only when the delivery's modeled protections allow it. */
export function isCatchDismissalAllowed(isNoBall: boolean, isFreeHit: boolean): boolean {
  return !isNoBall && !isFreeHit;
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

export interface FieldingTrajectoryState extends FieldingTrajectorySample {
  hasBounced: boolean;
  reachedBoundary: boolean;
}

export interface RatedFielder {
  name: FielderPositionName;
  profile: FielderReachProfile;
  catching: number;
}

export interface FieldingEvent extends FieldingInterception {
  fielderName: FielderPositionName;
  kind: 'catch' | 'ground_stop';
  fielderPosition: { x: number; z: number };
}

/** Move a fielder toward a ground target by at most speed × elapsed time. */
export function moveFielderTowardBall(
  current: { x: number; z: number },
  target: { x: number; z: number },
  speedMetersPerSecond: number,
  elapsedSeconds: number,
): { x: number; z: number } {
  if (![current.x, current.z, target.x, target.z, speedMetersPerSecond, elapsedSeconds].every(Number.isFinite) || speedMetersPerSecond < 0 || elapsedSeconds < 0) {
    throw new Error('Invalid fielder movement input');
  }
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  const movement = Math.min(distance, speedMetersPerSecond * elapsedSeconds);
  if (distance === 0 || movement === 0) return { ...current };
  return { x: current.x + dx / distance * movement, z: current.z + dz / distance * movement };
}

export function hasFielderReacted(profile: FielderReachProfile, elapsedSeconds: number): boolean {
  if (!Number.isFinite(profile.reactionSeconds) || profile.reactionSeconds < 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('Invalid fielder reaction time');
  }
  return elapsedSeconds + 1e-10 >= profile.reactionSeconds;
}

/** Map the provisional 0–100 throwing skill to return-throw speed in m/s. */
export function fielderThrowSpeedFromRating(throwing: number): number {
  if (!Number.isFinite(throwing) || throwing < 0 || throwing > 100) throw new Error('Throwing rating must be between 0 and 100');
  return 12 + throwing * 0.12;
}

/** Estimate completed end-to-end runs before a fielder's return throw arrives. */
export function estimateRunsBeforeReturnThrow(
  flightSeconds: number,
  returnThrowDistanceMeters: number,
  throwSpeedMetersPerSecond: number,
  secondsPerRun: number,
  maximumRuns = 3,
): number {
  if (![flightSeconds, returnThrowDistanceMeters, throwSpeedMetersPerSecond, secondsPerRun, maximumRuns].every(Number.isFinite) ||
      flightSeconds < 0 || returnThrowDistanceMeters < 0 || throwSpeedMetersPerSecond <= 0 || secondsPerRun <= 0 ||
      !Number.isInteger(maximumRuns) || maximumRuns < 0) {
    throw new Error('Invalid run decision input');
  }
  const throwSeconds = returnThrowDistanceMeters / throwSpeedMetersPerSecond;
  return Math.min(maximumRuns, Math.floor((flightSeconds + throwSeconds) / secondsPerRun));
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

/** Find the first reachable legal catch or low bounced-ball stop before the rope. */
export function findEarliestFieldingEvent(
  trajectory: readonly FieldingTrajectoryState[],
  fielders: readonly RatedFielder[],
): FieldingEvent | null {
  let earliest: FieldingEvent | null = null;
  for (const fielder of fielders) {
    if (!Number.isFinite(fielder.catching) || fielder.catching < 0 || fielder.catching > 100) {
      throw new Error('Catching rating must be between 0 and 100');
    }
    const catchHeight = 1.65 + fielder.catching * 0.015;
    const catchSamples = trajectory
      .filter(sample => !sample.reachedBoundary && !sample.hasBounced && sample.position.y > 1.2 && sample.position.y <= catchHeight)
      .map(({ timeSeconds, position }) => ({ timeSeconds, position }));
    const groundSamples = trajectory
      .filter(sample => !sample.reachedBoundary && sample.hasBounced && sample.position.y <= 1.2)
      .map(({ timeSeconds, position }) => ({ timeSeconds, position }));

    for (const [kind, samples] of [['catch', catchSamples], ['ground_stop', groundSamples]] as const) {
      const interception = findEarliestInterception(samples, fielder.profile);
      if (!interception || (earliest && interception.timeSeconds >= earliest.timeSeconds)) continue;
      const movementSeconds = Math.max(0, interception.timeSeconds - fielder.profile.reactionSeconds);
      const fielderPosition = moveFielderTowardBall(
        fielder.profile.position,
        interception.position,
        fielder.profile.speedMetersPerSecond,
        movementSeconds,
      );
      earliest = { ...interception, fielderName: fielder.name, kind, fielderPosition };
    }
  }
  return earliest;
}
