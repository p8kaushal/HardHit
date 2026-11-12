import * as BABYLON from 'babylonjs';
import type { BatterJoint, BatterPose } from './batter-rig';

export type PoseLandmark = { x: number; y: number; z?: number; visibility?: number };
type Segment = { joint: keyof BatterPose; from: number; to: number; parent?: number };
const segments: Segment[] = [
  { joint: 'leftShoulder', from: 11, to: 13 }, { joint: 'leftElbow', from: 13, to: 15, parent: 11 },
  { joint: 'rightShoulder', from: 12, to: 14 }, { joint: 'rightElbow', from: 14, to: 16, parent: 12 },
  { joint: 'leftHip', from: 23, to: 25 }, { joint: 'leftKnee', from: 25, to: 27, parent: 23 },
  { joint: 'rightHip', from: 24, to: 26 }, { joint: 'rightKnee', from: 26, to: 28, parent: 24 }
];
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const limit = (value: number) => Math.max(-1.2, Math.min(1.2, value));
type Angles = { x: number; y: number; z: number };
export type TrackedDirections = Partial<Record<keyof BatterPose, BABYLON.Vector3>>;
export type TrackingJoint = BatterJoint | 'leftIndex' | 'rightIndex' | 'leftToe' | 'rightToe';
export type TrackedConfidence = Partial<Record<TrackingJoint, boolean>>;
const distalSegments: Segment[] = [
  { joint: 'leftWrist', from: 15, to: 19 }, { joint: 'rightWrist', from: 16, to: 20 },
  { joint: 'leftAnkle', from: 27, to: 31 }, { joint: 'rightAnkle', from: 28, to: 32 }
];

