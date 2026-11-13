import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, StandardMaterial, Vector3 } from 'babylonjs';
import { BatterRig } from '../src/batter-rig';
import { PoseRetarget } from '../src/pose-retarget';
import { associateBatHands, type ObservedPoint } from '../src/bat-hand-association';
import { describeHandDirection, HandMotionPreview } from '../src/hand-motion';
import { compareHandMotionTiming } from '../src/hand-motion-timing';
import { HandMotionIntensity } from '../src/hand-motion-intensity';
import { PosePerformance } from '../src/pose-performance';
import { createBotPlayer, getOrCreatePlayer, globalAutoAssistConfig, MatchController } from '../src/game';
import { KeyboardInputManager } from '../src/input';
import { directionFromStick, suggestedShotDirection, TouchBattingControls } from '../src/touch-controls';
import { advanceBallFrame, stepBall, type BallState } from '../src/ball-physics';
import { botChooseDelivery, botChooseShot } from '../src/bot';
import { addLeaderboardEntry, readLeaderboard } from '../src/leaderboard';
import { BALL_AIR_DAMPING, BALL_RADIUS_METERS, BATTER_CREASE_Z, STUMP_HEIGHT_METERS, WICKET_WIDTH_METERS, batterContactProgress, battingContactZone, bowlingExecutionTarget, bowlingReleaseTiming, bowlingTargetFromScreen, calculateBounceTarget, calculateShotDistance, calculateShotTrajectory, checkExtraBall, deliveryAnimationStep, deliveryArrivalHeight, deliveryBaseCreaseX, deliveryCreaseX, deliveryDurationMs, deliveryPitchPoint, deliveryReleaseX, deliverySwingAtBounce, deliveryVelocityAtCrease, evaluateFinalOutcome, evaluateWicket, footworkFactor, frameIndependentDamping, getDeliveryFlightPosition, getLineTypeFromAimX, getParabolicFlightPosition, resolveMissedDelivery, sampleFrontFootLanding } from '../src/formula';
import { isSpinDelivery, updateBowlingAdjustmentVisibility } from '../src/bowling-controls';
import { clearGameTimeout, gameClockRevision, gameNow, isGamePaused, setGamePaused, setGameTimeout, shouldPauseGameplay } from '../src/game-clock';
import { SoundManager } from '../src/sound';
import { UIManager, opponentBadgeText } from '../src/ui';
import { GameScene } from '../src/scene';
import { battingTimingFeedback } from '../src/batting-timing';
import { calculateDistance, swingStrengthFactor } from '../src/formula';
import { resolveBattingDelivery, resolveShotFlight } from '../src/batting-resolution';
import { BATTER_STUMPS_Z, battingAssistanceMultiplier, deliveryBounceProgress, deliveryContactPoint, deliveryHitsPad, deliveryProgressAtZ, sampleDeliveryPath, shotFlightQuality } from '../src/formula';
import { moveBatter } from '../src/batter-position';
import { followShotPose, shotCameraDirection, shotResultPose } from '../src/camera-director';
import type { BallOutcome, DeliveryChoice, ShotType } from '../src/types';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value)
} });

const delivery = (timing: number, x = 0): DeliveryChoice => ({
  aimTarget: { x, z: -3.5 }, line: 'middle', length: 'good', type: 'fast', releaseTiming: timing
});

test('pose performance measures accepted round trips and expires stalled samples', () => {
  const stats = new PosePerformance();
  stats.reset(100);
  assert.equal(stats.snapshot(100).acceptedFps, null, 'wait for a second before reporting rate');
  stats.record(200, 250, 'accepted');
  stats.record(400, 550, 'accepted');
  stats.record(600, 1200, 'delayed');
  stats.record(1300, 1350, 'interrupted');
  assert.deepEqual(stats.snapshot(2100), { acceptedFps: 1, roundTripMs: 100, delayed: 1, interrupted: 1 });
  assert.deepEqual(stats.snapshot(5550), { acceptedFps: 0, roundTripMs: null, delayed: 1, interrupted: 1 }, 'stalls must not leave a healthy rate or round trip on screen');
  stats.record(5600, 5700, 'accepted');
  assert.deepEqual(stats.snapshot(5750), { acceptedFps: .2, roundTripMs: 100, delayed: 1, interrupted: 1 });
});

test('pose performance resets sessions and ignores invalid or out-of-order samples', () => {
  const stats = new PosePerformance();
  stats.record(0, 50, 'delayed');
  stats.reset(1000);
  for (const [start, end] of [[NaN, 1200], [1100, Infinity], [1100, 1099], [900, 1200]]) stats.record(start, end, 'delayed');
  stats.record(1100, 1200, 'accepted');
  stats.record(1050, 1150, 'interrupted');
  assert.deepEqual(stats.snapshot(2000), { acceptedFps: 1, roundTripMs: 100, delayed: 0, interrupted: 0 });
  stats.reset();
  assert.deepEqual(stats.snapshot(7000), { acceptedFps: null, roundTripMs: null, delayed: 0, interrupted: 0 });
  stats.reset(8000);
  assert.equal(stats.snapshot(7900).acceptedFps, null);
  assert.equal(stats.snapshot(NaN).roundTripMs, null);
  assert.deepEqual(stats.snapshot(9000), { acceptedFps: 0, roundTripMs: null, delayed: 0, interrupted: 0 });
});

test('hand-motion preview arms on stillness and rejects noise, tracking gaps and body translation', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  for (const [index, x, y] of [[11,.35,.25],[12,.65,.25],[15,.47,.55],[16,.53,.55],[23,.4,.55],[24,.6,.55]] as const) points[index] = { x, y, visibility: 1 };
  const tracker = new HandMotionPreview();
  for (const time of [0,100,200,300]) tracker.update(points, time, 1);
  assert.equal(tracker.update(points, 350, 1).state, 'ready');
  const translated = structuredClone(points);
  for (const index of [11,12,15,16,23,24]) translated[index].x += .1;
  assert.equal(tracker.update(translated, 450, 1).state, 'ready', 'whole-body translation is not hand motion');
  const shifted = structuredClone(translated);
  shifted[15].x += .09; shifted[16].x += .09;
  assert.equal(tracker.update(shifted, 550, 1).state, 'moving');
  shifted[15].x += .12; shifted[16].x += .12;
  tracker.update(shifted, 650, 1);
  const result = tracker.update(shifted, 750, 1);
  assert.equal(result.state, 'cooldown');
  assert.ok(result.event && result.event.peakSpeed > 2.2 && result.event.durationMs >= 120);
  assert.equal(result.event!.peakTimestamp, 650, 'peak time should use the frame timestamp');
  assert.equal(describeHandDirection(result.event!, true), 'left', 'the camera preview mirrors horizontal direction');
  assert.equal(describeHandDirection(result.event!, false), 'right');
  assert.equal(tracker.update(shifted, 800, 1).event, undefined, 'cooldown must prevent duplicate events');
  tracker.update(shifted, 1400, 1);
  assert.equal(tracker.update(shifted, 1800, 1).state, 'waiting', 'a frame gap must reset the gesture');
  const missing = structuredClone(points); missing[15].visibility = 0;
  assert.equal(tracker.update(missing, 1900, 1).state, 'waiting');
  tracker.reset();
  for (const time of [2000,2100,2200,2300]) tracker.update(points, time, 1);
  const short = structuredClone(points); short[15].x += .07; short[16].x += .07;
  tracker.update(short, 2400, 1);
  assert.equal(tracker.update(short, 2500, 1).event, undefined, 'a short twitch should not be emitted');
  tracker.reset();
  for (const time of [3000,3100,3200,3300]) tracker.update(points, time, 1);
  const jump = structuredClone(points); jump[15].x += .3; jump[16].x += .3;
  assert.equal(tracker.update(jump, 3350, 1).state, 'waiting', 'implausible tracking jumps should reset');
});

test('hand-motion preview keeps the furthest excursion when hands return', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  for (const [index, x, y] of [[11,.35,.25],[12,.65,.25],[15,.47,.55],[16,.53,.55],[23,.4,.55],[24,.6,.55]] as const) points[index] = { x, y, visibility: 1 };
  const tracker = new HandMotionPreview();
  for (const time of [0,100,200,300]) tracker.update(points, time, 1);
  const moved = structuredClone(points);
  moved[15].x += .09; moved[16].x += .09; tracker.update(moved, 400, 1);
  moved[15].x += .09; moved[16].x += .09; tracker.update(moved, 500, 1);
  moved[15].x -= .09; moved[16].x -= .09; tracker.update(moved, 600, 1);
  tracker.update(points, 700, 1);
  const event = tracker.update(points, 800, 1).event;
  assert.ok(event && event.maxDisplacement > .55, 'returning to the start should not erase the movement');
  assert.equal(describeHandDirection(event!, true), 'left');
  assert.equal(describeHandDirection({ displacementX: 0, displacementY: -1 }, true), 'up');
  assert.equal(describeHandDirection({ displacementX: 1, displacementY: 1 }, true), 'down-left');
  assert.equal(describeHandDirection({ displacementX: 0, displacementY: 0 }, true), null);
  assert.equal(describeHandDirection({ displacementX: NaN, displacementY: 1 }, true), null);
});

test('practice hand-motion timing uses capture time and rejects unrelated deliveries', () => {
  const event = { durationMs: 300, peakSpeed: 3, peakTimestamp: 9800 };
  const deliveryWindow = { generation: 7, releaseGameTime: 4000, contactGameTime: 4800 };
  assert.equal(compareHandMotionTiming(event, deliveryWindow, 7, 10000, 4900), -100);
  assert.equal(compareHandMotionTiming({ ...event, peakTimestamp: 10100 }, deliveryWindow, 7, 10300, 5200), 200);
  assert.equal(compareHandMotionTiming(event, deliveryWindow, 8, 10000, 4900), null, 'a new delivery must not reuse an older event');
  assert.equal(compareHandMotionTiming(event, null, 7, 10000, 4900), null);
  assert.equal(compareHandMotionTiming({ ...event, peakTimestamp: 10001 }, deliveryWindow, 7, 10000, 4900), null, 'future capture times must be rejected');
  assert.equal(compareHandMotionTiming(event, deliveryWindow, 7, 11801, 6701), null, 'stale worker results must not be associated');
  assert.equal(compareHandMotionTiming({ ...event, peakTimestamp: 9000 }, deliveryWindow, 7, 10000, 4900), null, 'movements before release must not be associated');
  assert.equal(compareHandMotionTiming({ ...event, peakTimestamp: 10600 }, deliveryWindow, 7, 10700, 5700), null, 'movements well after contact must not be associated');
});

test('hand-motion intensity uses explicitly recorded ordered samples and stays bounded', () => {
  const calibration = new HandMotionIntensity();
  assert.equal(calibration.begin('strong'), false);
  assert.equal(calibration.capture(4), 'not-armed');
  assert.equal(calibration.relativeIntensity(4), null);
  assert.equal(calibration.begin('gentle'), true);
  assert.equal(calibration.capture(NaN), 'invalid');
  assert.equal(calibration.hasGentle(), false);
  assert.equal(calibration.begin('gentle'), true);
  assert.equal(calibration.capture(3), 'gentle-saved');
  assert.equal(calibration.begin('strong'), true);
  assert.equal(calibration.capture(3.4), 'too-close');
  assert.equal(calibration.isReady(), false);
  assert.equal(calibration.begin('strong'), true);
  assert.equal(calibration.capture(6), 'strong-saved');
  assert.equal(calibration.relativeIntensity(4.5), .5);
  assert.equal(calibration.relativeIntensity(1), 0);
  assert.equal(calibration.relativeIntensity(10), 1);
  assert.equal(calibration.relativeIntensity(Infinity), null);
  assert.equal(calibration.begin('gentle'), true);
  calibration.cancel();
  assert.equal(calibration.isReady(), true, 'cancelling a replacement should keep prior samples');
  assert.equal(calibration.begin('gentle'), true);
  assert.equal(calibration.capture(4), 'gentle-saved');
  assert.equal(calibration.isReady(), false, 'a new gentle sample requires a new strong sample');
  calibration.reset();
  assert.equal(calibration.hasGentle(), false);
  assert.equal(calibration.getPending(), null);
});

test('pose retarget calibration responds to motion and rejects occlusion', () => {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const [index, x, y] of [[11,.35,.25],[12,.65,.25],[13,.32,.4],[14,.68,.4],[15,.3,.55],[16,.7,.55],[23,.4,.55],[24,.6,.55],[25,.39,.7],[26,.61,.7],[27,.38,.9],[28,.62,.9]] as const) points[index] = { x, y, visibility: 1 };
  const tracker = new PoseRetarget();
  assert.equal(tracker.update(points, false), null);
  assert.equal(tracker.calibrate(points, false), true);
  assert.ok(Math.abs(tracker.update(points, false)!.leftShoulder!.z + 0.12) < 1e-9);
  assert.ok(tracker.getDirections().leftShoulder!.y < -.9, 'a lowered arm should target a downward limb direction');
  const mirrorDirections = new PoseRetarget();
  assert.equal(mirrorDirections.calibrate(points, true), true);
  const asymmetric = structuredClone(points);
  asymmetric[14].x = .85; asymmetric[14].y = .25;
  mirrorDirections.update(asymmetric, true);
  assert.ok(mirrorDirections.getDirections().leftShoulder!.x < -.9, 'mirror mode should map the opposite raised arm across the image');
  assert.ok(mirrorDirections.getDirections().rightShoulder!.y < -.9, 'the other mirrored arm should remain lowered');
  const moved = structuredClone(points);
  moved[13].x = .2;
  assert.ok(Math.abs(tracker.update(moved, false)!.leftShoulder!.z + 0.12) > 0.05);
  moved[15].visibility = 0.1;
  assert.ok(tracker.update(moved, false), 'one occluded hand should not stop the rest of the body');
  assert.equal(tracker.calibrate(moved, true), true);
  moved[11].visibility = 0.1;
  assert.equal(tracker.update(moved, true), null, 'missing torso immediately after recalibration has no previous pose to hold');
  assert.equal(tracker.calibrate(moved, true), false);
  tracker.reset();
  assert.equal(tracker.update(points, false), null);
  assert.equal(tracker.calibrate(points, true), true);
  assert.ok(tracker.update(points, true));
  const depthTracker = new PoseRetarget();
  const world = points.map(point => ({ ...point, z: 0 }));
  const lateDepth = new PoseRetarget();
  assert.equal(lateDepth.calibrate(points, true, []), true);
  assert.equal(lateDepth.getFacing(), null);
  lateDepth.update(points, true, world);
  assert.ok(Math.abs(lateDepth.getFacing()!) < 1e-9, 'front-facing depth can recover after calibration');
  assert.equal(depthTracker.calibrate(points, false, world), true);
  assert.equal(depthTracker.getFacing(), 0, 'a front-facing person should face the bowler');
  const turnedWorld = structuredClone(world);
  turnedWorld[12].z = .2;
  depthTracker.update(points, false, turnedWorld);
  assert.ok(depthTracker.getFacing()! > 0, 'shoulder depth should turn the character');
  const mirroredTracker = new PoseRetarget();
  assert.equal(mirroredTracker.calibrate(points, true, turnedWorld), true);
  assert.ok(mirroredTracker.getFacing()! < 0, 'mirror should reverse the turn');
  const facingTracker = new PoseRetarget();
  assert.equal(facingTracker.calibrate(points, false, world), true);
  const turnedBack = structuredClone(world);
  turnedBack[11].x = .65; turnedBack[12].x = .35;
  for (let i = 0; i < 40; i++) facingTracker.update(points, false, turnedBack);
  assert.ok(Math.abs(facingTracker.getFacing()!) > 2.8, 'turning away should not fold back to the front');
  const bentBack = structuredClone(world);
  bentBack[11].z = -.2; bentBack[12].z = -.2;
  const bentPose = facingTracker.update(points, false, bentBack)!;
  assert.ok(Math.abs(bentPose.spine!.x) > .05 && Math.abs(bentPose.chest!.x) > .05, 'back bend should affect both spine and chest');
  depthTracker.update(points, false, []);
  assert.equal(depthTracker.getFacing(), null, 'missing depth must not produce a turn');
  world[13].z = .15;
  assert.ok(Math.abs(depthTracker.update(points, false, world)!.leftShoulder!.x) > .05, 'depth movement should rotate the arm');
  const shifted = structuredClone(points);
  for (const index of [11,12,13,14,15,16,23,24,25,26,27,28]) { shifted[index].x += .08; shifted[index].y += .03; }
  depthTracker.update(shifted, false, world);
  assert.ok(depthTracker.getOffset().x > 0 && depthTracker.getOffset().y < 0, 'body shift and crouch should move the visual character');
  depthTracker.reset();
  assert.deepEqual(depthTracker.getOffset(), { x: 0, y: 0, z: 0 });
  const depthMovement = new PoseRetarget();
  assert.equal(depthMovement.calibrate(points, false, [], 1000), true);
  const nearer = structuredClone(points);
  nearer[11].y -= .1; nearer[12].y -= .1;
  depthMovement.update(nearer, false, [], 1100);
  assert.ok(depthMovement.getOffset().z < 0, 'larger apparent torso should move the visual character toward the camera');
  const dropout = new PoseRetarget();
  assert.equal(dropout.calibrate(points, false, [], 1000), true);
  const bent = structuredClone(points);
  bent[25].x = .24;
  const beforeLoss = dropout.update(bent, false, [], 1100)!.leftHip!.z;
  const directionBeforeLoss = dropout.getDirections().leftHip!.clone();
  bent[25].visibility = 0;
  const briefLoss = dropout.update(bent, false, [], 1200)!.leftHip!.z;
  assert.equal(briefLoss, beforeLoss, 'brief landmark loss should hold the last pose');
  assert.deepEqual(dropout.getDirections().leftHip!.asArray(), directionBeforeLoss.asArray(), 'brief loss should hold the tracked limb direction');
  const longLoss = dropout.update(bent, false, [], 1500)!.leftHip!.z;
  assert.ok(Math.abs(longLoss) < Math.abs(briefLoss), 'prolonged landmark loss should return toward neutral');
  bent[25].visibility = 1;
  assert.ok(Math.abs(dropout.update(bent, false, [], 1600)!.leftHip!.z) > Math.abs(longLoss), 'the leg should recover when visible again');
  const segmentTracker = new PoseRetarget();
  const spatial = points.map(point => ({ ...point, z: 0 }));
  assert.equal(segmentTracker.calibrate(points, false, spatial, 2000), true);
  spatial[13] = { ...spatial[13], x: .2, y: .3, z: -.1 };
  for (let i = 0; i < 12; i++) segmentTracker.update(points, false, spatial, 2100 + i * 70);
  const expected = new Vector3(-.15, -.05, .1).normalize();
  assert.ok(Vector3.Dot(segmentTracker.getDirections().leftShoulder!, expected) > .99, 'limb targets should preserve 3D direction');
});

