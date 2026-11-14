import { BAT_BLADE_LENGTH_METERS } from './bat-physics';

/**
 * Geometry of the empirical 2019 launch-speed regression, expressed in this
 * prototype's face-coordinate convention. This candidate is diagnostic only;
 * it is not wired into gameplay and does not predict launch direction/angle.
 */
export const BAT_SWEETSPOT_FROM_TOE_METERS = 0.175;

export interface BatImpactSpeedCandidateInput {
  /** Impact distance from the blade shoulder toward the toe, in metres. */
  alongBladeMeters: number;
  /** Signed medio-lateral distance from the blade midline, in metres. */
  acrossBladeMeters: number;
  /** Estimated distal bat endpoint velocity immediately before impact, m/s. */
  batTipVelocity: { x: number; y: number; z: number };
}

/**
 * Apply the published in-sample range-hitting regression to an estimated
 * impact. X and Z in the paper are distances from the sweetspot, so offsets
 * are absolute. Return the raw linear prediction; callers must not treat it
 * as a validated physical bound or as the live shot response.
 */
export function predictEmpiricalBatImpactLaunchSpeed(input: BatImpactSpeedCandidateInput): number {
  const sweetspotFromShoulder = BAT_BLADE_LENGTH_METERS - BAT_SWEETSPOT_FROM_TOE_METERS;
  const impactX = Math.abs(input.acrossBladeMeters);
  const impactZ = Math.abs(input.alongBladeMeters - sweetspotFromShoulder);
  const batSpeed = Math.hypot(input.batTipVelocity.x, input.batTipVelocity.y, input.batTipVelocity.z);

  if (![impactX, impactZ, batSpeed].every(Number.isFinite)) {
    throw new RangeError('Bat impact response inputs must be finite');
  }

  return 12.587 + 0.772 * batSpeed - 109.693 * impactX - 35.584 * impactZ;
}