/** Approximate joint rotations relative to a calibrated stance, from camera pose estimates. */
export class PoseRetarget {
  private baseline: (Angles | null)[] | null = null;
  private origin: { x: number; y: number; scale: number } | null = null;
  private offset = { x: 0, y: 0, z: 0 };
  private smoothed = Array.from({ length: segments.length + 2 }, () => ({ x: 0, y: 0, z: 0 }));
  private lastVisible = Array<number>(segments.length + 2).fill(0);
  private facing: number | null = null;
  private directions: TrackedDirections = {};
  private distalLastSeen: Partial<Record<BatterJoint, number>> = {};
  private confidence: TrackedConfidence = {};
  private frontAxisSign: number | null = null;
  private headAxisSign: number | null = null;
  private headYaw = 0;
  private headLastSeen = -Infinity;
  private lastPose: BatterPose | null = null;
  private torsoLastSeen = -Infinity;
  private holdingPose = false;
  private lastUpdateAt = 0;
  reset(): void { this.baseline = null; this.origin = null; this.facing = null; this.directions = {}; this.distalLastSeen = {}; this.confidence = {}; this.frontAxisSign = null; this.headAxisSign = null; this.headYaw = 0; this.headLastSeen = -Infinity; this.lastPose = null; this.torsoLastSeen = -Infinity; this.holdingPose = false; this.lastUpdateAt = 0; this.offset = { x: 0, y: 0, z: 0 }; this.lastVisible.fill(0); this.smoothed.forEach(v => { v.x = v.y = v.z = 0; }); }
  getOffset(): { x: number; y: number; z: number } { return { ...this.offset }; }
  getFacing(): number | null { return this.facing; }
  getDirections(): TrackedDirections { return this.directions; }
  getConfidence(): TrackedConfidence { return this.confidence; }
  isHoldingPose(): boolean { return this.holdingPose; }
  private estimateFacing(points: PoseLandmark[], world: PoseLandmark[], mirror: boolean): number | null {
    const left = points[11], right = points[12], a = world[11], b = world[12];
    if (!left || !right || !a || !b || (left.visibility ?? 0) < .55 || (right.visibility ?? 0) < .55 || ![left.x, left.y, right.x, right.y, a.x, a.z, b.x, b.z].every(Number.isFinite) || [left, right].some(p => p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1)) return null;
    const dx = b.x - a.x, dz = b.z! - a.z!;
    if (Math.hypot(dx, dz) < .08) return null;
    if (this.frontAxisSign === null) return null;
    return Math.atan2(dz * (mirror ? -1 : 1), dx * this.frontAxisSign);
  }
  private estimateHeadFacing(points: PoseLandmark[], world: PoseLandmark[], mirror: boolean): number | null {
    const left = points[7], right = points[8], a = world[7], b = world[8];
    if (!left || !right || !a || !b || (left.visibility ?? 0) < .55 || (right.visibility ?? 0) < .55 || ![left.x, left.y, right.x, right.y, a.x, a.z, b.x, b.z].every(Number.isFinite) || [left, right].some(p => p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1)) return null;
    const dx = b.x - a.x, dz = b.z! - a.z!;
    if (Math.hypot(dx, dz) < .04) return null;
    if (this.headAxisSign === null && this.facing !== null && Math.abs(this.facing) < .35 && Math.abs(dx) >= .04 && Math.abs(dz) <= Math.abs(dx) * .4) this.headAxisSign = Math.sign(dx);
    if (this.headAxisSign === null) return null;
    return Math.atan2(dz * (mirror ? -1 : 1), dx * this.headAxisSign);
  }
  private center(points: PoseLandmark[]): { x: number; y: number; scale: number } | null {
    const [ls, rs, lh, rh] = [11, 12, 23, 24].map(index => points[index]);
    if (![ls, rs, lh, rh].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .45)) return null;
    const x = (lh.x + rh.x) / 2, y = (lh.y + rh.y) / 2;
    const scale = Math.hypot(x - (ls.x + rs.x) / 2, y - (ls.y + rs.y) / 2);
    return scale >= .04 ? { x, y, scale } : null;
  }
  private angles(points: PoseLandmark[], mirror: boolean, world: PoseLandmark[]): (Angles | null)[] {
    const mapped = (index: number) => mirror && index >= 11 && index <= 32 ? (index % 2 ? index + 1 : index - 1) : index;
    const group = (indices: number[]): PoseLandmark[] | null => {
      const mappedIndices = indices.map(mapped);
      if (!mappedIndices.every(i => { const p = points[i]; return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .45 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1; })) return null;
      const valid = (p: PoseLandmark | undefined) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0);
      const source = mappedIndices.every(i => valid(world[i])) ? world : points;
      if (!mappedIndices.every(i => valid(source[i]))) return null;
      return mappedIndices.map(i => ({ x: source[i].x * (mirror ? -1 : 1), y: source[i].y, z: source[i].z ?? 0 }));
    };
    const direction = (a: PoseLandmark, b: PoseLandmark): Angles => ({ x: Math.atan2((b.z ?? 0) - (a.z ?? 0), b.y - a.y), y: 0, z: Math.atan2(b.x - a.x, b.y - a.y) });
    const values = segments.map(segment => {
      const groupPoints = group(segment.parent === undefined ? [segment.from, segment.to] : [segment.from, segment.to, segment.parent]);
      if (!groupPoints) return null;
      const [a, b, parent] = groupPoints;
      if (Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)) < 0.02) return null;
      const value = direction(a, b);
      if (parent) { const p = direction(parent, a); value.x = wrap(value.x - p.x); value.z = wrap(value.z - p.z); }
      return value;
    });
    const torso = group([11, 12, 23, 24]);
    const mid = (a: PoseLandmark, b: PoseLandmark): PoseLandmark => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2, z: ((a.z ?? 0)+(b.z ?? 0))/2 });
    if (torso) {
      const [ls, rs, lh, rh] = torso;
      const shoulder = mid(ls, rs), hip = mid(lh, rh);
      const lean = direction(shoulder, hip);
      values.push({ x: lean.x, y: Math.atan2((rs.z ?? 0) - (ls.z ?? 0), rs.x - ls.x), z: lean.z });
      const head = group([0, 11, 12]);
      values.push(head ? direction(head[0], mid(head[1], head[2])) : null);
    } else values.push(null, null);
    return values;
  }
  calibrate(points: PoseLandmark[], mirror: boolean, world: PoseLandmark[] = [], now = performance.now()): boolean {
    const angles = this.angles(points, mirror, world);
    const center = this.center(points);
    if (!angles[segments.length] || !center) return false;
    this.baseline = angles;
    this.origin = center;
    const shoulderWidth = (world[12]?.x ?? NaN) - (world[11]?.x ?? NaN);
    this.frontAxisSign = Number.isFinite(shoulderWidth) && Math.abs(shoulderWidth) >= .08 ? Math.sign(shoulderWidth) : null;
    this.facing = this.estimateFacing(points, world, mirror);
    this.headAxisSign = null;
    this.headYaw = 0;
    this.headLastSeen = -Infinity;
    this.lastPose = null;
    this.torsoLastSeen = now;
    this.holdingPose = false;
    this.lastUpdateAt = now - 1000 / 15;
    if (this.estimateHeadFacing(points, world, mirror) !== null) this.headLastSeen = now;
    this.directions = {};
    this.distalLastSeen = {};
    this.confidence = {};
    this.offset = { x: 0, y: 0, z: 0 };
    this.lastVisible = angles.map(value => value ? now : -Infinity);
    this.smoothed.forEach(v => { v.x = v.y = v.z = 0; });
    return true;
  }
  update(points: PoseLandmark[], mirror: boolean, world: PoseLandmark[] = [], now = performance.now()): BatterPose | null {
    if (!this.baseline) return null;
    // The worker is capped at 15 fps. Compensate for slower frames without a large jump after a long stall.
    const steps = Math.max(1, Math.min(3, (now - this.lastUpdateAt) / (1000 / 15)));
    this.lastUpdateAt = now;
    const blend = (perFrame: number) => 1 - Math.pow(1 - perFrame, steps);
    const angles = this.angles(points, mirror, world);
    const center = this.center(points);
    if (!angles[segments.length] || !center || !this.origin) {
      this.confidence = {};
      this.holdingPose = !!this.lastPose && now - this.torsoLastSeen <= 500 && now >= this.torsoLastSeen;
      return this.holdingPose ? this.lastPose : null;
    }
    this.torsoLastSeen = now;
    this.holdingPose = false;
    if (this.frontAxisSign === null) {
      const a = world[11], b = world[12];
      const dx = b?.x - a?.x, dz = (b?.z ?? NaN) - (a?.z ?? NaN);
      if (Number.isFinite(dx) && Number.isFinite(dz) && Math.abs(dx) >= .15 && Math.abs(dz) <= Math.abs(dx) * .4) this.frontAxisSign = Math.sign(dx);
    }
    const facing = this.estimateFacing(points, world, mirror);
    if (facing === null) this.facing = null;
    else this.facing = this.facing === null ? facing : this.facing + wrap(facing - this.facing) * blend(.3);
    const headFacing = this.estimateHeadFacing(points, world, mirror);
    if (headFacing !== null && facing !== null) {
      const relativeYaw = Math.max(-1, Math.min(1, wrap(headFacing - facing)));
      this.headYaw += wrap(relativeYaw - this.headYaw) * blend(.35);
      this.headLastSeen = now;
    } else if (now - this.headLastSeen > 300) this.headYaw *= 1 - blend(.3);
    const targetX = Math.max(-.65, Math.min(.65, (center.x - this.origin.x) / this.origin.scale * .45 * (mirror ? -1 : 1)));
    const targetY = Math.max(-.45, Math.min(.35, (this.origin.y - center.y) / this.origin.scale * .45));
    // Apparent torso size is only a rough proxy for distance; keep it optional and bounded.
    const targetZ = Math.max(-.5, Math.min(.5, .8 * (this.origin.scale / center.scale - 1)));
    this.offset.x += (targetX - this.offset.x) * blend(.35);
    this.offset.y += (targetY - this.offset.y) * blend(.35);
    this.offset.z += (targetZ - this.offset.z) * blend(.2);
    const mappedIndex = (value: number) => mirror && ((value >= 11 && value <= 32) || value === 7 || value === 8) ? (value % 2 ? value + 1 : value - 1) : value;
    const isVisible = (value: number) => {
      const p = points[mappedIndex(value)];
      return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .45 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
    };
    const confidenceMap: Record<TrackingJoint, number[]> = {
      pelvis: [23,24], spine: [11,12,23,24], chest: [11,12,23,24], neck: [11,12], head: [0,7,8],
      leftShoulder: [11], leftElbow: [13], leftWrist: [15], rightShoulder: [12], rightElbow: [14], rightWrist: [16],
      leftHip: [23], leftKnee: [25], leftAnkle: [27], rightHip: [24], rightKnee: [26], rightAnkle: [28],
      leftIndex: [19], rightIndex: [20], leftToe: [31], rightToe: [32]
    };
    this.confidence = Object.fromEntries(Object.entries(confidenceMap).map(([joint, indices]) => [joint, indices.every(isVisible)])) as TrackedConfidence;
    const finitePoint = (p: PoseLandmark | undefined) => !!p && [p.x, p.y, p.z ?? 0].every(Number.isFinite);
    const directionSource = (a: number, b: number) => finitePoint(world[a]) && finitePoint(world[b]) ? world : points;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const index = (value: number) => mirror ? (value % 2 ? value + 1 : value - 1) : value;
      const a = index(segment.from), b = index(segment.to);
      const visible = [points[a], points[b]].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .45 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
      const source = directionSource(a, b);
      const from = source[a], to = source[b];
      let target: BABYLON.Vector3 | null = null;
      if (visible && from && to && [from.x, from.y, to.x, to.y, from.z ?? 0, to.z ?? 0].every(Number.isFinite)) {
        target = new BABYLON.Vector3((to.x - from.x) * (mirror ? -1 : 1), from.y - to.y, (from.z ?? 0) - (to.z ?? 0));
        if (target.length() < .02) target = null;
        else target.normalize();
      }
      if (!target && now - this.lastVisible[i] <= 300 && this.directions[segment.joint]) continue;
      target ??= new BABYLON.Vector3(0, -1, 0);
      const previous = this.directions[segment.joint];
      const blended = previous ? BABYLON.Vector3.Lerp(previous, target, blend(.55)) : target;
      this.directions[segment.joint] = blended.lengthSquared() > .0001 ? blended.normalize() : target;
    }
    for (const segment of distalSegments) {
      const a = mappedIndex(segment.from), b = mappedIndex(segment.to);
      const source = directionSource(a, b);
      const from = source[a], to = source[b];
      let target: BABYLON.Vector3 | null = null;
      if (isVisible(segment.from) && isVisible(segment.to) && from && to && [from.x, from.y, to.x, to.y, from.z ?? 0, to.z ?? 0].every(Number.isFinite)) {
        target = new BABYLON.Vector3((to.x - from.x) * (mirror ? -1 : 1), from.y - to.y, (from.z ?? 0) - (to.z ?? 0));
        if (target.length() < .015) target = null;
        else target.normalize();
      }
      const joint = segment.joint as BatterJoint;
      if (!target) {
        if (now - (this.distalLastSeen[joint] ?? -Infinity) > 300) delete this.directions[joint];
        continue;
      }
      this.distalLastSeen[joint] = now;
      const previous = this.directions[joint];
      const blended = previous ? BABYLON.Vector3.Lerp(previous, target, blend(.45)) : target;
      this.directions[joint] = blended.lengthSquared() > .0001 ? blended.normalize() : target;
    }
    const pose: BatterPose = {};
    angles.forEach((value, i) => {
      const joint = i < segments.length ? segments[i].joint : i === segments.length ? 'chest' : 'head';
      if (!value) {
        const smooth = this.smoothed[i];
        if (now - this.lastVisible[i] > 300) { const decay = 1 - blend(.3); smooth.x *= decay; smooth.y *= decay; smooth.z *= decay; }
        pose[joint] = new BABYLON.Vector3(smooth.x, smooth.y, smooth.z + (joint === 'leftShoulder' ? -0.12 : joint === 'rightShoulder' ? 0.12 : 0));
        return;
      }
      this.lastVisible[i] = now;
      if (!this.baseline![i]) this.baseline![i] = value;
      const base = this.baseline![i]!;
      const smooth = this.smoothed[i];
      for (const axis of ['x', 'y', 'z'] as const) {
        const difference = limit(wrap(value[axis] - base[axis])) - smooth[axis];
        smooth[axis] += difference * blend(Math.abs(difference) > .2 ? .55 : .35);
      }
      if (joint === 'chest') {
        pose.spine = new BABYLON.Vector3(smooth.x * .5, 0, smooth.z * .5);
        pose.chest = new BABYLON.Vector3(smooth.x * .5, this.facing !== null ? 0 : smooth.y, smooth.z * .5);
      } else pose[joint] = new BABYLON.Vector3(smooth.x, joint === 'head' ? this.headYaw : smooth.y, smooth.z + (joint === 'leftShoulder' ? -0.12 : joint === 'rightShoulder' ? 0.12 : 0));
    });
    this.lastPose = pose;
    return pose;
  }
}