test('pose smoothing compensates for slower frames and bounds long-gap catch-up', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [index, x, y] of [[0,.5,.1],[11,.35,.25],[12,.65,.25],[13,.32,.4],[14,.68,.4],[15,.3,.55],[16,.7,.55],[23,.4,.55],[24,.6,.55],[25,.39,.7],[26,.61,.7],[27,.38,.9],[28,.62,.9]] as const) points[index] = { x, y, z: 0, visibility: 1 };
  for (const mirror of [false, true]) {
    const fast = new PoseRetarget(), slow = new PoseRetarget(), stalled = new PoseRetarget();
    for (const tracker of [fast, slow, stalled]) { assert.equal(tracker.calibrate(points, mirror, points, 1000), true); tracker.update(points, mirror, points, 1000); }
    const moved = structuredClone(points); for (const p of moved) p.x += .08;
    const turned = structuredClone(points); turned[12].z = .2;
    for (const time of [1000 + 1000 / 15, 1000 + 2000 / 15, 1200]) fast.update(moved, mirror, turned, time);
    slow.update(moved, mirror, turned, 1200);
    stalled.update(moved, mirror, turned, 3000);
    assert.ok(Math.abs(fast.getOffset().x - slow.getOffset().x) < 1e-8);
    assert.ok(Math.abs(fast.getFacing()! - slow.getFacing()!) < 1e-8);
    assert.ok(Math.abs(stalled.getOffset().x - slow.getOffset().x) < 1e-8, 'a long gap must not cause unbounded catch-up');
  }
});

test('brief torso loss holds uncertain pose and recovers, while prolonged loss stops tracking', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  for (const [index, x, y] of [[0,.5,.1],[11,.35,.25],[12,.65,.25],[13,.32,.4],[14,.68,.4],[15,.3,.55],[16,.7,.55],[23,.4,.55],[24,.6,.55],[25,.39,.7],[26,.61,.7],[27,.38,.9],[28,.62,.9]] as const) points[index] = { x, y, visibility: 1 };
  const tracker = new PoseRetarget();
  assert.equal(tracker.calibrate(points, false, [], 1000), true);
  const pose = tracker.update(points, false, [], 1100)!;
  const obscured = structuredClone(points); obscured[11].visibility = 0;
  assert.equal(tracker.update(obscured, false, [], 1400), pose);
  assert.equal(tracker.isHoldingPose(), true);
  assert.deepEqual(tracker.getConfidence(), {}, 'held joints must not appear confidently tracked');
  assert.ok(tracker.update(points, false, [], 1500));
  assert.equal(tracker.isHoldingPose(), false);
  assert.equal(tracker.getConfidence().leftShoulder, true);
  assert.equal(tracker.update(obscured, false, [], 2001), null);
  assert.equal(tracker.isHoldingPose(), false);
  tracker.reset();
  assert.equal(tracker.update(points, false, [], 2100), null);
});

test('partial world landmarks never mix screen and world coordinates in an angle', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [index, x, y] of [[0,.5,.1],[11,.35,.25],[12,.65,.25],[13,.3,.4],[14,.7,.4],[15,.25,.55],[16,.75,.55],[23,.4,.55],[24,.6,.55],[25,.39,.7],[26,.61,.7],[27,.38,.85],[28,.62,.85]] as const) points[index] = { x, y, z: 0, visibility: 1 };
  for (const mirror of [false, true]) {
    const tracker = new PoseRetarget();
    assert.equal(tracker.calibrate(points, mirror, [], 1000), true);
    const partial = points.map(p => ({ ...p, x: p.x * 3 + 4, y: p.y * 3 - 2, z: 5 }));
    partial[13] = undefined as unknown as typeof partial[number];
    const result = tracker.update(points, mirror, partial, 1100)!;
    const elbow = mirror ? result.rightElbow! : result.leftElbow!;
    assert.ok(Math.abs(elbow.x) < 1e-8 && Math.abs(elbow.z) < 1e-8, 'missing depth must use screen coordinates for the entire limb angle');
    const missingTorso = points.map(p => ({ ...p, x: p.x * 3 + 4, y: p.y * 3 - 2, z: 5 }));
    missingTorso[11].x = NaN;
    const torso = tracker.update(points, mirror, missingTorso, 1200)!;
    assert.ok(Math.abs(torso.spine!.x) < 1e-8 && Math.abs(torso.spine!.z) < 1e-8, 'invalid depth must use screen coordinates for the whole torso');
    const restored = tracker.update(points, mirror, points, 1300)!;
    assert.ok(Math.abs(restored.spine!.x) < 1e-8 && Math.abs(restored.spine!.z) < 1e-8, 'valid depth can recover');
  }
});

test('image fallback respects frame aspect while world directions stay unchanged', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [i,x,y] of [[11,.45,.25],[12,.55,.25],[13,.5,.35],[14,.6,.35],[23,.46,.55],[24,.54,.55]] as const) points[i] = { x, y, z: 0, visibility: 1 };
  const portrait = points.map(p => ({ ...p, x: .5 + (p.x - .5) * 4 }));
  const landscapeTracker = new PoseRetarget(), portraitTracker = new PoseRetarget();
  assert.equal(landscapeTracker.calibrate(points, false, [], 1000, 2), true);
  assert.equal(portraitTracker.calibrate(portrait, false, [], 1000, .5), true);
  landscapeTracker.update(points, false, [], 1100); portraitTracker.update(portrait, false, [], 1100);
  const a = landscapeTracker.getDirections().leftShoulder!, b = portraitTracker.getDirections().leftShoulder!;
  assert.ok(Math.abs(a.x - Math.SQRT1_2) < 1e-8 && Math.abs(a.y + Math.SQRT1_2) < 1e-8);
  assert.ok(a.subtract(b).length() < 1e-8, 'equal pixel geometry should give equal directions');
  const world = points.map(p => ({ ...p }));
  const first = new PoseRetarget(), second = new PoseRetarget();
  assert.equal(first.calibrate(points, false, world, 1000, 2), true);
  assert.equal(second.calibrate(points, false, world, 1000, .5), true);
  first.update(points, false, world, 1100); second.update(points, false, world, 1100);
  assert.ok(first.getDirections().leftShoulder!.subtract(second.getDirections().leftShoulder!).length() < 1e-8);
  assert.equal(new PoseRetarget().calibrate(points, false, [], 1000, 0), false);
  assert.equal(new PoseRetarget().calibrate(points, false, [], 1000, NaN), false);
});

test('visible arm and foot directions fall back together when world coordinates are invalid', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  for (const [index, x, y] of [[0,.5,.1],[11,.35,.25],[12,.65,.25],[13,.25,.35],[14,.75,.35],[15,.2,.5],[16,.8,.5],[23,.4,.55],[24,.6,.55],[25,.35,.7],[26,.65,.7],[27,.3,.85],[28,.7,.85],[31,.2,.88],[32,.8,.88]] as const) points[index] = { x, y, z: 0, visibility: 1 };
  for (const mirror of [false, true]) {
    const tracker = new PoseRetarget();
    assert.equal(tracker.calibrate(points, mirror, points, 1000), true);
    const invalid = structuredClone(points); invalid[13].z = NaN; invalid[31].x = Infinity;
    tracker.update(points, mirror, invalid, 1100);
    const shoulder = tracker.getDirections()[mirror ? 'rightShoulder' : 'leftShoulder']!;
    const ankle = tracker.getDirections()[mirror ? 'rightAnkle' : 'leftAnkle']!;
    assert.ok(shoulder.x * (mirror ? 1 : -1) > .5, 'visible upper arm should use screen direction');
    assert.ok(ankle.x * (mirror ? 1 : -1) > .9, 'visible foot should use screen direction');
    assert.ok(Object.values(tracker.getDirections()).every(v => [v.x, v.y, v.z].every(Number.isFinite)));
    tracker.update(points, mirror, points, 1200);
    assert.ok(tracker.getDirections()[mirror ? 'rightAnkle' : 'leftAnkle']);
  }
});

test('hand and foot directions hold briefly, then clear when landmarks are occluded', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 0 }));
  for (const [index, x, y] of [[0,.5,.1],[11,.35,.25],[12,.65,.25],[13,.32,.4],[14,.68,.4],[15,.3,.55],[16,.7,.55],[19,.25,.58],[20,.75,.58],[23,.4,.55],[24,.6,.55],[25,.39,.7],[26,.61,.7],[27,.38,.85],[28,.62,.85],[31,.32,.9],[32,.68,.9]] as const) points[index] = { x, y, z: 0, visibility: 1 };
  const tracker = new PoseRetarget();
  assert.equal(tracker.calibrate(points, false, [], 1000), true);
  tracker.update(points, false, [], 1100);
  assert.ok(tracker.getDirections().leftWrist!.x < -.5);
  assert.ok(tracker.getDirections().rightAnkle!.x > .5);
  assert.equal(tracker.getConfidence().leftIndex, true);
  const obscured = structuredClone(points); obscured[19].visibility = 0; obscured[31].visibility = 0;
  tracker.update(obscured, false, [], 1200);
  assert.ok(tracker.getDirections().leftWrist, 'brief occlusion should hold hand direction');
  assert.equal(tracker.getConfidence().leftIndex, false, 'X-ray confidence should immediately show uncertainty');
  tracker.update(obscured, false, [], 1500);
  assert.equal(tracker.getDirections().leftWrist, undefined);
  assert.equal(tracker.getDirections().leftAnkle, undefined);
  tracker.update(points, false, [], 1600);
  assert.ok(tracker.getDirections().leftWrist, 'visible landmarks should resume tracking');
  assert.equal(tracker.getConfidence().leftToe, true);
  const mirrored = new PoseRetarget();
  assert.equal(mirrored.calibrate(points, true, [], 2000), true);
  mirrored.update(obscured, true, [], 2100);
  assert.equal(mirrored.getConfidence().rightIndex, false, 'mirroring must swap source confidence');
  assert.equal(mirrored.getConfidence().leftIndex, true);
});

test('head turning follows ear depth relative to the body, with mirror and occlusion handling', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 0 }));
  for (const [index, x, y] of [[0,.5,.1],[7,.44,.12],[8,.56,.12],[11,.35,.25],[12,.65,.25],[23,.4,.55],[24,.6,.55]] as const) points[index] = { x, y, z: 0, visibility: 1 };
  const world = structuredClone(points);
  const tracker = new PoseRetarget();
  assert.equal(tracker.calibrate(points, false, world, 1000), true);
  const headOnly = structuredClone(world); headOnly[8].z = .06;
  const turned = tracker.update(points, false, headOnly, 1100)!;
  assert.ok(turned.head!.y > .1, 'head turn should produce relative yaw');
  const mirrored = new PoseRetarget();
  assert.equal(mirrored.calibrate(points, true, world, 1000), true);
  assert.ok(mirrored.update(points, true, headOnly, 1100)!.head!.y < -.1, 'mirror should reverse head yaw');
  const together = new PoseRetarget();
  assert.equal(together.calibrate(points, false, world, 1000), true);
  const bodyAndHead = structuredClone(headOnly); bodyAndHead[12].z = .15;
  assert.ok(Math.abs(together.update(points, false, bodyAndHead, 1100)!.head!.y) < .02, 'head should not turn twice when body and head turn together');
  const hidden = structuredClone(points); hidden[8].visibility = 0;
  const held = tracker.update(hidden, false, headOnly, 1200)!.head!.y;
  assert.equal(held, turned.head!.y);
  assert.equal(tracker.getConfidence().head, false);
  assert.ok(Math.abs(tracker.update(hidden, false, headOnly, 1500)!.head!.y) < Math.abs(held));
});

test('swing strength preserves legacy behavior and scales both distance and ball velocity', () => {
  const batter = getOrCreatePlayer();
  const bowler = createBotPlayer('Hard');
  const ball = delivery(0.5);
  const shot = { direction: 2, type: 'power' as const, timing: 0.5, contactZone: 0.5 };
  const distance = (strength?: number) => calculateDistance(batter, bowler, ball, { ...shot, strength }, 180).distance;
  const incoming = { x: 2, y: -1, z: -25 };
  const velocity = (strength?: number) => calculateShotTrajectory(0.8, 0.5, 0.5, 0, incoming, { x: 0, y: 0, z: 0 }, true, false, 'Medium', 'power', 50, strength);
  assert.equal(swingStrengthFactor(undefined), 1);
  assert.equal(swingStrengthFactor(NaN), 1);
  assert.equal(swingStrengthFactor(-2), 0.4);
  assert.equal(swingStrengthFactor(2), 1);
  assert.equal(distance(), distance(1));
  assert.deepEqual(velocity(), velocity(1));
  assert.ok(distance(0) < distance(0.5) && distance(0.5) < distance(1));
  const full = velocity(1);
  const soft = velocity(0);
  assert.ok(Math.abs(soft.x - full.x * 0.4) < 1e-9);
  assert.ok(Math.abs(soft.y - full.y * 0.4) < 1e-9);
  assert.ok(Math.abs(soft.z - full.z * 0.4) < 1e-9);
  assert.deepEqual(velocity(NaN), full);
  assert.deepEqual(velocity(2), full);
  assert.deepEqual(velocity(-1), soft);
  const carry = (strength: number) => {
    const state: BallState = { position: { x: 0, y: 0.4, z: 0 }, velocity: velocity(strength), hasBounced: false, reachedBoundary: false, stopped: false };
    for (let i = 0; i < 3600 && !state.stopped && !state.reachedBoundary; i++) stepBall(state, 1 / 120);
    return Math.hypot(state.position.x, state.position.z);
  };
  assert.ok(carry(0) < carry(1));
});

test('recorded shots retain their swing strength', () => {
  const game = new MatchController('Hard');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const shot = { direction: 0, type: 'power' as const, timing: 0.5, contactZone: 0.5, strength: 0.25 };
  const result = game.recordBall(delivery(0.5), shot);
  shot.strength = 1;
  assert.equal(result.shot?.strength, 0.25);
});

