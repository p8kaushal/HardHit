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
