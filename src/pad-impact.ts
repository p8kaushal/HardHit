/** Lab-derived response of pad P2; distances are metres, impact speeds m/s. */
export const PAD_P2_REBOUND_DATA = [
  { impactSpeed: 15.34, reboundDistance: 7.44 },
  { impactSpeed: 22.97, reboundDistance: 8.11 },
  { impactSpeed: 30.68, reboundDistance: 10.07 },
  { impactSpeed: 34.45, reboundDistance: 10.89 },
] as const;
type PadReboundSample = (typeof PAD_P2_REBOUND_DATA)[number];

export interface Velocity3 { x: number; y: number; z: number }

/**
 * Estimate post-pad velocity by mapping measured same-height, 45-degree
 * rebound range to a normal restitution, then reflecting the incoming normal.
 * This assumes a vertical pad, equal incoming tangential/normal components in
 * the reference setup, and a same-height ballistic landing. It is not a
 * universal pad coefficient or validated law for arbitrary pad/body contact.
 */
export function deflectFromReferencePad(incoming: Velocity3): Velocity3 {
  const speed = Math.hypot(incoming.x, incoming.y, incoming.z);
  if (!(speed > 0) || !Number.isFinite(speed)) return { x: 0, y: 0, z: 0 };
  const [first, ...rest] = PAD_P2_REBOUND_DATA;
  let low: PadReboundSample = first, high: PadReboundSample = rest[rest.length - 1];
  for (let index = 0; index < rest.length; index++) {
    if (speed <= rest[index].impactSpeed) { low = index === 0 ? first : rest[index - 1]; high = rest[index]; break; }
    low = rest[index]; high = rest[index];
  }
  const restitution = (entry: PadReboundSample) => entry.reboundDistance * 9.81 / (entry.impactSpeed * entry.impactSpeed);
  const fraction = high.impactSpeed === low.impactSpeed ? 0 : Math.max(0, Math.min(1, (speed - low.impactSpeed) / (high.impactSpeed - low.impactSpeed)));
  const e = restitution(low) + (restitution(high) - restitution(low)) * fraction;
  return { x: incoming.x, y: incoming.y, z: -e * incoming.z };
}