test('articulated batter maintains joint hierarchy, bounded poses and handed bat attachment', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('rig-test', scene);
    const rig = new BatterRig(scene, { blue: material, trousers: material, skin: material, helmet: material, pads: material, shoes: material, batWood: material, grip: material });
    assert.equal(Object.keys(rig.joints).length, 17);
    assert.equal(rig.joints.leftElbow.parent, rig.joints.leftShoulder);
    assert.equal(rig.joints.leftWrist.parent, rig.joints.leftElbow);
    assert.equal(rig.joints.rightKnee.parent, rig.joints.rightHip);
    assert.equal(rig.joints.rightAnkle.parent, rig.joints.rightKnee);
    assert.equal(rig.batPivot.parent, rig.joints.rightWrist);
    const elbowOffset = rig.joints.leftElbow.position.clone();
    assert.equal(rig.setJointRotation('leftShoulder', new Vector3(10, -10, 0.5)), true);
    assert.deepEqual(rig.joints.leftShoulder.rotation.asArray(), [Math.PI / 2, -Math.PI / 2, 0.5]);
    assert.deepEqual(rig.joints.leftElbow.position.asArray(), elbowOffset.asArray());
    assert.equal(rig.setJointRotation('leftShoulder', new Vector3(NaN, 0, 0)), false);
    assert.equal(rig.joints.leftShoulder.rotation.z, 0.5);
    assert.equal(rig.applyPose({ leftShoulder: new Vector3(0.2, 0, 0), rightKnee: new Vector3(0.5, 0, 0) }), true);
    assert.equal(rig.joints.rightKnee.rotation.x, 0.5);
    assert.equal(rig.applyPose({ leftShoulder: new Vector3(0.6, 0, 0), rightKnee: new Vector3(NaN, 0, 0) }), false);
    assert.equal(rig.joints.leftShoulder.rotation.x, 0.2);
    assert.equal(rig.applyTrackingPose({ leftShoulder: Vector3.Zero() }, { leftShoulder: new Vector3(1, 0, 0) }), true);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    rig.joints.leftShoulder.computeWorldMatrix(true); rig.joints.leftElbow.computeWorldMatrix(true);
    const fallbackArm = rig.joints.leftElbow.getAbsolutePosition().subtract(rig.joints.leftShoulder.getAbsolutePosition()).normalize();
    assert.ok(fallbackArm.x > .98, 'fallback rig should follow the tracked limb direction');
    rig.setHandedness('LHB');
    assert.equal(rig.joints.leftShoulder.rotationQuaternion, null, 'normal animation should regain control after tracking');
    assert.equal(rig.batPivot.parent, rig.joints.leftWrist);
    assert.equal(rig.joints.leftShoulder.rotation.z, -0.12);
    rig.animateSwing(0, () => {});
    rig.setHandedness('RHB');
    assert.equal(rig.batPivot.parent, rig.joints.rightWrist);
    assert.equal(rig.batPivot.rotation.z, -0.2);
    const swings: number[] = [];
    const originalAnimate = scene.beginDirectAnimation.bind(scene);
    scene.beginDirectAnimation = ((target: unknown, animations: { name: string; getKeys: () => { value: number }[] }[], ...args: unknown[]) => {
      if (animations[0]?.name === 'batSwing') swings.push(animations[0].getKeys()[2].value);
      return (originalAnimate as (...parameters: any[]) => any)(target, animations, ...args);
    }) as typeof scene.beginDirectAnimation;
    rig.animateSwing(0, () => {}, 'defensive', 'front_foot');
    rig.animateSwing(0, () => {}, 'lofted', 'back_foot');
    rig.animateSwing(2, () => {}, 'lofted', 'back_foot');
    assert.notEqual(swings[0], swings[1], 'shot type should change the swing');
    assert.notEqual(swings[1], swings[2], 'direction should change the swing');
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test('standalone batting resolution leaves match state and inputs untouched and agrees with match scoring', () => {
  const game = new MatchController('Hard');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const innings = game.getCurrentInnings();
  const ball = { ...delivery(0.5), batterPosition: { x: 0, z: 0 } };
  const shot = { direction: 0, type: 'grounded' as const, timing: 0.5, contactZone: 0.5 };
  const input = { delivery: ball, shot, batter: innings.batter, bowler: innings.bowler, difficulty: 'Hard' as const, ballNumber: 1, isFreeHit: false };
  const beforeState = structuredClone(game.state);
  const beforeInput = structuredClone(input);
  const isolated = resolveBattingDelivery(input);
  assert.deepEqual(game.state, beforeState);
  assert.deepEqual(input, beforeInput);
  assert.deepEqual(game.recordBall(ball, shot), isolated.outcome);
  ball.aimTarget.x = 1;
  ball.batterPosition.x = 1;
  shot.direction = 2;
  assert.deepEqual(isolated.outcome.delivery.aimTarget, { x: 0, z: -3.5 });
  assert.equal(isolated.outcome.delivery.batterPosition?.x, 0);
  assert.equal(isolated.outcome.shot?.direction, 0);
  const flight = resolveShotFlight(85, false, true);
  assert.deepEqual(flight, { distance: 85, runs: 6 });
  assert.equal(game.finalizeBallOutcome(85, false, true), flight.runs);
});

test('standalone resolution returns free-hit transitions and bounds flight distance', () => {
  const batter = getOrCreatePlayer();
  const bowler = createBotPlayer('Hard');
  const base = { batter, bowler, difficulty: 'Hard' as const, ballNumber: 1, shot: null };
  const noBall = resolveBattingDelivery({ ...base, delivery: { ...delivery(0.5), frontFootHeel: 0.01 }, isFreeHit: false });
  assert.equal(noBall.outcome.extraType, 'noball');
  assert.equal(noBall.nextFreeHit, true);
  const wide = resolveBattingDelivery({ ...base, delivery: delivery(0.5, 1.4), isFreeHit: true });
  assert.equal(wide.outcome.extraType, 'wide');
  assert.equal(wide.nextFreeHit, true);
  const legal = resolveBattingDelivery({ ...base, delivery: delivery(0.5), isFreeHit: true });
  assert.equal(legal.outcome.isFreeHit, true);
  assert.equal(legal.outcome.isWicket, false);
  assert.equal(legal.nextFreeHit, false);
  assert.equal(resolveShotFlight(Infinity, false).distance, 0);
  assert.equal(resolveShotFlight(200, false).distance, 130);
});

test('a new match initializes even when a previous scene has a ball in play', () => {
  const previous = globalAutoAssistConfig.isBallInPlay;
  const previousRookie = globalAutoAssistConfig.isRookie;
  try {
    globalAutoAssistConfig.isBallInPlay = true;
    const game = new MatchController('Medium');
    assert.equal(game.state.status, 'toss');
    assert.equal(game.state.player.id, 'player_1');
    assert.deepEqual(game.state.innings, []);
    const state = game.state;
    game.reset();
    assert.equal(game.state, state);
  } finally {
    globalAutoAssistConfig.isBallInPlay = previous;
    globalAutoAssistConfig.isRookie = previousRookie;
  }
});

test('rendered stumps match the wicket dimensions used for decisions', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const renderer = Object.create(GameScene.prototype) as any;
    renderer.scene = scene;
    renderer.buildStumps(new Vector3(0, 0, -10));
    const left = scene.getMeshByName('stump_-10_-1')!;
    const right = scene.getMeshByName('stump_-10_1')!;
    left.computeWorldMatrix(true);
    right.computeWorldMatrix(true);
    const minimum = left.getBoundingInfo().boundingBox.minimumWorld;
    const maximum = right.getBoundingInfo().boundingBox.maximumWorld;
    assert.ok(Math.abs(maximum.x - minimum.x - WICKET_WIDTH_METERS) < 0.001);
    assert.ok(Math.abs(maximum.y - STUMP_HEIGHT_METERS) < 0.001);
    assert.ok(Math.abs(minimum.y) < 0.001);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test('opponent badge reflects handedness without revealing the next delivery', () => {
  const bot = createBotPlayer('Rookie');
  bot.bowlingArm = 'Left';
  bot.batterHand = 'LHB';
  assert.equal(opponentBadgeText(bot, true), `Opponent: ${bot.name} | Left-arm bowler`);
  assert.equal(opponentBadgeText(bot, false), `Opponent: ${bot.name} | LHB`);
  delete bot.bowlingArm;
  delete bot.batterHand;
  assert.equal(opponentBadgeText(bot, true), `Opponent: ${bot.name} | Right-arm bowler`);
  assert.equal(opponentBadgeText(bot, false), `Opponent: ${bot.name} | RHB`);
});

test('rendered popping creases match the delivery model at both ends', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const renderer = Object.create(GameScene.prototype) as any;
    renderer.scene = scene;
    renderer.buildStadium();
    for (const [name, expectedZ] of [['poppingCreaseBowl', BATTER_CREASE_Z], ['poppingCreaseBat', -BATTER_CREASE_Z]] as const) {
      const marking = scene.getMeshByName(name)!;
      marking.computeWorldMatrix(true);
      const bounds = marking.getBoundingInfo().boundingBox;
      assert.ok(Math.abs(bounds.minimumWorld.z - expectedZ) < 0.00001);
      assert.ok(Math.abs(bounds.maximumWorld.z - expectedZ) < 0.00001);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test('rendered bowling paths use the same sampled trajectory as contact decisions', () => {
  const oldArm = globalAutoAssistConfig.bowlerArm;
  const scene = Object.create(GameScene.prototype) as GameScene;
  try {
    for (const arm of ['Right', 'Left'] as const) {
      globalAutoAssistConfig.bowlerArm = arm;
      for (const type of ['fast', 'offspin', 'legspin'] as const) {
        const ball: DeliveryChoice = {
          ...delivery(0.5, 0.3), type, overTheWicket: false, bowlingArm: arm,
          turn: 0.7, swing: -0.5, pace: 0.8
        };
        const points = scene.generateTrajectoryPoints(ball.aimTarget, type, false, ball.turn, ball.swing, ball.pace);
        for (const index of [0, 20, 40, 60]) {
          const expected = sampleDeliveryPath(ball, index / 60);
          assert.ok(Math.abs(points[index].x - expected.x) < 1e-9);
          assert.ok(Math.abs(points[index].z - expected.z) < 1e-9);
          assert.ok(Math.abs(points[index].y - expected.y - (0.075 - BALL_RADIUS_METERS)) < 1e-9);
        }
        assert.deepEqual(deliveryContactPoint(ball), sampleDeliveryPath(ball, batterContactProgress(ball)));
      }
    }
  } finally {
    globalAutoAssistConfig.bowlerArm = oldArm;
  }
});

test('bot delivery resolves at the modeled contact point and triggers its swing first', () => {
  const previousArm = globalAutoAssistConfig.bowlerArm;
  try {
    for (const type of ['fast', 'offspin', 'legspin'] as const) {
      for (const frameMs of [1000 / 60, 50]) {
        for (const crossBothThresholds of [false, true]) {
          globalAutoAssistConfig.bowlerArm = 'Right';
          const renderer = Object.create(GameScene.prototype) as any;
          const ball = { position: new Vector3(), setEnabled: () => {} };
          const events: string[] = [];
          let observed: Vector3 | null = null;
          let swingAt = 0;
          Object.assign(renderer, {
            ballMesh: ball, engine: { getDeltaTime: () => frameMs }, scene: { activeCamera: null },
            isBotBatting: true, bowlerRoot: null, bounceMarker: null, timingRing: null, predictionPath: null,
            clearBallTrail: () => {}, drawBallTrail: () => {}, setCameraMode: () => {},
            botBattingTriggerCallback: () => { swingAt = renderer.ballAnimationTime / 60; events.push('swing'); }
          });
          const input: DeliveryChoice = { ...delivery(0.5, 0.35), type, aimTarget: { x: 0.35, z: -3.5 }, overTheWicket: false, bowlingArm: 'Right', pace: 0.8, turn: 0.7, swing: -0.4 };
          renderer.animateDelivery(input.aimTarget, input.length, type, () => { events.push('arrive'); observed = ball.position.clone(); }, () => {}, false, undefined, false, 0, input.pace, input.turn, input.swing);
          if (crossBothThresholds) renderer.ballAnimationTime = 60 * batterContactProgress(input) - 0.1;
          for (let i = 0; i < 1000 && renderer.updateDeliveryAnimation; i++) renderer.updateDeliveryAnimation();
          const expected = deliveryContactPoint(input);
          assert.deepEqual(events, ['swing', 'arrive'], `${type} at ${frameMs} ms`);
          if (!crossBothThresholds) {
            const lead = (batterContactProgress(input) - swingAt) * deliveryDurationMs(type, input.pace);
            assert.ok(lead <= 150 + 1e-6 && lead >= 150 - frameMs - 1e-6, `unexpected swing lead: ${lead} ms`);
          }
          assert.ok(observed);
          const actual = observed as unknown as Vector3;
          assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
          assert.ok(Math.abs(actual.y - expected.y - (0.075 - BALL_RADIUS_METERS)) < 1e-9);
          assert.ok(Math.abs(actual.z - expected.z) < 1e-9);
        }
      }
    }
  } finally {
    globalAutoAssistConfig.bowlerArm = previousArm;
  }
});

test('shot cameras follow every direction and keep a stable elevated result view', () => {
  const ball = { x: 12, y: 3, z: -4 };
  for (const [x, z] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]) {
    const direction = shotCameraDirection({ x, y: 12, z });
    const follow = followShotPose(ball, direction);
    const result = shotResultPose(ball, direction);
    const behind = (ball.x - follow.position.x) * direction.x + (ball.z - follow.position.z) * direction.z;
    assert.ok(Math.abs(behind - 12) < 1e-9);
    assert.ok(follow.position.y > ball.y && result.position.y > ball.y);
    assert.deepEqual(follow.target, ball);
    assert.deepEqual(result.target, ball);
    assert.ok(Object.values(result.position).every(Number.isFinite));
  }
  assert.deepEqual(shotCameraDirection({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
  const beyondRope = shotResultPose({ x: 90, y: 0, z: 90 }, shotCameraDirection({ x: 1, y: 0, z: 1 }));
  assert.ok(Math.hypot(beyondRope.position.x, beyondRope.position.z) <= 55.000001);
  assert.ok(Math.hypot(beyondRope.target.x, beyondRope.target.z) <= 62.000001);
  const chase = followShotPose({ x: 90, y: 4, z: 90 }, shotCameraDirection({ x: 1, y: 0, z: 1 }));
  assert.ok(Math.hypot(chase.position.x, chase.position.z) <= 60.000001);
  assert.ok(chase.position.y >= 14);
});

test('batting timing feedback matches the shot timing scale and clamps its marker', () => {
  assert.deepEqual(battingTimingFeedback(0.5), { position: 0.5, offsetMs: 0, label: 'PERFECT' });
  assert.deepEqual(battingTimingFeedback(0.4), { position: 0.4, offsetMs: -50, label: 'EARLY' });
  assert.deepEqual(battingTimingFeedback(0.6), { position: 0.6, offsetMs: 50, label: 'LATE' });
  assert.equal(battingTimingFeedback(-2).position, 0);
  assert.equal(battingTimingFeedback(2).position, 1);
});

test('batting timing meter displays the actual shot offset', () => {
  const oldDocument = globalThis.document;
  const marker = { style: { left: '' } };
  const label = { textContent: '' };
  let shown = false;
  const widget = { dataset: { timing: '' }, classList: { remove: () => { shown = true; } } };
  Object.assign(globalThis, { document: { getElementById: (id: string) => ({
    'timing-widget': widget, 'timing-bar-cursor': marker, 'timing-instruction': label
  } as Record<string, unknown>)[id] ?? null } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = { botDifficulty: 'Hard' };
    ui.showBattingTiming(0.4);
    assert.equal(marker.style.left, '40%');
    assert.equal(label.textContent, 'EARLY · 50 ms');
    assert.equal(widget.dataset.timing, 'early');
    assert.equal(shown, true);
    ui.controller.botDifficulty = 'Rookie';
    ui.showBattingTiming(0.6);
    assert.equal(label.textContent, 'LATE · 50 ms · ASSISTED');
  } finally {
    Object.assign(globalThis, { document: oldDocument });
  }
});

test('batting prompts match touch and keyboard inputs', () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const helper = { style: {}, innerHTML: '' };
  let coarse = true;
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: coarse }) },
    document: { getElementById: (id: string) => id === 'batting-helper' ? helper : {} }
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.showBattingHelper('Straight Drive [W]');
    assert.match(helper.innerHTML, /TAP A SHOT/);
    assert.doesNotMatch(helper.innerHTML, /\[W\]/);
    coarse = false;
    ui.showBattingHelper('Straight Drive [W]');
    assert.match(helper.innerHTML, /PRESS SPACE/);
    assert.match(helper.innerHTML, /\[W\]/);
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow });
  }
});

