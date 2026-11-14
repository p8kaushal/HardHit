import type { FieldPreset } from './types';
import { BATTER_CREASE_Z } from './formula';

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

export type FielderPositionName = 'keeper' | 'close' | 'point' | 'thirdMan' | 'cover' | 'midOff' | 'midOn' | 'squareLeg' | 'fineLeg' | 'longBoundary';

export interface FieldingPosition {
  name: FielderPositionName;
  position: { x: number; z: number };
}

export const FIELDING_MAX_RUNS = 3;
// Mean-equivalent speed from a 17.68 m cricket sprint with a bat in 2.83 s;
// the endpoints below use the scene's 17.6 m popping-crease separation.
export const FIELDING_RUNNER_SPEED_METERS_PER_SECOND = 6.25;
export const FIELDING_RUNNER_PICKUP_DELAY_SECONDS = 0.7;
export const RUNNER_CREASE_TO_CREASE_METERS = Math.abs(BATTER_CREASE_Z) * 2;

/** A caught ball dismisses only when the delivery's modeled protections allow it. */
export function isCatchDismissalAllowed(isNoBall: boolean, isFreeHit: boolean): boolean {
  return !isNoBall && !isFreeHit;
}

const DEFAULT_FIELD_LAYOUT: ReadonlyArray<FieldingPosition> = [
  { name: 'keeper', position: { x: 0, z: -11.5 } },
  { name: 'close', position: { x: -4, z: -14 } },
  { name: 'point', position: { x: 25, z: -6 } },
  { name: 'thirdMan', position: { x: -38, z: -16 } },
  { name: 'cover', position: { x: 30, z: 14 } },
  { name: 'midOff', position: { x: -17, z: 25 } },
  { name: 'midOn', position: { x: 17, z: 25 } },
  { name: 'squareLeg', position: { x: -23, z: -17 } },
  { name: 'fineLeg', position: { x: 20, z: -35 } },
  { name: 'longBoundary', position: { x: -12, z: 47 } },
];

const FIELD_PRESET_POSITIONS: Record<FieldPreset, Partial<Record<FielderPositionName, { x: number; z: number }>>> = {
  balanced: {},
  attacking: {
    close: { x: -3, z: -12 }, point: { x: 19, z: -7 }, thirdMan: { x: -24, z: -12 }, cover: { x: 23, z: 12 },
    midOff: { x: -14, z: 22 }, midOn: { x: 14, z: 22 }, squareLeg: { x: -18, z: -14 },
    fineLeg: { x: 17, z: -28 }, longBoundary: { x: -10, z: 38 },
  },
  deep: {
    close: { x: -5, z: -17 }, point: { x: 33, z: -10 }, thirdMan: { x: -46, z: -23 }, cover: { x: 37, z: 18 },
    midOff: { x: -23, z: 31 }, midOn: { x: 23, z: 31 }, squareLeg: { x: -30, z: -23 },
    fineLeg: { x: 25, z: -42 }, longBoundary: { x: -12, z: 55 },
  },
};

/** Provisional starting positions mirrored around the pitch for batter handedness. */
export function createDefaultFieldLayout(hand: 'RHB' | 'LHB' = 'RHB', preset: FieldPreset = 'balanced'): FieldingPosition[] {
  if (!(preset in FIELD_PRESET_POSITIONS)) throw new Error('Unknown field preset');
  const mirror = hand === 'RHB' ? 1 : -1;
  return DEFAULT_FIELD_LAYOUT.map(fielder => ({
    name: fielder.name,
    position: {
      x: (FIELD_PRESET_POSITIONS[preset][fielder.name]?.x ?? fielder.position.x) * mirror,
      z: FIELD_PRESET_POSITIONS[preset][fielder.name]?.z ?? fielder.position.z,
    },
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

export interface AutomatedRunDecision {
  runs: number;
  runOut: boolean;
  threatenedEnd: 'striker' | 'nonStriker';
  strikerPositionZ: number;
  nonStrikerPositionZ: number;
  throwArrivalSeconds: number;
  runnerArrivalSeconds: number;
}

function runnerDistanceFromStartingCrease(distanceMeters: number): number {
  const lap = RUNNER_CREASE_TO_CREASE_METERS * 2;
  const progress = distanceMeters % lap;
  return progress <= RUNNER_CREASE_TO_CREASE_METERS ? progress : lap - progress;
}

/** Resolve two automated runners against a fielder's return throw after a ground stop.
 * The runners travel during flight and while the fielder gathers and throws. If either
 * runner nearest the targeted wicket cannot regain its crease before the throw arrives,
 * the batting side is run out. Speeds and gather delay are provisional game parameters.
 */
export function decideAutomatedRuns(
  flightSeconds: number,
  fielderPosition: { x: number; z: number },
  throwSpeedMetersPerSecond: number,
  runnerSpeedMetersPerSecond = FIELDING_RUNNER_SPEED_METERS_PER_SECOND,
  pickupDelaySeconds = FIELDING_RUNNER_PICKUP_DELAY_SECONDS,
  maximumRuns = FIELDING_MAX_RUNS,
): AutomatedRunDecision {
  if (![flightSeconds, fielderPosition.x, fielderPosition.z, throwSpeedMetersPerSecond, runnerSpeedMetersPerSecond, pickupDelaySeconds, maximumRuns].every(Number.isFinite) ||
      flightSeconds < 0 || throwSpeedMetersPerSecond <= 0 || runnerSpeedMetersPerSecond <= 0 || pickupDelaySeconds < 0 ||
      !Number.isInteger(maximumRuns) || maximumRuns < 0) {
    throw new Error('Invalid automated run decision input');
  }

  const strikerStump = { x: 0, z: -10 };
  const nonStrikerStump = { x: 0, z: 10 };
  const distanceToStriker = Math.hypot(fielderPosition.x - strikerStump.x, fielderPosition.z - strikerStump.z);
  const distanceToNonStriker = Math.hypot(fielderPosition.x - nonStrikerStump.x, fielderPosition.z - nonStrikerStump.z);
  const threatenedEnd = distanceToStriker <= distanceToNonStriker ? 'striker' : 'nonStriker';
  const throwDistance = Math.min(distanceToStriker, distanceToNonStriker);
  const throwArrivalSeconds = pickupDelaySeconds + throwDistance / throwSpeedMetersPerSecond;

  const progress = runnerDistanceFromStartingCrease(runnerSpeedMetersPerSecond * flightSeconds);
  const strikerPositionZ = BATTER_CREASE_Z + progress;
  const nonStrikerPositionZ = -BATTER_CREASE_Z - progress;
  const targetCreaseZ = threatenedEnd === 'striker' ? BATTER_CREASE_Z : -BATTER_CREASE_Z;
  const nearestRunnerDistance = Math.min(Math.abs(strikerPositionZ - targetCreaseZ), Math.abs(nonStrikerPositionZ - targetCreaseZ));
  const runnerArrivalSeconds = nearestRunnerDistance / runnerSpeedMetersPerSecond;
  const runOut = flightSeconds > 0 && runnerArrivalSeconds > throwArrivalSeconds + 1e-10;
  const runs = Math.min(maximumRuns, Math.floor((flightSeconds + throwArrivalSeconds) * runnerSpeedMetersPerSecond / RUNNER_CREASE_TO_CREASE_METERS));

  return { runs, runOut, threatenedEnd, strikerPositionZ, nonStrikerPositionZ, throwArrivalSeconds, runnerArrivalSeconds };
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
