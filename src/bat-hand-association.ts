/** Image coordinates are normalized to the same unmirrored (or consistently mirrored) frame. */
export type ObservedPoint = { x: number; y: number; confidence: number };
export type BatHandAssociation =
  | { accepted: false; reason: 'invalid-configuration' | 'bat-unavailable' | 'hands-unavailable' | 'degenerate-handle' | 'hands-too-far' }
  | { accepted: true; distancesInTorsoLengths: [number, number] };

/**
 * Checks two observed wrists against an independently detected handle segment.
 * `torsoScale` is the image-plane shoulder/hip midpoint distance in image-height units.
 * Thresholds are supplied by the caller and require independent camera calibration.
 * This does not estimate bat endpoints, contact, depth, or player identity.
 */
export function associateBatHands(
  handleTop: ObservedPoint | null, splice: ObservedPoint | null,
  leftWrist: ObservedPoint | null, rightWrist: ObservedPoint | null,
  aspect: number, torsoScale: number, minConfidence: number,
  maxDistanceInTorsoLengths: number, minHandleLength: number
): BatHandAssociation {
  if (![aspect, torsoScale, minConfidence, maxDistanceInTorsoLengths, minHandleLength].every(Number.isFinite)
    || aspect <= 0 || torsoScale <= 0 || minConfidence < 0 || minConfidence > 1
    || maxDistanceInTorsoLengths <= 0 || minHandleLength <= 0) return { accepted: false, reason: 'invalid-configuration' };
  const usable = (p: ObservedPoint | null): p is ObservedPoint => !!p
    && [p.x, p.y, p.confidence].every(Number.isFinite) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
    && p.confidence >= minConfidence && p.confidence <= 1;
  if (!usable(handleTop) || !usable(splice)) return { accepted: false, reason: 'bat-unavailable' };
  if (!usable(leftWrist) || !usable(rightWrist)) return { accepted: false, reason: 'hands-unavailable' };
  const ax = handleTop.x * aspect, ay = handleTop.y;
  const dx = splice.x * aspect - ax, dy = splice.y - ay, lengthSquared = dx * dx + dy * dy;
  if (Math.sqrt(lengthSquared) < minHandleLength) return { accepted: false, reason: 'degenerate-handle' };
  const distance = (wrist: ObservedPoint): number => {
    const wx = wrist.x * aspect - ax, wy = wrist.y - ay;
    const projection = Math.max(0, Math.min(1, (wx * dx + wy * dy) / lengthSquared));
    return Math.hypot(wx - projection * dx, wy - projection * dy) / torsoScale;
  };
  const distances: [number, number] = [distance(leftWrist), distance(rightWrist)];
  if (distances.some(value => value > maxDistanceInTorsoLengths)) return { accepted: false, reason: 'hands-too-far' };
  return { accepted: true, distancesInTorsoLengths: distances };
}