test('the first run-up follows the newly selected bowling side, not the previous delivery', () => {
  const oldDelivery = globalAutoAssistConfig.currentDelivery;
  const oldStart = globalAutoAssistConfig.runUpStartTime;
  const scene = Object.create(GameScene.prototype) as any;
  scene.bowlerRoot = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0 }, setEnabled() {} };
  scene.batterRoot = null;
  scene.bowlerLegs = [];
  scene.bowlerArms = [];
  try {
    globalAutoAssistConfig.currentDelivery = { ...delivery(0.5), overTheWicket: true, bowlingArm: 'Right' };
    globalAutoAssistConfig.runUpStartTime = gameNow() - 1;
    scene.setBowlerSide(false, 'Right');
    scene.updateBowlerRunUp();
    assert.equal(scene.bowlerRoot.position.x, deliveryReleaseX({ overTheWicket: false, bowlingArm: 'Right' }));
    scene.setBowlerSide(true, 'Left');
    scene.updateBowlerRunUp();
    assert.equal(scene.bowlerRoot.position.x, deliveryReleaseX({ overTheWicket: true, bowlingArm: 'Left' }));
    globalAutoAssistConfig.runUpStartTime = 0;
    scene.bowlerRoot.position.x = 99;
    scene.updateBowlerRunUp();
    assert.equal(scene.bowlerRoot.position.x, deliveryReleaseX({ overTheWicket: true, bowlingArm: 'Left' }));
  } finally {
    globalAutoAssistConfig.currentDelivery = oldDelivery;
    globalAutoAssistConfig.runUpStartTime = oldStart;
  }
});

test('a delivery starting at time zero advances the visible ball', () => {
  const oldStart = globalAutoAssistConfig.deliveryStartTime;
  const oldDelivery = globalAutoAssistConfig.currentDelivery;
  const oldActive = globalAutoAssistConfig.isDeliveryActive;
  const scene = Object.create(GameScene.prototype) as any;
  let moved = false;
  scene.ballMesh = { position: { set: () => { moved = true; } } };
  scene.notifyDeliveryBounce = () => {};
  scene.onBallArrivedCallback = null;
  try {
    globalAutoAssistConfig.deliveryStartTime = 0;
    globalAutoAssistConfig.currentDelivery = delivery(0.5);
    globalAutoAssistConfig.isDeliveryActive = true;
    scene.updateBallFlight();
    assert.equal(moved, true);
  } finally {
    globalAutoAssistConfig.deliveryStartTime = oldStart;
    globalAutoAssistConfig.currentDelivery = oldDelivery;
    globalAutoAssistConfig.isDeliveryActive = oldActive;
  }
});

test('sound effects unlock on input and respect mute without interrupting play', () => {
  storage.delete('hardhit_sound_muted');
  let sources = 0;
  const parameter = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = { connect() { return this; }, start() {}, stop() {} };
  const context = {
    state: 'running', currentTime: 0, sampleRate: 100,
    destination: {},
    createGain: () => ({ ...node, gain: { ...parameter } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(50) }),
    createBufferSource: () => { sources++; return { ...node, buffer: null }; },
    createBiquadFilter: () => ({ ...node, frequency: { value: 0 } }),
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.state = 'running'; return Promise.resolve(); }
  };
  const sounds = new SoundManager(() => context as unknown as AudioContext);
  sounds.play('bat');
  assert.equal(sources, 0);
  sounds.unlock();
  sounds.play('bat');
  sounds.play('bounce');
  assert.equal(sources, 2);
  sounds.setMuted(true);
  sounds.play('wicket');
  assert.equal(sources, 2);
  sounds.setMuted(false);
  sounds.play('delivery');
  assert.equal(sources, 3);
  storage.delete('hardhit_sound_muted');
});

test('recorded cricket sounds play on their events and stop when muted', () => {
  const originalAudio = globalThis.Audio;
  const originalDocument = globalThis.document;
  const previousMute = storage.get('hardhit_sound_muted');
  storage.delete('hardhit_sound_muted');
  const loaded: string[] = [];
  let played = 0;
  let paused = 0;
  class FakeAudio {
    preload = '';
    volume = 1;
    constructor(url: string) { loaded.push(url); }
    cloneNode() { return { volume: 1, addEventListener() {}, play() { played++; return Promise.resolve(); }, pause() { paused++; } }; }
  }
  Object.assign(globalThis, { Audio: FakeAudio, document: { baseURI: 'http://localhost/game/' } });
  try {
    const context = { state: 'running', suspend() { return Promise.resolve(); } };
    const sounds = new SoundManager(() => context as unknown as AudioContext);
    sounds.unlock();
    assert.deepEqual(loaded.map(url => url.split('/').pop()), ['bat-impact.wav', 'stumps.wav', 'crowd-cheer.wav']);
    sounds.play('bat');
    sounds.play('boundary');
    assert.equal(played, 2);
    sounds.setMuted(true);
    assert.equal(paused, 2);
    sounds.play('wicket');
    assert.equal(played, 2);
  } finally {
    Object.assign(globalThis, { Audio: originalAudio, document: originalDocument });
    if (previousMute === undefined) storage.delete('hardhit_sound_muted'); else storage.set('hardhit_sound_muted', previousMute);
  }
});

test('gameplay pauses when hidden or in portrait, and resumes only when both clear', () => {
  assert.equal(shouldPauseGameplay(true, false, false), false);
  assert.equal(shouldPauseGameplay(true, true, false), true);
  assert.equal(shouldPauseGameplay(true, false, true), true);
  assert.equal(shouldPauseGameplay(true, true, true), true);
  assert.equal(shouldPauseGameplay(false, true, true), false);
});

test('pause freezes gameplay time and scheduled deliveries', () => {
  const originalPerformance = globalThis.performance;
  const originalWindow = globalThis.window;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 1000;
  let next = 0;
  const queue = new Map<number, () => void>();
  Object.assign(globalThis, {
    performance: { now: () => now },
    window: { setTimeout: (fn: () => void) => { const id = ++next; queue.set(id, fn); return id; } },
    clearTimeout: (id: number) => queue.delete(id)
  });
  const tick = () => { const [id, fn] = queue.entries().next().value!; queue.delete(id); fn(); };
  try {
    let delivered = false;
    const initialRevision = gameClockRevision();
    const start = gameNow();
    setGameTimeout(() => { delivered = true; }, 200);
    now += 100;
    tick();
    setGamePaused(true);
    assert.equal(isGamePaused(), true);
    assert.equal(gameClockRevision(), initialRevision + 1);
    setGamePaused(true);
    assert.equal(gameClockRevision(), initialRevision + 1, 'repeated pause should not invalidate frames again');
    now += 10000;
    tick();
    assert.equal(gameNow() - start, 100);
    assert.equal(delivered, false);
    setGamePaused(false);
    assert.equal(gameClockRevision(), initialRevision + 2);
    now += 100;
    tick();
    assert.equal(delivered, true);
    const cancelled = setGameTimeout(() => { throw new Error('cancelled timer fired'); }, 100);
    clearGameTimeout(cancelled);
    assert.equal(queue.size, 0);
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { performance: originalPerformance, window: originalWindow, clearTimeout: originalClearTimeout });
  }
});

test('returning to the lobby cancels a pending bot delivery and run-up', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalClearTimeout = globalThis.clearTimeout;
  const queue = new Map<number, () => void>();
  let next = 0;
  let runUpCancelled = 0;
  Object.assign(globalThis, {
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: { setTimeout: (fn: () => void) => { const id = ++next; queue.set(id, fn); return id; } },
    clearTimeout: (id: number) => queue.delete(id)
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.deliveryGeneration = 3;
    ui.cancelBattingRunUp = () => { runUpCancelled++; };
    ui.botDeliveryTimer = setGameTimeout(() => { throw new Error('delivery survived lobby return'); }, 1500);
    ui.gameScene = { setCameraMode() {} };
    ui.refreshLobbyView = () => {};
    ui.handleReturnToLobby();
    assert.equal(runUpCancelled, 1);
    assert.equal(ui.deliveryGeneration, 4);
    assert.equal(ui.botDeliveryTimer, null);
    assert.equal(queue.size, 0);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, clearTimeout: originalClearTimeout });
  }
});

test('cancelled batting callbacks cannot observe or resolve a later delivery', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalClearTimeout = globalThis.clearTimeout;
  const oldRunUp = globalAutoAssistConfig.isRunUpActive;
  const oldStart = globalAutoAssistConfig.runUpStartTime;
  const oldActive = globalAutoAssistConfig.isDeliveryActive;
  const frames: Array<() => void> = [];
  let arrived: () => void = () => {};
  let resolved: () => void = () => {};
  let arrivals = 0;
  Object.assign(globalThis, {
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} }
    },
    window: { setTimeout: () => 1 },
    clearTimeout: () => {},
    requestAnimationFrame: (fn: () => void) => { frames.push(fn); return frames.length; }
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.activeDelivery = delivery(0.5);
    ui.deliveryGeneration = 1;
    ui.deliveryStarted = false;
    ui.botDeliveryTimer = null;
    ui.cancelBattingRunUp = null;
    ui.hideResultToast = () => {};
    ui.showBattingHelper = () => {};
    ui.handleBallArrivalAtStumps = () => { arrivals++; };
    ui.controller = {
      state: { player: { id: 'player' }, bot: { rank: 'Gold' } },
      getCurrentInnings: () => ({ batter: { id: 'player' } }),
      setCameraMode() {}
    };
    ui.gameScene = {
      prepareDeliverySound() {}, setCameraMode() {},
      scene: { getMeshByName: () => null },
      setDeliveryCallbacks: (a: () => void, r: () => void) => { arrived = a; resolved = r; }
    };
    ui.deliverBall3D();
    assert.equal(frames.length, 1);
    const previousFrame = frames.shift()!;
    ui.cancelPendingDelivery();
    ui.isBallActive = true;
    ui.activeDelivery = delivery(0.5);
    globalAutoAssistConfig.isDeliveryActive = false;
    previousFrame();
    arrived();
    resolved();
    assert.equal(frames.length, 0);
    assert.equal(arrivals, 0);
  } finally {
    globalAutoAssistConfig.isRunUpActive = oldRunUp;
    globalAutoAssistConfig.runUpStartTime = oldStart;
    globalAutoAssistConfig.isDeliveryActive = oldActive;
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, requestAnimationFrame: originalRaf, clearTimeout: originalClearTimeout });
  }
});

test('showing the same match summary twice records one leaderboard entry', () => {
  const key = 'six_hitting_contest_leaderboard';
  const previous = storage.get(key);
  const originalDocument = globalThis.document;
  storage.delete(key);
  Object.assign(globalThis, { document: { getElementById: () => null } });
  try {
    const game = match();
    game.state.status = 'completed';
    game.state.winnerId = game.state.player.id;
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.recordedSummary = null;
    ui.hideResultToast = () => {};
    ui.keyboardInputManager = { closeHelpModal() {} };
    ui.showGameOverScreen();
    ui.showGameOverScreen();
    assert.equal(readLeaderboard().length, 1);

    game.reset();
    game.setTossResult(game.state.player.id, 'bat');
    game.startMatch();
    game.state.status = 'completed';
    game.state.winnerId = game.state.bot.id;
    ui.showGameOverScreen();
    assert.equal(readLeaderboard().length, 2);
  } finally {
    if (previous === undefined) storage.delete(key); else storage.set(key, previous);
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('touch stick maps eight directions and ignores its dead zone', () => {
  assert.equal(directionFromStick(0, 0), null);
  assert.equal(directionFromStick(0.1, 0.1), null);
  assert.deepEqual([[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]].map(([x,y]) => directionFromStick(x,y)), [0,1,2,3,4,5,6,7]);
});

test('batter movement stays within its bounds and can be reset', () => {
  assert.deepEqual(moveBatter({ x: 0, z: 0 }, 5, 5), { x: 0.6, z: 0.8 });
  assert.deepEqual(moveBatter({ x: 0, z: 0 }, -5, -5), { x: -0.6, z: -0.3 });
  assert.deepEqual(moveBatter({ x: 0.2, z: 0.2 }, -0.2, -0.2), { x: 0, z: 0 });
});

test('batter stance changes contact timing and reach without manufacturing wides', () => {
  const central = delivery(0.5);
  const forward = { ...central, batterPosition: { x: 0, z: 0.8 } };
  const back = { ...central, batterPosition: { x: 0, z: -0.3 } };
  assert.ok(batterContactProgress(forward) < batterContactProgress(central));
  assert.ok(batterContactProgress(back) > batterContactProgress(central));
  const outside = { ...delivery(0.5, 0.7), batterPosition: { x: -0.6, z: 0 } };
  assert.equal(checkExtraBall(outside).isExtra, false);
  const movedIntoLine = { ...delivery(0.5, 1.1), batterPosition: { x: 0.4, z: 0 } };
  assert.equal(checkExtraBall(movedIntoLine).isExtra, false);
  const game = match();
  const shot = { direction: 0, type: 'power' as const, timing: 0.5, contactZone: 0.5 };
  assert.equal(game.recordBall(outside, shot).missed, true);
});

test('a second finger can strike while the aiming finger remains held', () => {
  const stickEvents: Record<string, (event: any) => void> = {};
  const shotEvents: Record<string, (event: any) => void> = {};
  const stick = {
    querySelector: () => ({ style: {} }),
    addEventListener: (name: string, fn: (event: any) => void) => { stickEvents[name] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { setProperty: () => {} },
    setPointerCapture: () => {}, setAttribute: () => {}
  };
  const button = { dataset: { shot: 'lofted' }, addEventListener: (name: string, fn: (event: any) => void) => { shotEvents[name] = fn; } };
  const shots: Array<[number, string]> = [];
  const controls = new TouchBattingControls(stick as unknown as HTMLElement, [button] as unknown as NodeListOf<HTMLButtonElement>, (direction, type) => shots.push([direction, type]));
  stickEvents.pointerdown({ pointerId: 1, clientX: 100, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 2, preventDefault() {} });
  assert.deepEqual(shots, [[2, 'lofted']]);
  stickEvents.pointerup({ pointerId: 1 });
  shotEvents.pointerdown({ pointerId: 3, preventDefault() {} });
  assert.deepEqual(shots[1], [2, 'lofted']);
  controls.setLocked(true);
  stickEvents.pointerdown({ pointerId: 4, clientX: 0, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 5, preventDefault() {} });
  assert.deepEqual(shots[2], [2, 'lofted']);
  controls.setLocked(false);
  stickEvents.pointerdown({ pointerId: 6, clientX: 0, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 7, preventDefault() {} });
  assert.deepEqual(shots[3], [6, 'lofted']);
  shotEvents.click({ detail: 1, preventDefault() {} });
  assert.equal(shots.length, 4);
  shotEvents.click({ detail: 0, preventDefault() {} });
  assert.deepEqual(shots[4], [6, 'lofted']);
  controls.setDirection(2);
  shotEvents.pointerdown({ pointerId: 8, preventDefault() {} });
  assert.deepEqual(shots[5], [2, 'lofted'], 'menu aim must also apply to touch shots');
  controls.setDirection(99);
  shotEvents.pointerdown({ pointerId: 9, preventDefault() {} });
  assert.deepEqual(shots[6], [2, 'lofted'], 'invalid direction must not overwrite aim');
});

test('shot guide follows the delivered line including movement', () => {
  assert.equal(suggestedShotDirection(delivery(0.5)), 0);
  assert.equal(suggestedShotDirection(delivery(0.5, 0.5)), 1);
  assert.equal(suggestedShotDirection(delivery(0.5, -0.5)), 7);
  assert.equal(suggestedShotDirection({ ...delivery(0.5), type: 'offspin', turn: 1 }), 7);
});

function match(): MatchController {
  storage.clear();
  const controller = new MatchController('Medium');
  controller.setTossResult(controller.state.player.id, 'bowl');
  controller.startMatch();
  return controller;
}

test('new player defaults are not changed by a previous player profile', () => {
  storage.clear();
  const first = getOrCreatePlayer();
  first.stats.batting.power = 99;
  first.stats.bowling.accuracy = 99;
  storage.clear();
  const second = getOrCreatePlayer();
  assert.equal(second.stats.batting.power, 50);
  assert.equal(second.stats.bowling.accuracy, 50);
});

test('partially saved profiles retain progress while missing stats get defaults', () => {
  storage.clear();
  storage.set('six_hitting_contest_player', JSON.stringify({ xp: 120, rank: 'Silver', stats: { batting: { power: 72 } } }));
  const player = getOrCreatePlayer();
  assert.equal(player.xp, 120);
  assert.equal(player.rank, 'Silver');
  assert.equal(player.stats.batting.power, 72);
  assert.equal(player.stats.bowling.accuracy, 50);
});

test('a match can start when browser storage is unavailable', () => {
  const originalStorage = globalThis.localStorage;
  Object.assign(globalThis, { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  try {
    const game = new MatchController('Medium');
    game.setTossResult(game.state.player.id, 'bat');
    game.startMatch();
    assert.equal(game.state.status, 'playing');
  } finally {
    Object.assign(globalThis, { localStorage: originalStorage });
  }
});

test('leaderboard tolerates corrupt storage and sorts old and new scores', () => {
  storage.clear();
  storage.set('six_hitting_contest_leaderboard', '{bad json');
  assert.deepEqual(readLeaderboard(), []);
  storage.set('six_hitting_contest_leaderboard', JSON.stringify([
    { opponent: 'Bot', biggestSix: '75.5', wicketsLost: '2', outcome: 'won' },
    { opponent: 'Bot', biggestSix: '75.5', wicketsLost: '1', outcome: 'lost' },
    null
  ]));
  addLeaderboardEntry({ date: '', opponent: 'Bot', biggestSix: 80, wicketsLost: 3, outcome: 'WON' });
  assert.deepEqual(readLeaderboard().map(entry => [entry.biggestSix, entry.wicketsLost]), [[80, 3], [75.5, 1], [75.5, 2]]);
});

test('front-foot landing and line distinguish legal balls, wides and no-balls', () => {
  assert.deepEqual(checkExtraBall(delivery(0.5)), { isExtra: false, type: null });
  assert.equal(checkExtraBall(delivery(0)).isExtra, false);
  assert.equal(checkExtraBall(delivery(1)).isExtra, false);
  assert.equal(checkExtraBall({ ...delivery(0.5), frontFootHeel: 0 }).type, 'noball');
  assert.equal(checkExtraBall(delivery(0.5, 1)).type, 'wide');
});

test('front-foot landing is independent of release timing and captured for replay', () => {
  const heel = sampleFrontFootLanding(50, 1, 1);
  assert.ok(heel > 0);
  assert.ok(sampleFrontFootLanding(100, 0.5, 1) < 0);
  assert.equal(checkExtraBall({ ...delivery(0.1), frontFootHeel: heel }).type, 'noball');
  assert.equal(checkExtraBall({ ...delivery(0.9), frontFootHeel: heel }).type, 'noball');
  assert.equal(checkExtraBall({ ...delivery(1), frontFootHeel: -0.01 }).isExtra, false);
});

test('LBW considers pitch, impact, offered shot, stumps, handedness and no-balls', () => {
  const turning = { ...delivery(0.5, 0.35), type: 'offspin' as const, turn: 1 };
  assert.equal(resolveMissedDelivery(turning, 'RHB', true), 'lbw');
  assert.equal(resolveMissedDelivery({ ...turning, batterPosition: { x: 0.6, z: 0 } }, 'RHB', true), 'bowled');
  assert.equal(resolveMissedDelivery({ ...turning, frontFootHeel: 0.01 }, 'RHB', true), null);
  const outsideLeg = { ...delivery(0.5, -0.25), type: 'legspin' as const, turn: 1 };
  assert.equal(resolveMissedDelivery(outsideLeg, 'RHB', true), null);
  const outsideOff = { ...turning, aimTarget: { x: 0.54, z: -3.5 } };
  assert.equal(resolveMissedDelivery(outsideOff, 'RHB', true), null);
  assert.equal(resolveMissedDelivery(outsideOff, 'RHB', false), 'lbw');
  const leftOutsideOff = { ...outsideOff, aimTarget: { x: -0.54, z: -3.5 }, type: 'legspin' as const };
  assert.equal(resolveMissedDelivery(leftOutsideOff, 'LHB', true), null);
  assert.equal(resolveMissedDelivery(leftOutsideOff, 'LHB', false), 'lbw');
  assert.equal(resolveMissedDelivery(delivery(0.5, 0.7), 'RHB', false), null);
});

test('bowled decisions project past the popping crease to the rendered stumps', () => {
  const intoWicket: DeliveryChoice = { ...delivery(0.5, 0.268), overTheWicket: true, bowlingArm: 'Right', batterPosition: { x: 0.6, z: 0 } };
  const awayFromWicket: DeliveryChoice = { ...delivery(0.5, -0.047), overTheWicket: false, bowlingArm: 'Right', batterPosition: { x: -0.6, z: 0 } };
  const progress = deliveryProgressAtZ(intoWicket, BATTER_STUMPS_Z);
  const edge = WICKET_WIDTH_METERS / 2 + BALL_RADIUS_METERS;
  const creaseIn = sampleDeliveryPath(intoWicket, 1);
  const stumpsIn = sampleDeliveryPath(intoWicket, progress);
  assert.ok(Math.abs(creaseIn.x) > edge);
  assert.ok(Math.abs(stumpsIn.x) < edge);
  assert.ok(Math.abs(stumpsIn.z - BATTER_STUMPS_Z) < 1e-9);
  assert.equal(resolveMissedDelivery(intoWicket, 'RHB', true), 'bowled');
  const creaseAway = sampleDeliveryPath(awayFromWicket, 1);
  const stumpsAway = sampleDeliveryPath(awayFromWicket, progress);
  assert.ok(Math.abs(creaseAway.x) < edge);
  assert.ok(Math.abs(stumpsAway.x) > edge);
  assert.equal(resolveMissedDelivery(awayFromWicket, 'RHB', true), null);
  const mirrored: DeliveryChoice = { ...intoWicket, aimTarget: { x: -0.268, z: -3.5 }, bowlingArm: 'Left', batterPosition: { x: -0.6, z: 0 } };
  const mirroredStumps = sampleDeliveryPath(mirrored, progress);
  assert.ok(Math.abs(mirroredStumps.x + stumpsIn.x) < 1e-9);
  assert.equal(resolveMissedDelivery(mirrored, 'LHB', true), 'bowled');
  assert.equal(resolveMissedDelivery({ ...mirrored, frontFootHeel: 0.01 }, 'LHB', true), null);
});

test('a bowled ball continues along the projected path to the stumps', () => {
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = 1000;
  Object.assign(globalThis, {
    window: { setTimeout: () => 1 },
    performance: { now: () => now }
  });
  try {
    const choice: DeliveryChoice = { ...delivery(0.5, 0.268), overTheWicket: true, bowlingArm: 'Right' };
    const start = sampleDeliveryPath(choice, 1);
    let enabled = false;
    const ball = { position: new Vector3(start.x, start.y, start.z), setEnabled: (value: boolean) => { enabled = value; } };
    const scene = Object.create(GameScene.prototype) as any;
    scene.ballMesh = ball;
    scene.ballTrail = null;
    scene.batterRoot = null;
    scene.onBallResolvedCallback = null;
    scene.animateMissWicket(true, choice);
    assert.equal(enabled, true);
    now += 1000;
    scene.updateMissedAnimation();
    const end = sampleDeliveryPath(choice, deliveryProgressAtZ(choice, BATTER_STUMPS_Z));
    assert.ok(Math.abs(ball.position.x - end.x) < 1e-9);
    assert.ok(Math.abs(ball.position.z - BATTER_STUMPS_Z) < 1e-9);
    assert.equal(enabled, false);
    assert.equal(scene.updateMissedAnimation, null);
  } finally {
    Object.assign(globalThis, { window: originalWindow, performance: originalPerformance });
  }
});

test('pad interception uses the same stance and delivered line as wicket decisions', () => {
  const turning = { ...delivery(0.5, 0.35), type: 'offspin' as const, turn: 1 };
  assert.equal(deliveryHitsPad(turning), true);
  assert.equal(resolveMissedDelivery(turning, 'RHB', true), 'lbw');
  const moved = { ...turning, batterPosition: { x: 0.6, z: 0 } };
  assert.equal(deliveryHitsPad(moved), false);
  assert.equal(resolveMissedDelivery(moved, 'RHB', true), 'bowled');
});

test('missed deliveries continue only when the modeled pad does not intercept them', () => {
  const padBall = { ...delivery(0.5, 0.35), type: 'offspin' as const, turn: 1 };
  const clearBall = { ...padBall, batterPosition: { x: 0.6, z: 0 } };
  const ui = Object.create(UIManager.prototype) as any;
  let continuation: DeliveryChoice | undefined;
  ui.updateHUD = () => {};
  ui.showResultToast = () => {};
  ui.gameScene = { animateMissWicket: (_wicket: boolean, choice?: DeliveryChoice) => { continuation = choice; } };
  for (const choice of [padBall, clearBall]) {
    ui.activeDelivery = choice;
    ui.activeShot = null;
    ui.controller = { recordBall: () => ({ delivery: choice, shot: null, missed: true, isWicket: false, isExtra: false, wicketReason: '', extraType: null }) };
    ui.handleBallArrivalAtStumps();
    assert.equal(continuation, choice === clearBall ? choice : undefined);
  }
});

test('a mistimed stroke that misses the stumps is a dot, not an invented catch', () => {
  const game = match();
  const result = game.recordBall(delivery(0.5, 0.7), { direction: 0, type: 'power', timing: 0, contactZone: 0.5 });
  assert.equal(result.missed, true);
  assert.equal(result.isWicket, false);
  assert.equal(game.getCurrentInnings().wicketsLost, 0);
});

test('bowling meter maps its midpoint to ideal release and clamps extremes', () => {
  assert.equal(bowlingReleaseTiming(-100), 0);
  assert.equal(bowlingReleaseTiming(1200), 0.5);
  assert.equal(bowlingReleaseTiming(3000), 1);
});

test('bowling release timing affects the executed target in a predictable way', () => {
  const target = { x: 0, z: -3.5 };
  assert.deepEqual(bowlingExecutionTarget(target, 0.5, 50), target);
  assert.notDeepEqual(bowlingExecutionTarget(target, 0, 100), target);
  assert.ok(Math.abs(bowlingExecutionTarget(target, 0, 100).z - target.z) < Math.abs(bowlingExecutionTarget(target, 0, 0).z - target.z));
  const early = bowlingExecutionTarget(target, 0.2, 50);
  const late = bowlingExecutionTarget(target, 0.8, 50);
  assert.ok(early.x < 0 && late.x > 0);
  assert.ok(early.z > target.z && late.z < target.z);
});

test('keyboard bowling starts at good length and updates the aim marker', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const listeners: Record<string, (event: any) => void> = {};
  const positions: Array<[number, number]> = [];
  Object.assign(globalThis, {
    window: {
      addEventListener: (name: string, listener: (event: any) => void) => { listeners[name] = listener; },
      removeEventListener: () => {}
    },
    document: {
      getElementById: (id: string) => id === 'screen-gameplay' ? { classList: { contains: () => true } } : null,
      querySelectorAll: () => []
    }
  });
  try {
    const input = new KeyboardInputManager(() => false, () => {}, () => {}, () => {}, () => 'RHB', (x, z) => positions.push([x, z]));
    assert.equal(input.intent.aimZ, -3.5);
    assert.equal(input.getBowlingLineLabel(0), 'Off Side');
    assert.equal(input.getBowlingLineLabel(2), 'Leg Side');
    listeners.keydown({ key: 'ArrowLeft', code: 'ArrowLeft', target: { tagName: 'INPUT' } });
    listeners.keydown({ key: '4', code: 'Digit4', target: { tagName: 'INPUT' } });
    assert.deepEqual(positions, []);
    assert.equal(input.intent.deliveryType, 'fast');
    listeners.keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    listeners.keydown({ key: 'ArrowUp', code: 'ArrowUp' });
    assert.deepEqual(positions, [[0.8, -3.5], [0.8, -5.5]]);
    input.setBowlingAim(-0.8, 0.5);
    listeners.keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    assert.deepEqual(positions[2], [0, 0.5]);
    input.destroy();
  } finally {
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test('interrupted keyboard holds clear without releasing a delivery', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const listeners: Record<string, (event: any) => void> = {};
  let starts = 0;
  let releases = 0;
  let active = true;
  Object.assign(globalThis, {
    window: { addEventListener: (name: string, fn: (event: any) => void) => { listeners[name] = fn; }, removeEventListener() {} },
    document: {
      getElementById: (id: string) => id === 'screen-gameplay' ? { classList: { contains: () => active } } : null,
      querySelectorAll: () => []
    }
  });
  try {
    const input = new KeyboardInputManager(() => false, () => { starts++; }, () => { releases++; }, () => {}, () => 'RHB', () => {});
    const space = { key: ' ', code: 'Space' };
    listeners.keydown(space);
    assert.equal(starts, 1);
    setGamePaused(true);
    input.cancelHeldInputs();
    listeners.keyup(space);
    setGamePaused(false);
    listeners.keyup(space);
    assert.equal(releases, 0);
    listeners.keydown(space);
    listeners.keyup(space);
    assert.equal(starts, 2);
    assert.equal(releases, 1);
    listeners.keydown(space);
    active = false;
    listeners.keyup(space);
    assert.equal(releases, 1);
    active = true;
    const soundButton = { tagName: 'BUTTON', id: 'btn-sound-toggle', classList: { contains: () => false } };
    listeners.keydown({ ...space, target: soundButton });
    listeners.keyup({ ...space, target: soundButton });
    assert.equal(starts, 3);
    const bowlButton = { tagName: 'BUTTON', id: 'btn-bowl-pitch', classList: { contains: () => false } };
    listeners.keydown({ key: 'Enter', code: 'Enter', target: bowlButton });
    listeners.keyup({ key: 'Enter', code: 'Enter', target: { tagName: 'BODY' } });
    assert.equal(starts, 4);
    assert.equal(releases, 2);
    input.destroy();
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test('focused shot buttons do not also trigger the global batting shortcut', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const oldActive = globalAutoAssistConfig.isDeliveryActive;
  const listeners: Record<string, (event: any) => void> = {};
  let swings = 0;
  Object.assign(globalThis, {
    window: { addEventListener: (name: string, fn: (event: any) => void) => { listeners[name] = fn; }, removeEventListener() {} },
    document: { getElementById: (id: string) => id === 'screen-gameplay' ? { classList: { contains: () => true } } : null, querySelectorAll: () => [] }
  });
  try {
    globalAutoAssistConfig.isDeliveryActive = true;
    const input = new KeyboardInputManager(() => true, () => {}, () => {}, () => { swings++; }, () => 'RHB', () => {});
    const target = { tagName: 'BUTTON', classList: { contains: (name: string) => name === 'touch-shot' } };
    listeners.keydown({ key: ' ', code: 'Space', target });
    listeners.keyup({ key: ' ', code: 'Space', target });
    assert.equal(swings, 0);
    const batButton = { tagName: 'BUTTON', id: 'btn-bat-swing', classList: { contains: () => false } };
    listeners.keydown({ key: 'Enter', code: 'Enter', target: batButton });
    listeners.keyup({ key: 'Enter', code: 'Enter', target: batButton });
    assert.equal(swings, 1);
    input.destroy();
  } finally {
    globalAutoAssistConfig.isDeliveryActive = oldActive;
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test('interrupting a bowling run-up restores controls without delivering', () => {
  const originalDocument = globalThis.document;
  const previousRunUp = globalAutoAssistConfig.isRunUpActive;
  const previousStart = globalAutoAssistConfig.runUpStartTime;
  let removed = 0;
  let controlsRestored = 0;
  let keysCleared = 0;
  let touchCleared = 0;
  let bowlerReset = 0;
  let restoredSide: unknown[] = [];
  Object.assign(globalThis, { document: { getElementById: (id: string) => {
    if (id === 'bowler-runup-indicator') return { remove: () => { removed++; } };
    if (id === 'control-bowling') return { classList: { remove: () => { controlsRestored++; } } };
    return null;
  } } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.keyboardInputManager = { cancelHeldInputs: () => { keysCleared++; } };
    ui.touchBattingControls = { cancelPointer: () => { touchCleared++; } };
    ui.gameScene = { resetBowlerMesh: () => { bowlerReset++; }, setBowlerSide: (...args: unknown[]) => { restoredSide = args; } };
    ui.controller = { getCurrentInnings: () => ({ bowler: { bowlingArm: 'Left' } }) };
    ui.overTheWicket = false;
    ui.userBowlingInProgress = true;
    ui.isBallActive = true;
    ui.bowlingPointerId = 12;
    globalAutoAssistConfig.isRunUpActive = true;
    globalAutoAssistConfig.runUpStartTime = 123;
    ui.interruptControls();
    assert.equal(ui.isBallActive, false);
    assert.equal(ui.userBowlingInProgress, false);
    assert.equal(ui.bowlingPointerId, null);
    assert.equal(globalAutoAssistConfig.isRunUpActive, false);
    assert.equal(globalAutoAssistConfig.runUpStartTime, undefined);
    assert.deepEqual([removed, controlsRestored, keysCleared, touchCleared, bowlerReset], [1, 1, 1, 1, 1]);
    assert.deepEqual(restoredSide, [false, 'Left']);
    ui.endUserBowlingDelivery();
    assert.equal(ui.isBallActive, false);
  } finally {
    globalAutoAssistConfig.isRunUpActive = previousRunUp;
    globalAutoAssistConfig.runUpStartTime = previousStart;
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('each turn applies the active batter handedness to the scene', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bowl');
  game.startMatch();
  game.getCurrentInnings().batter.batterHand = 'LHB';
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: () => null } });
  try {
    const seen: string[] = [];
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.deliveryGeneration = 0;
    ui.cancelBattingRunUp = null;
    ui.botDeliveryTimer = null;
    ui.gameScene = {
      setBatterHandedness: (hand: string) => seen.push(hand),
      setPlayerCreaseOffset() {}, setBowlerSide() {}, setCameraMode() {}
    };
    ui.keyboardInputManager = { updateFeedbackOverlay() {} };
    ui.updateHUD = () => {};
    ui.setupActiveTurn();
    assert.deepEqual(seen, ['LHB']);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('bowler camera screen directions map to the correct pitch coordinates', () => {
  assert.ok(bowlingTargetFromScreen(0, 0.5).x > 0);
  assert.ok(bowlingTargetFromScreen(1, 0.5).x < 0);
  assert.ok(bowlingTargetFromScreen(0.5, 0).z < bowlingTargetFromScreen(0.5, 1).z);
  assert.deepEqual(bowlingTargetFromScreen(0.5, 0), { x: 0, z: -8.2 });
  assert.ok(Math.abs(bowlingTargetFromScreen(0.5, 1).z - 0.5) < 1e-9);
  assert.equal(calculateBounceTarget('off', 'good', 'RHB').x, 0.45);
  assert.equal(calculateBounceTarget('off', 'good', 'LHB').x, -0.45);
  assert.equal(getLineTypeFromAimX(0.45, 'RHB'), 'off');
  assert.equal(getLineTypeFromAimX(-0.45, 'LHB'), 'off');
});

test('bot off-side deliveries use the batter handedness', () => {
  const random = Math.random;
  const bowler = createBotPlayer('Medium');
  bowler.stats.bowling.accuracy = 100;
  Math.random = () => 0.1;
  try {
    const rightHander = botChooseDelivery(bowler, 'Rookie', 'RHB');
    const leftHander = botChooseDelivery(bowler, 'Rookie', 'LHB');
    assert.equal(rightHander.line, 'off');
    assert.equal(leftHander.line, 'off');
    assert.ok(rightHander.aimTarget.x > 0);
    assert.ok(leftHander.aimTarget.x < 0);
  } finally {
    Math.random = random;
  }
});

test('well-timed shots retain their selected direction on every bot tier', () => {
  for (const tier of ['Rookie', 'Medium', 'Hard'] as const) {
    for (let direction = 0; direction < 8; direction++) {
      for (const type of ['defensive', 'grounded', 'lofted', 'power'] as ShotType[]) {
        const game = new MatchController(tier);
        game.setTossResult(game.state.player.id, 'bat');
        game.startMatch();
        const shot = { direction, type, timing: 0.5, contactZone: 0.5 };
        const ball = delivery(0.5);
        assert.equal(evaluateWicket(game.state.player, game.state.bot, ball, shot).isWicket, false);
        const outcome = game.recordBall(ball, shot);
        assert.equal(outcome.shot?.direction, direction);
        assert.equal(outcome.isWicket, false);
      }
    }
  }
});

test('extras do not consume a legal ball and only no-balls start a free hit', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0, 1), null);
  assert.equal(innings.ballsBowled, 0);
  assert.equal(innings.score, 1);
  assert.equal(innings.isNextFreeHit, false);
  game.recordBall({ ...delivery(1), frontFootHeel: 0.01 }, null);
  assert.equal(innings.isNextFreeHit, true);
  game.recordBall(delivery(0, 1), null);
  assert.equal(innings.isNextFreeHit, true);
  const legal = game.recordBall(delivery(0.5), null);
  assert.equal(legal.isFreeHit, true);
  assert.equal(innings.isNextFreeHit, false);
  assert.equal(innings.ballsBowled, 1);
  assert.equal(innings.score, 3);
});

test('no-ball overrides wide and free-hit protection survives further extras', () => {
  const game = new MatchController('Hard');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const noBallWideLine = { ...delivery(0.5, 1.4), frontFootHeel: 0.01 };
  const first = game.recordBall(noBallWideLine, null);
  assert.equal(first.extraType, 'noball');
  assert.equal(first.isWicket, false);
  const wide = game.recordBall(delivery(0.5, 1.4), null);
  assert.equal(wide.extraType, 'wide');
  assert.equal(wide.isFreeHit, true);
  const anotherNoBall = game.recordBall({ ...delivery(0.5), frontFootHeel: 0.01 }, null);
  assert.equal(anotherNoBall.extraType, 'noball');
  assert.equal(anotherNoBall.isFreeHit, true);
  const missedShot = { direction: 0, type: 'power' as const, timing: 0, contactZone: 0.5 };
  const protectedBall = game.recordBall(delivery(0.5), missedShot);
  assert.equal(protectedBall.isFreeHit, true);
  assert.equal(protectedBall.isWicket, false);
  const next = game.recordBall(delivery(0.5), missedShot);
  assert.equal(next.isFreeHit, false);
  assert.equal(next.isWicket, true);
  assert.equal(game.getCurrentInnings().ballsBowled, 2);
  assert.equal(game.getCurrentInnings().score, 3);
});

test('the over display keeps upcoming legal balls after extras and shows the sudden-death limit', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  const originalDocument = globalThis.document;
  const count = { innerText: '' };
  const children: any[] = [];
  const tracker = {
    children,
    appendChild: (child: any) => { children.push(child); },
    removeChild: () => { children.pop(); },
    querySelectorAll: () => children,
    get lastChild() { return children[children.length - 1]; }
  };
  Object.assign(globalThis, { document: {
    getElementById: (id: string) => id === 'hud-balls-count' ? count : id === 'over-tracker' ? tracker : null,
    createElement: () => ({ className: '', textContent: '', title: '' })
  } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    game.recordBall(delivery(0, 1), null);
    ui.updateHUD();
    assert.equal(count.innerText, '0/6');
    assert.equal(children.length, 7);
    assert.equal(children[0].textContent, 'WD');
    assert.match(children[0].title, /^Ball 1:/);
    assert.equal(children[1].textContent, '1');
    assert.equal(children[6].textContent, '6');
    assert.match(children[6].title, /Upcoming/);

    game.recordBall({ ...delivery(0.5), frontFootHeel: 0.01 }, null);
    game.recordBall(delivery(0.5), null);
    ui.updateHUD();
    assert.match(children[1].title, /^Ball 1: No-ball/);
    assert.match(children[2].title, /^Ball 1: Free Hit/);
    assert.match(children[2].className, /\blegal\b/);
    assert.doesNotMatch(children[2].className, /\bextra\b/);
    assert.equal(children[3].textContent, '2');

    innings.balls = [];
    innings.ballsBowled = 0;
    game.state.tieBreakerActive = true;
    game.recordBall(delivery(0, 1), null);
    ui.updateHUD();
    assert.equal(count.innerText, '0/1');
    assert.equal(children.length, 2);
    assert.match(children[1].title, /Upcoming/);
    game.recordBall(delivery(0.5), null);
    ui.updateHUD();
    assert.equal(count.innerText, '1/1');
    assert.equal(children.length, 2);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('summary tracker labels extras and free hits with their legal ball number', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const dots: any[] = [];
  const container = { innerHTML: '', appendChild: (dot: any) => dots.push(dot) };
  Object.assign(globalThis, { document: {
    getElementById: () => container,
    createElement: () => ({ className: '', textContent: '', title: '' })
  } });
  try {
    game.recordBall(delivery(0.5, 1), null);
    game.recordBall({ ...delivery(0.5), frontFootHeel: 0.01 }, null);
    game.recordBall(delivery(0.5), null);
    const ui = Object.create(UIManager.prototype) as any;
    ui.renderMiniTracker('tracker', game.getCurrentInnings().balls);
    assert.match(dots[0].title, /^Ball 1: Wide/);
    assert.match(dots[1].title, /^Ball 1: No-ball/);
    assert.match(dots[2].title, /^Ball 1: 0 runs \(free hit\)/);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('bat contact cancels a wide and counts the delivery as legal', () => {
  const game = match();
  const shot = { direction: 0, type: 'lofted' as const, timing: 0.5, contactZone: 0.5 };
  const result = game.recordBall(delivery(0.5, 1), shot);
  assert.equal(result.isExtra, false);
  assert.equal(result.missed, false);
  assert.equal(game.getCurrentInnings().ballsBowled, 1);
  assert.equal(game.finalizeBallOutcome(85, false, true), 6);
  assert.equal(game.getCurrentInnings().score, 6);
  const unreachable = game.recordBall(delivery(0.5, 1.4), shot);
  assert.equal(unreachable.extraType, 'wide');
  assert.equal(unreachable.missed, true);
  assert.equal(game.getCurrentInnings().ballsBowled, 1);
});

test('a hit off a no-ball scores as well as the penalty and preserves the free hit', () => {
  const game = match();
  const shot = { direction: 0, type: 'power' as const, timing: 0.5, contactZone: 0.5 };
  const result = game.recordBall({ ...delivery(1), frontFootHeel: 0.01 }, shot);
  const innings = game.getCurrentInnings();
  assert.equal(result.extraType, 'noball');
  assert.equal(result.missed, false);
  assert.equal(innings.ballsBowled, 0);
  assert.equal(innings.score, 1);
  assert.equal(game.finalizeBallOutcome(95, false, true), 6);
  assert.equal(innings.score, 7);
  assert.equal(innings.biggestSix, 95);
  assert.equal(innings.isNextFreeHit, true);
});

test('six legal deliveries finish the innings without counting extras', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0, 1), null);
  for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
  assert.equal(innings.ballsBowled, 6);
  assert.equal(innings.balls.length, 7);
  assert.equal(innings.finished, true);
});

test('dismissals do not cut a regular innings short', () => {
  const game = new MatchController('Hard');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const innings = game.getCurrentInnings();
  for (let i = 0; i < 6; i++) {
    const outcome = game.recordBall(delivery(0.5), { direction: 0, type: 'power', timing: 0, contactZone: 0.5 });
    assert.equal(outcome.isWicket, true);
    assert.equal(innings.finished, i === 5);
    assert.equal(innings.wicketsLost, i + 1);
  }
  assert.equal(innings.ballsBowled, 6);
});

test('shot trajectory follows all eight aim directions with finite speed', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const trajectory = (direction: number) => calculateShotTrajectory(
    1, 0.5, 0.5, direction * Math.PI / 4 - Math.PI / 2, zero, zero
  );
  const [straight, right, back, left] = [0, 2, 4, 6].map(trajectory);
  assert.ok(straight.z > 0 && Math.abs(straight.x) < 1e-10);
  assert.ok(right.x > 0 && Math.abs(right.z) < 1e-10);
  assert.ok(back.z < 0 && Math.abs(back.x) < 1e-10);
  assert.ok(left.x < 0 && Math.abs(left.z) < 1e-10);
  for (let direction = 0; direction < 8; direction++) {
    const velocity = trajectory(direction);
    const angle = direction * Math.PI / 4;
    const length = Math.hypot(velocity.x, velocity.z);
    assert.ok(Math.abs(velocity.x / length - Math.sin(angle)) < 1e-9);
    assert.ok(Math.abs(velocity.z / length - Math.cos(angle)) < 1e-9);
  }
  for (const velocity of [straight, right, back, left]) {
    assert.ok(Object.values(velocity).every(Number.isFinite));
    assert.ok(Math.hypot(velocity.x, velocity.y, velocity.z) <= 38.000001);
  }
});

test('shot quality affects exit speed without changing direction', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const clean = calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 4, zero, zero);
  const mistimed = calculateShotTrajectory(0, 0.5, 0.5, -Math.PI / 4, zero, zero);
  assert.ok(Math.hypot(clean.x, clean.y, clean.z) > Math.hypot(mistimed.x, mistimed.y, mistimed.z));
  assert.ok(Math.abs(clean.x / clean.z - mistimed.x / mistimed.z) < 1e-9);
});

test('incoming delivery speed and movement influence the resulting shot', () => {
  const fast = deliveryVelocityAtCrease({ ...delivery(0.5), pace: 1 });
  const slow = deliveryVelocityAtCrease({ ...delivery(0.5), type: 'slow' });
  const swinging = deliveryVelocityAtCrease({ ...delivery(0.5), swing: 1 });
  assert.ok(Math.abs(fast.z) > Math.abs(slow.z));
  assert.ok(swinging.x < 0);
  const shot = (incoming: typeof fast) => calculateShotTrajectory(0.6, 0.5, 0.5, -Math.PI / 2, incoming, { x: 0, y: 0, z: 0 });
  assert.notEqual(shot(fast).z, shot(slow).z);
  assert.ok(shot(swinging).x < shot({ ...swinging, x: 0 }).x);
});

test('footwork choice changes the timing window for short and full balls', () => {
  assert.ok(footworkFactor('front_foot', 'full') > footworkFactor('back_foot', 'full'));
  assert.ok(footworkFactor('back_foot', 'short') > footworkFactor('front_foot', 'short'));
  const game = match();
  const bowler = game.state.bot;
  const batter = game.state.player;
  const ball = { ...delivery(0.5), length: 'full' as const };
  const shot = { direction: 0, type: 'grounded' as const, timing: 0.5, contactZone: 0.5 };
  const front = evaluateWicket(batter, bowler, ball, { ...shot, footwork: 'front_foot' });
  const back = evaluateWicket(batter, bowler, ball, { ...shot, footwork: 'back_foot' });
  assert.ok(front.safeWindowMs > back.safeWindowMs);
});

test('batter power influences the ball exit speed', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const velocity = (power: number) => calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', 'power', power);
  const low = velocity(30);
  const high = velocity(80);
  assert.ok(Math.hypot(high.x, high.y, high.z) > Math.hypot(low.x, low.y, low.z));
});

test('ball drag produces the same damping over time at 30 and 60 fps', () => {
  const at30 = frameIndependentDamping(BALL_AIR_DAMPING, 1 / 30) ** 30;
  const at60 = frameIndependentDamping(BALL_AIR_DAMPING, 1 / 60) ** 60;
  assert.ok(Math.abs(at30 - at60) < 1e-12);
});

test('a well-hit lofted shot can clear the boundary before bouncing', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const velocity = calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', 'lofted');
  let y = 0.4;
  let z = BATTER_CREASE_Z;
  let bounced = false;
  for (let i = 0; i < 600 && z < 65 && !bounced; i++) {
    velocity.y *= BALL_AIR_DAMPING;
    velocity.z *= BALL_AIR_DAMPING;
    if (y < BALL_RADIUS_METERS) { bounced = true; break; }
    if (y > BALL_RADIUS_METERS) velocity.y -= 9.81 / 60;
    y += velocity.y / 60;
    z += velocity.z / 60;
  }
  assert.equal(bounced, false);
  assert.ok(z >= 65);
});

test('fixed-step shot physics resolves a lofted six and a grounded shot', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const simulate = (type: string): BallState => {
    const state: BallState = {
      position: { x: 0, y: 0.4, z: BATTER_CREASE_Z },
      velocity: calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', type),
      hasBounced: false, reachedBoundary: false, stopped: false
    };
    for (let i = 0; i < 2400 && !state.stopped && !state.reachedBoundary; i++) stepBall(state, 1 / 120);
    return state;
  };
  const loft = simulate('lofted');
  assert.equal(loft.reachedBoundary, true);
  assert.equal(loft.hasBounced, false);
  const ground = simulate('grounded');
  assert.equal(ground.hasBounced, true);
  assert.ok(ground.reachedBoundary || ground.stopped);
});

test('shot physics keeps pace at low frame rates while bounding long stalls', () => {
  const ball = (): BallState => ({ position: { x: 0, y: 100, z: 0 }, velocity: { x: 1, y: 0, z: 3 }, hasBounced: false, reachedBoundary: false, stopped: false });
  const simulate = (frames: number, elapsed: number) => {
    const state = ball();
    let accumulator = 0;
    for (let i = 0; i < frames; i++) accumulator = advanceBallFrame(state, accumulator, elapsed);
    return state;
  };
  const sixtyFps = simulate(60, 1 / 60);
  const tenFps = simulate(10, 0.1);
  assert.ok(Math.abs(sixtyFps.position.x - tenFps.position.x) < 1e-9);
  assert.ok(Math.abs(sixtyFps.position.y - tenFps.position.y) < 1e-9);
  assert.ok(Math.abs(sixtyFps.position.z - tenFps.position.z) < 1e-9);
  const stalled = simulate(1, 10);
  assert.ok(stalled.position.x > 0.2 && stalled.position.x < 0.3);
});

test('rope crossing and bounce are resolved in their actual order within a physics step', () => {
  const nearRope = (height: number): BallState => ({
    position: { x: 64.95, y: height, z: 0 },
    velocity: { x: 30, y: -4, z: 0 },
    hasBounced: false, reachedBoundary: false, stopped: false
  });
  const clearsRope = nearRope(BALL_RADIUS_METERS + 0.015);
  stepBall(clearsRope, 0.01);
  assert.equal(clearsRope.reachedBoundary, true);
  assert.equal(clearsRope.hasBounced, false);
  assert.equal(evaluateFinalOutcome(65, clearsRope.hasBounced, clearsRope.reachedBoundary), 6);

  const landsFirst = nearRope(BALL_RADIUS_METERS + 0.005);
  stepBall(landsFirst, 0.01);
  assert.equal(landsFirst.reachedBoundary, true);
  assert.equal(landsFirst.hasBounced, true);
  assert.equal(evaluateFinalOutcome(65, landsFirst.hasBounced, landsFirst.reachedBoundary), 4);
});

test('physical ground contact uses a regulation-sized ball radius', () => {
  const circumference = 2 * Math.PI * BALL_RADIUS_METERS;
  assert.ok(circumference >= 0.224 && circumference <= 0.229);
  const ball: BallState = { position: { x: 0, y: BALL_RADIUS_METERS + 0.01, z: 0 }, velocity: { x: 0, y: -1, z: 0 }, hasBounced: false, reachedBoundary: false, stopped: false };
  stepBall(ball, 0.02);
  assert.equal(ball.hasBounced, true);
  assert.equal(ball.position.y, BALL_RADIUS_METERS);
});

test('an upward shot from ground level that clears the rope is on the full', () => {
  const ball: BallState = {
    position: { x: 64.99, y: BALL_RADIUS_METERS, z: 0 },
    velocity: { x: 10, y: 5, z: 0 },
    hasBounced: false, reachedBoundary: false, stopped: false
  };
  stepBall(ball, 1 / 120);
  assert.equal(ball.reachedBoundary, true);
  assert.equal(ball.hasBounced, false);
  assert.equal(ball.boundaryOnFull, true);
});

test('a six remains in flight beyond the rope until its landing distance is known', () => {
  const ball: BallState = {
    position: { x: 0, y: 1, z: BATTER_CREASE_Z },
    velocity: { x: 0, y: 20, z: 31 },
    hasBounced: false, reachedBoundary: false, stopped: false
  };
  let ropeDistance = 0;
  for (let i = 0; i < 1200 && !ball.hasBounced; i++) {
    stepBall(ball, 1 / 120);
    if (ball.reachedBoundary && !ropeDistance) ropeDistance = ball.position.z - BATTER_CREASE_Z;
  }
  assert.equal(ball.boundaryOnFull, true);
  assert.equal(ball.reachedBoundary, true);
  assert.equal(ball.hasBounced, true);
  assert.ok(ball.position.z - BATTER_CREASE_Z > ropeDistance + 5);
});

test('delivery animation advances at the same speed at 30 and 60 fps', () => {
  const at30 = deliveryAnimationStep(1000 / 30, 1) * 30;
  const at60 = deliveryAnimationStep(1000 / 60, 1) * 60;
  assert.ok(Math.abs(at30 - at60) < 1e-9);
  assert.equal(deliveryAnimationStep(500, 1), 3);
});

test('delivery trajectory reaches the bounce point and the batter crease', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0.4, y: 0.06, z: -7.5 };
  const crease = { x: 0.4, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (crease.z - release.z);
  const atBounce = getParabolicFlightPosition(bounceProgress, release, bounce, crease);
  const atCrease = getParabolicFlightPosition(1, release, bounce, crease);
  assert.ok(Math.abs(atBounce.z - bounce.z) < 1e-9);
  assert.ok(Math.abs(atBounce.y - bounce.y) < 1e-9);
  assert.ok(Math.abs(atCrease.x - crease.x) < 1e-9);
  assert.ok(Math.abs(atCrease.y - crease.y) < 1e-9);
  assert.ok(Math.abs(atCrease.z - crease.z) < 1e-9);
});

test('delivery variations affect pace and turn only after pitching', () => {
  assert.ok(deliveryDurationMs('fast') < deliveryDurationMs('slow'));
  assert.ok(deliveryDurationMs('fast', 1) < deliveryDurationMs('fast', 0));
  assert.ok(deliveryDurationMs('offspin', 1) < deliveryDurationMs('offspin', 0));
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (end.z - release.z);
  assert.ok(Math.abs(getDeliveryFlightPosition(bounceProgress, release, bounce, end, 'offspin').x) < 1e-9);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'offspin').x < 0);
  assert.equal(getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 0).x, 0);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 1).x < getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 0.5).x);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'legspin').x > 0);
  assert.equal(getDeliveryFlightPosition(1, release, bounce, end, 'fast').x, 0);
  const spinner = { ...delivery(0.5, -0.8), type: 'offspin' as const };
  assert.equal(checkExtraBall(spinner).type, 'wide');
  assert.equal(checkExtraBall({ ...spinner, turn: 0 }).isExtra, false);
});

test('pace swing develops in the air and spin turn only after the bounce', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (end.z - release.z);
  const left = deliverySwingAtBounce('fast', -1, bounce.z);
  const right = deliverySwingAtBounce('fast', 1, bounce.z);
  assert.ok(left > 0 && right < 0);
  assert.equal(left, -right);
  assert.equal(getDeliveryFlightPosition(0, release, bounce, end, 'fast', 0, 1).x, 0);
  const midway = getDeliveryFlightPosition(bounceProgress / 2, release, bounce, end, 'fast', 0, 1).x;
  const impact = getDeliveryFlightPosition(bounceProgress, release, bounce, end, 'fast', 0, 1).x;
  assert.ok(midway < 0 && midway > impact);
  assert.ok(Math.abs(impact - right) < 1e-9);
  const atCrease = getDeliveryFlightPosition(1, release, bounce, end, 'fast', 0, 1).x;
  assert.ok(atCrease < impact);
  assert.ok(Math.abs(atCrease - deliveryCreaseX({ ...delivery(0.5), swing: 1 })) < 1e-9);
  assert.equal(deliverySwingAtBounce('offspin', 1, bounce.z), 0);
  assert.equal(isSpinDelivery('offspin'), true);
  assert.equal(isSpinDelivery('fast'), false);
  assert.equal(checkExtraBall({ ...delivery(0.5, -0.7), swing: 1 }).type, 'wide');
});

test('pitch marker matches the actual bounce for pace, swing and spin', () => {
  const release = { x: 0.6, y: 1.9, z: 10 };
  for (const ball of [delivery(0.5, -0.2), { ...delivery(0.5, 0.3), swing: -0.8 }, { ...delivery(0.5, -0.3), type: 'legspin' as const, turn: 1 }]) {
    const bounce = { x: ball.aimTarget.x, y: 0.06, z: ball.aimTarget.z };
    const end = { x: ball.aimTarget.x, y: 0.8, z: BATTER_CREASE_Z };
    const progress = (bounce.z - release.z) / (end.z - release.z);
    const actual = getDeliveryFlightPosition(progress, release, bounce, end, ball.type, ball.turn, ball.swing, ball.pace);
    const marker = deliveryPitchPoint(ball);
    assert.ok(Math.abs(actual.x - marker.x) < 1e-9);
    assert.ok(Math.abs(actual.z - marker.z) < 1e-9);
  }
});

test('bowling side and arm change the same path used for visuals and adjudication', () => {
  for (const arm of ['Right', 'Left'] as const) {
    for (const overTheWicket of [true, false]) {
      const ball = { ...delivery(0.5, 0), bowlingArm: arm, overTheWicket, swing: 0.4 };
      const release = { x: deliveryReleaseX(ball), y: 1.9, z: 10 };
      const bounce = { x: ball.aimTarget.x, y: 0.06, z: ball.aimTarget.z };
      const end = { x: deliveryBaseCreaseX(ball), y: 0.8, z: BATTER_CREASE_Z };
      const actual = getDeliveryFlightPosition(1, release, bounce, end, ball.type, ball.turn, ball.swing, ball.pace);
      assert.ok(Math.abs(actual.x - deliveryCreaseX(ball)) < 1e-9);
      assert.equal(Math.sign(release.x), (arm === 'Right' ? 1 : -1) * (overTheWicket ? 1 : -1));
    }
  }
  const over = { ...delivery(0.5, 0.7), bowlingArm: 'Right' as const, overTheWicket: true };
  const around = { ...over, overTheWicket: false };
  assert.notEqual(deliveryCreaseX(over), deliveryCreaseX(around));
  const overPitch = deliveryPitchPoint(over);
  const aroundPitch = deliveryPitchPoint(around);
  assert.ok(Math.abs(overPitch.x - aroundPitch.x) < 1e-9);
  assert.ok(Math.abs(overPitch.z - aroundPitch.z) < 1e-9);
  assert.notEqual(deliveryVelocityAtCrease(over).x, deliveryVelocityAtCrease(around).x);
  assert.notEqual(battingContactZone(over, 0.5), battingContactZone(around, 0.5));
  assert.equal(checkExtraBall(over).isExtra, false);
  assert.equal(checkExtraBall(around).type, 'wide');
});

test('delivery height is continuous at the pitch and rises after impact', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const at = (bounce.z - release.z) / (end.z - release.z);
  const before = getDeliveryFlightPosition(at - 0.001, release, bounce, end, 'fast');
  const impact = getDeliveryFlightPosition(at, release, bounce, end, 'fast');
  const after = getDeliveryFlightPosition(at + 0.001, release, bounce, end, 'fast');
  assert.ok(Math.abs(impact.y - bounce.y) < 1e-9);
  assert.ok(before.y > impact.y && after.y > impact.y);
  assert.ok(Math.abs(before.y - after.y) < 0.02);
});

test('delivery type switches between speed and swing or spin controls', () => {
  const originalDocument = globalThis.document;
  const hidden: Record<string, boolean> = {};
  Object.assign(globalThis, { document: { getElementById: (id: string) => ({ classList: { toggle: (_name: string, value: boolean) => { hidden[id] = value; } } }) } });
  try {
    updateBowlingAdjustmentVisibility('fast');
    assert.deepEqual(hidden, { 'bowl-pace-control': false, 'bowl-swing-control': false, 'bowl-turn-control': true });
    updateBowlingAdjustmentVisibility('offspin');
    assert.deepEqual(hidden, { 'bowl-pace-control': false, 'bowl-swing-control': true, 'bowl-turn-control': false });
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('delivery timings correspond to plausible average release-to-crease speeds', () => {
  const speedKmh = (type: 'fast' | 'offspin') => 18.8 / (deliveryDurationMs(type) / 1000) * 3.6;
  assert.ok(speedKmh('fast') >= 100 && speedKmh('fast') <= 150);
  assert.ok(speedKmh('offspin') >= 55 && speedKmh('offspin') <= 90);
});

test('pace delivery loses speed at the pitch while retaining the chosen bounce and arrival', () => {
  for (const bounceZ of [-7.5, -3.5, -1.5]) {
    const ball: DeliveryChoice = { ...delivery(0.5), aimTarget: { x: 0, z: bounceZ }, overTheWicket: true, bowlingArm: 'Right', pace: 0.5 };
    const bounceTime = deliveryBounceProgress(ball.type, bounceZ);
    const epsilon = 0.0001;
    const before = sampleDeliveryPath(ball, bounceTime - epsilon);
    const at = sampleDeliveryPath(ball, bounceTime);
    const after = sampleDeliveryPath(ball, bounceTime + epsilon);
    const beforeSpeed = Math.hypot(at.x - before.x, at.y - before.y, at.z - before.z);
    const afterSpeed = Math.hypot(after.x - at.x, after.y - at.y, after.z - at.z);
    assert.ok(Math.abs(at.z - bounceZ) < 1e-9);
    assert.ok(Math.abs(deliveryProgressAtZ(ball, bounceZ) - bounceTime) < 1e-9);
    assert.ok(afterSpeed / beforeSpeed > 0.86 && afterSpeed / beforeSpeed < 0.92);
    assert.ok(Math.abs(sampleDeliveryPath(ball, 1).z - BATTER_CREASE_Z) < 1e-9);
    assert.ok(Math.abs(sampleDeliveryPath(ball, batterContactProgress(ball)).z - (-8.4)) < 1e-9);
  }
});

test('delivery time, bounce sound and visible positions agree for pace and spin', () => {
  const scene = Object.create(GameScene.prototype) as any;
  let sounds = 0;
  scene.onDeliveryBounce = () => { sounds++; };
  for (const type of ['fast', 'offspin'] as const) {
    const ball: DeliveryChoice = { ...delivery(0.5, 0.2), type, pace: 0.7, turn: 0.6, swing: -0.4 };
    for (const z of [10, -1, ball.aimTarget.z, -7, BATTER_CREASE_Z, BATTER_STUMPS_Z]) {
      const time = deliveryProgressAtZ(ball, z);
      assert.ok(Math.abs(sampleDeliveryPath(ball, time).z - z) < 1e-9);
    }
    scene.prepareDeliverySound();
    const bounce = deliveryBounceProgress(type, ball.aimTarget.z);
    const previous = sounds;
    scene.notifyDeliveryBounce(bounce - 1e-6, type, ball.aimTarget.z);
    assert.equal(sounds, previous);
    scene.notifyDeliveryBounce(bounce, type, ball.aimTarget.z);
    scene.notifyDeliveryBounce(bounce + 1e-6, type, ball.aimTarget.z);
    assert.equal(sounds, previous + 1);
  }
});

test('bat contact and wide decisions use the delivered line at the crease', () => {
  const straight = delivery(0.5);
  const swinging = { ...straight, swing: -1 };
  const turning = { ...straight, type: 'offspin' as const, turn: 1 };
  assert.equal(battingContactZone(straight, 0.5), 0.5);
  assert.ok(deliveryCreaseX(swinging) > 0);
  assert.ok(battingContactZone(swinging, 0.5) > 0.5);
  assert.ok(battingContactZone(turning, 0.5) < 0.5);
  assert.ok(battingContactZone(straight, 0) < 0.5);
});

test('delivery visuals and crease-line scoring agree for pace and spin', () => {
  const release = { x: -0.6, y: 1.9, z: 10 };
  const bounce = { x: 0.25, y: 0.06, z: -3.5 };
  const end = { x: bounce.x, y: 0.85, z: BATTER_CREASE_Z };
  for (const choice of [
    { ...delivery(0.5, 0.25), swing: -1 },
    { ...delivery(0.5, 0.25), swing: 1 },
    { ...delivery(0.5, 0.25), type: 'offspin' as const, turn: 0.8 },
    { ...delivery(0.5, 0.25), type: 'legspin' as const, turn: 0.8 }
  ]) {
    const visible = getDeliveryFlightPosition(1, release, bounce, end, choice.type, choice.turn, choice.swing, choice.pace);
    assert.ok(Math.abs(visible.x - deliveryCreaseX(choice)) < 1e-9);
  }
});

test('a yorker reaches the batter lower than a short delivery', () => {
  assert.ok(deliveryArrivalHeight(-8.2) < deliveryArrivalHeight(-2.2));
  assert.ok(deliveryArrivalHeight(-2.2) < deliveryArrivalHeight(0.5));
});

test('boundary scoring uses the rope crossing and bounce, not carry distance alone', () => {
  assert.equal(evaluateFinalOutcome(58, false, true), 6);
  assert.equal(evaluateFinalOutcome(58, true, true), 4);
  assert.equal(evaluateFinalOutcome(70, false, false), 3);
  assert.equal(calculateShotDistance({ position: { x: 0, z: -8.8 } }), 0);
  assert.ok(Math.abs(calculateShotDistance({ position: { x: 3, z: -4.8 } }) - 5) < 1e-9);
});

test('finalizing a six records its runs and biggest hit consistently', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0.5), { direction: 0, type: 'power', timing: 0.5, contactZone: 0.5 });
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(innings.score, 6);
  assert.equal(innings.biggestSix, 58);
  assert.equal(innings.balls[0].runs, 6);
  assert.equal(innings.balls[0].distance, 58);
});

test('the result banner uses the same finalized distance as the score', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bowl');
  game.startMatch();
  const ball = delivery(0.5);
  const outcome = game.recordBall(ball, { direction: 0, type: 'lofted', timing: 0.5, contactZone: 0.5 });
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldPerformance = globalThis.performance;
  let now = oldPerformance.now();
  const timers: Array<() => void> = [];
  let resolveBall: () => void = () => {};
  let title = '';
  let description = '';
  Object.assign(globalThis, {
    document: { getElementById: () => null },
    performance: { now: () => now },
    window: { setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; } }
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.activeDelivery = ball;
    ui.deliveryGeneration = 1;
    ui.deliveryStarted = false;
    ui.hideResultToast = () => {};
    ui.hideBattingHelper = () => {};
    ui.hideAssistedPrompt = () => {};
    ui.showResultToast = (value: string, detail: string) => { title = value; description = detail; };
    ui.updateHUD = () => {};
    ui.setupActiveTurn = () => {};
    ui.gameScene = {
      prepareDeliverySound() {}, setCameraMode() {},
      animateDelivery: (_aim: unknown, _length: unknown, _type: unknown, _arrived: unknown, resolved: () => void) => { resolveBall = resolved; },
      getShotDistance: () => 150,
      shotBoundaryOnFull: true,
      shotReachedBoundary: true
    };
    ui.deliverBall3D();
    resolveBall();
    assert.equal(outcome.distance, 130);
    assert.equal(outcome.runs, 6);
    assert.equal(game.getCurrentInnings().biggestSix, 130);
    assert.equal(title, 'SIX! 130.0m');
    const next = game.recordBall(ball, { direction: 0, type: 'grounded', timing: 0.5, contactZone: 0.5 });
    ui.deliveryStarted = false;
    ui.deliveryGeneration++;
    ui.activeDelivery = ball;
    ui.gameScene.getShotDistance = () => 45;
    ui.gameScene.shotReachedBoundary = false;
    ui.deliverBall3D();
    resolveBall();
    assert.equal(next.runs, 2);
    assert.equal(title, '2 RUNS');
    assert.match(description, /Estimated from shot distance/);
    now += 2100;
    timers.forEach(timer => timer());
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow, performance: oldPerformance });
  }
});

test('bot skill increases across the three difficulty tiers', () => {
  const bots = (['Rookie', 'Medium', 'Hard'] as const).map(createBotPlayer);
  assert.deepEqual(bots.map(bot => bot.stats.bowling.accuracy), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.stats.batting.timing), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.rank), ['Bronze', 'Gold', 'Legend']);
});

test('harder bot batting is more consistent around the arrival time', () => {
  const originalRandom = Math.random;
  const averageDeviation = (tier: 'Rookie' | 'Hard'): number => {
    let seed = 12345;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const batter = createBotPlayer(tier);
    const bowler = createBotPlayer('Medium');
    let total = 0;
    for (let i = 0; i < 500; i++) total += Math.abs(botChooseShot(batter, bowler, delivery(0.5), tier).timing - 0.5);
    return total / 500;
  };
  try {
    const rookie = averageDeviation('Rookie');
    const hard = averageDeviation('Hard');
    assert.ok(rookie > hard);
    assert.ok(rookie < 0.15);
  } finally {
    Math.random = originalRandom;
  }
});

test('recording a bot delivery preserves the line the batter actually saw', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  game.state.player.batterHand = 'LHB';
  const ball = delivery(0.5, 0.7);
  game.recordBall(ball, null);
  assert.equal(ball.aimTarget.x, 0.7);
  assert.equal(game.getCurrentInnings().balls[0].delivery.aimTarget.x, 0.7);
});

test('recorded deliveries and shots retain their original inputs after controls change', () => {
  const game = match();
  const ball = { ...delivery(0.5, 0.2), batterPosition: { x: 0.1, z: 0.2 } };
  const shot = { direction: 2, type: 'lofted' as const, timing: 0.5, contactZone: 0.5 };
  const result = game.recordBall(ball, shot);
  ball.aimTarget.x = -1;
  ball.batterPosition.x = -0.5;
  shot.direction = 6;
  shot.timing = 0.1;
  assert.equal(result.delivery.aimTarget.x, 0.2);
  assert.equal(result.delivery.batterPosition?.x, 0.1);
  assert.equal(result.shot?.direction, 2);
  assert.equal(result.shot?.timing, 0.5);
  assert.equal(game.getCurrentInnings().balls[0], result);
});

test('rookie timing assistance preserves the recorded and displayed shot timing', () => {
  const game = new MatchController('Rookie');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const shot = { direction: 0, type: 'grounded' as const, timing: 0.3, contactZone: 0.5 };
  const outcome = game.recordBall(delivery(0.5), shot);
  assert.equal(shot.timing, 0.3);
  assert.equal(outcome.shot?.timing, 0.3);
  assert.equal(battingTimingFeedback(outcome.shot!.timing).offsetMs, -100);
});

test('flight quality uses the same human batting assistance as contact decisions', () => {
  const game = new MatchController('Medium');
  const human = game.state.player;
  const bot = game.state.bot;
  const shot = { direction: 0, type: 'lofted' as const, timing: 0.3, contactZone: 0.5 };
  const ball = delivery(0.5);
  const medium = battingAssistanceMultiplier(human, bot, 'Medium');
  const hard = battingAssistanceMultiplier(human, bot, 'Hard');
  assert.equal(medium, 0.4);
  assert.equal(hard, 0);
  assert.equal(battingAssistanceMultiplier(bot, human, 'Rookie'), 0);
  assert.ok(shotFlightQuality(shot, ball, medium) > shotFlightQuality(shot, ball, hard));
  assert.equal(shotFlightQuality({ ...shot, timing: 0.5 }, ball, medium), shotFlightQuality({ ...shot, timing: 0.5 }, ball, hard));
  assert.equal(shot.timing, 0.3);
});

test('with equal biggest six and wickets, more sixes beat greater total distance', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null
  });
  first.biggestSix = second.biggestSix = 80;
  first.balls = [hit(80, 6), hit(60, 6)];
  second.balls = [hit(80, 6), hit(59, 4), hit(50, 4)];
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'six_count');
});

test('total distance decides only after the number of sixes is tied', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({ ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs, isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null });
  first.biggestSix = second.biggestSix = 80;
  first.balls = [hit(80, 6), hit(20, 4)];
  second.balls = [hit(80, 6), hit(40, 4)];
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, second.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'total_carry');
});

test('without a six and with equal wickets, runs decide instead of aggregate distance', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null
  });
  first.balls = [hit(60, 2)]; first.score = 2;
  second.balls = [hit(20, 4)]; second.score = 4;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, second.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'runs');
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /4 vs 2/);
});

test('without a six, equal wickets and equal runs lead to sudden death', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  game.state.innings[0].balls = [{ ballNumber: 1, delivery: delivery(0.5), shot: null, distance: 30, runs: 0, isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null }];
  (game as any).resolveMatch();
  assert.equal(game.state.tieBreakerActive, true);
});

test('fully tied innings start one-ball sudden death', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  assert.equal(game.state.tieBreakerActive, true);
  assert.equal(game.state.innings.length, 4);
  assert.equal(game.state.currentInningsIndex, 2);
  assert.equal(game.state.status, 'playing');
});

test('sudden death compares legal hits even when an extra came first', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const [first, second] = game.state.innings.slice(2);
  const outcome = (distance: number, isExtra: boolean): BallOutcome => ({
    ballNumber: 1, delivery: delivery(isExtra ? 0 : 0.5), shot: null,
    distance, isWicket: false, wicketReason: '', isFreeHit: false,
    isExtra, extraType: isExtra ? 'wide' : null
  });
  first.balls = [outcome(0, true), outcome(70, false)];
  second.balls = [outcome(50, false)];
  game.state.currentInningsIndex = 3;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /70\.0m vs 50\.0m/);
});

test('sudden-death wicket result explains the dismissal instead of a distance win', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const [first, second] = game.state.innings.slice(2);
  first.wicketsLost = 0;
  second.wicketsLost = 1;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /survived.*dismissed/);
});

test('match summary shows both sudden-death innings and their extras', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const playerExtra = game.state.innings.slice(2).find(item => item.batter.id === game.state.player.id)!;
  const botExtra = game.state.innings.slice(2).find(item => item.batter.id === game.state.bot.id)!;
  const ball = (isExtra: boolean, distance: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs: isExtra ? undefined : 4,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra, extraType: isExtra ? 'wide' : null
  });
  playerExtra.balls = [ball(true, 0), ball(false, 48)];
  playerExtra.score = 5;
  botExtra.balls = [ball(false, 25)];
  botExtra.score = 4;
  game.state.status = 'completed';
  const originalDocument = globalThis.document;
  const playerLabel = { innerText: '' };
  const botLabel = { innerText: '' };
  let hidden = true;
  const trackers: Record<string, BallOutcome[]> = {};
  Object.assign(globalThis, { document: { getElementById: (id: string) => {
    if (id === 'summary-sudden-death') return { classList: { toggle: (_name: string, value: boolean) => { hidden = value; } } };
    if (id === 'summary-sudden-player') return playerLabel;
    if (id === 'summary-sudden-bot') return botLabel;
    return null;
  } } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.recordedSummary = game.state;
    ui.hideResultToast = () => {};
    ui.keyboardInputManager = { closeHelpModal() {} };
    ui.renderMiniTracker = (id: string, balls: BallOutcome[]) => { trackers[id] = balls; };
    ui.showGameOverScreen();
    assert.equal(hidden, false);
    assert.match(playerLabel.innerText, /5\/0 · 48\.0m/);
    assert.match(botLabel.innerText, /4\/0 · 25\.0m/);
    assert.equal(trackers['summary-sudden-player-tracker'].length, 2);
    assert.equal(trackers['summary-sudden-player-tracker'][0].extraType, 'wide');
    game.state.tieBreakerActive = false;
    ui.showGameOverScreen();
    assert.equal(hidden, true);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('a tied match completes both sudden-death innings and awards draw progression', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  const parent = { removeChild() {} };
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: parent }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (const legalBalls of [6, 6, 1, 1]) {
      const innings = game.getCurrentInnings();
      for (let i = 0; i < legalBalls; i++) game.recordBall(delivery(0.5), null);
      assert.equal(innings.finished, true);
      game.handleInningsCompletion();
      const advance = timers.shift();
      assert.ok(advance);
      advance();
    }
    assert.equal(game.state.status, 'completed');
    assert.equal(game.state.winnerId, null);
    assert.equal(game.state.tieBreakDetails?.deciderTier, 'draw');
    assert.equal(game.state.progression?.xpGained, 50);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('a finished innings schedules only one transition', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() {} } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    game.handleInningsCompletion();
    const observed: number[] = [];
    game.afterInningsTransition(() => observed.push(game.state.currentInningsIndex));
    assert.deepEqual(observed, []);
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(game.state.currentInningsIndex, 1);
    assert.deepEqual(observed, [1]);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('finished regular and sudden-death innings reject all further deliveries', () => {
  for (const sudden of [false, true]) {
    const game = match();
    game.state.tieBreakerActive = sudden;
    const innings = game.getCurrentInnings();
    const limit = sudden ? 1 : 6;
    for (let i = 0; i < limit; i++) game.recordBall(delivery(0.5), null);
    const before = { balls: innings.balls.length, score: innings.score, wickets: innings.wicketsLost };
    assert.throws(() => game.recordBall(delivery(0.5), null), /innings has finished/);
    assert.throws(() => game.recordBall(delivery(0.5, 1.4), null), /innings has finished/);
    assert.equal(innings.ballsBowled, limit);
    assert.deepEqual({ balls: innings.balls.length, score: innings.score, wickets: innings.wicketsLost }, before);
  }
});

test('a finished innings waits for its transition before preparing another delivery', () => {
  const oldDocument = globalThis.document;
  let ready: (() => void) | undefined;
  let starts = 0;
  Object.assign(globalThis, { document: { getElementById: () => null } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.deliveryGeneration = 0;
    ui.cancelBattingRunUp = null;
    ui.botDeliveryTimer = null;
    ui.controller = {
      state: { status: 'playing' },
      getCurrentInnings: () => ({ finished: true }),
      handleInningsCompletion: () => {},
      afterInningsTransition: (callback: () => void) => { ready = callback; }
    };
    ui.setupActiveTurn();
    assert.ok(ready);
    assert.equal(starts, 0);
    ui.setupActiveTurn = () => { starts++; };
    ready();
    assert.equal(starts, 1);
  } finally {
    Object.assign(globalThis, { document: oldDocument });
  }
});

test('an innings transition waits for gameplay to resume', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() {} } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    setGamePaused(true);
    now += 5000;
    timers.shift()!();
    assert.equal(game.state.currentInningsIndex, 0);
    setGamePaused(false);
    now += 2100;
    timers.shift()!();
    assert.equal(game.state.currentInningsIndex, 1);
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('reset invalidates a pending innings transition and removes its overlay', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  let removed = 0;
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() { removed++; } } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    let callbackCount = 0;
    game.afterInningsTransition(() => { callbackCount++; });
    game.reset();
    assert.equal(removed, 1);
    timers[0]();
    assert.equal(game.state.status, 'toss');
    assert.equal(game.state.currentInningsIndex, 0);
    assert.equal(callbackCount, 0);
    assert.equal(removed, 1);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});


test('bat-hand association requires observed bat and both hands near the handle segment', () => {
  const point = (x: number, y: number, confidence = 1): ObservedPoint => ({ x, y, confidence });
  const top = point(.4, .4), splice = point(.6, .4), left = point(.45, .42), right = point(.55, .38);
  const check = (a: ObservedPoint | null, b: ObservedPoint | null, l: ObservedPoint | null, r: ObservedPoint | null, aspect = 2) => associateBatHands(a, b, l, r, aspect, .2, .6, .15, .01);
  const result = check(top, splice, left, right);
  assert.equal(result.accepted, true);
  if (result.accepted) assert.ok(Math.abs(result.distancesInTorsoLengths[0] - .1) < 1e-9);
  const flip = (p: ObservedPoint): ObservedPoint => ({ ...p, x: 1 - p.x });
  assert.equal(check(flip(top), flip(splice), flip(left), flip(right)).accepted, true);
  assert.deepEqual(check(null, splice, left, right), { accepted: false, reason: 'bat-unavailable' });
  assert.deepEqual(check(top, splice, left, point(.55, .38, .59)), { accepted: false, reason: 'hands-unavailable' });
  assert.deepEqual(check(top, top, left, right), { accepted: false, reason: 'degenerate-handle' });
  assert.deepEqual(check(top, splice, left, point(.9, .4)), { accepted: false, reason: 'hands-too-far' });
  assert.deepEqual(check(top, splice, left, right, NaN), { accepted: false, reason: 'invalid-configuration' });
  assert.deepEqual(check(top, splice, point(NaN, .4), right), { accepted: false, reason: 'hands-unavailable' });
});
