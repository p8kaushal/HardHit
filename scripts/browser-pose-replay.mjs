import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Use a user-provided, pre-cropped camera-view WebM. The video stays local and is not saved by this script.
const path = process.env.HARDHIT_POSE_REPLAY;
if (!path) throw new Error('Set HARDHIT_POSE_REPLAY to a local, pre-cropped camera-view WebM.');
const seek = Number(process.env.HARDHIT_POSE_REPLAY_SEEK ?? 0);
if (!Number.isFinite(seek) || seek < 0) throw new Error('HARDHIT_POSE_REPLAY_SEEK must be a non-negative number of seconds.');
const segmentNames = ['leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow', 'leftHip', 'leftKnee', 'rightHip', 'rightKnee', 'leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'];
const requiredSegments = (process.env.HARDHIT_POSE_REPLAY_REQUIRE ?? '').split(',').map(value => value.trim()).filter(Boolean);
if (requiredSegments.some(name => !segmentNames.includes(name))) throw new Error(`Unknown required segment. Choose from: ${segmentNames.join(', ')}`);
const encodedVideo = (await readFile(path)).toString('base64');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(async ({ encoded, seek, segmentNames }) => {
    const { GameScene } = await import('/src/scene.ts');
    const original = GameScene.prototype.applyTrackedBatterPose;
    window.__replayStats = { frames: 0, personFrames: 0, wristFrames: 0, indexFrames: 0, earFrames: 0, footFrames: 0, applied: 0, nonfinite: 0, maxFacing: 0, rigSamples: 0, badRig: 0, maxJointError: 0, maxArmShift: 0, directionChecks: 0, directionMismatches: 0, maxDirectionErrorDeg: 0 };
    window.__replayStats.segments = Object.fromEntries(segmentNames.map(name => [name, { checks: 0, mismatches: 0, maxErrorDeg: 0 }]));
    GameScene.prototype.applyTrackedBatterPose = function (pose, offset, facing, directions, confidence) {
      const values = Object.values(pose).flatMap(v => [v.x, v.y, v.z]).concat([offset.x, offset.y, offset.z], facing === null ? [] : [facing], ...Object.values(directions).map(v => [v.x, v.y, v.z]));
      if (values.some(value => !Number.isFinite(value))) window.__replayStats.nonfinite++;
      if (facing !== null && Number.isFinite(facing)) window.__replayStats.maxFacing = Math.max(window.__replayStats.maxFacing, Math.abs(facing));
      window.__replayStats.applied++;
      window.__replayScene = this;
      window.__replayTargets = { directions, confidence };
      if (!window.__replayRigObserver) {
        let initialArm = null;
        window.__replayRigObserver = this.scene.onAfterRenderObservable.add(() => {
          const scene = this.scene, pairs = [['pelvis','Hips'],['spine','Spine'],['chest','Spine2'],['neck','Neck'],['head','Head'],['leftShoulder','LeftArm'],['leftElbow','LeftForeArm'],['leftWrist','LeftHand'],['rightShoulder','RightArm'],['rightElbow','RightForeArm'],['rightWrist','RightHand'],['leftHip','LeftUpLeg'],['leftKnee','LeftLeg'],['leftAnkle','LeftFoot'],['rightHip','RightUpLeg'],['rightKnee','RightLeg'],['rightAnkle','RightFoot'],['leftIndex','LeftHandIndex3'],['rightIndex','RightHandIndex3'],['leftToe','LeftToeBase'],['rightToe','RightToeBase']];
          const stats = window.__replayStats;
          for (const [joint, name] of pairs) {
            const node = scene.getTransformNodeByName(name), marker = scene.getMeshByName(`poseXray_${joint}`);
            if (!node || !marker?.isEnabled()) continue;
            node.computeWorldMatrix(true);
            const point = node.getAbsolutePosition();
            if (![point.x,point.y,point.z,marker.position.x,marker.position.y,marker.position.z].every(Number.isFinite)) stats.badRig++;
            else stats.maxJointError = Math.max(stats.maxJointError, marker.position.subtract(point).length());
          }
          const limbs = [
            ['leftShoulder','leftElbow','LeftArm','LeftForeArm'], ['leftElbow','leftWrist','LeftForeArm','LeftHand'],
            ['rightShoulder','rightElbow','RightArm','RightForeArm'], ['rightElbow','rightWrist','RightForeArm','RightHand'],
            ['leftHip','leftKnee','LeftUpLeg','LeftLeg'], ['leftKnee','leftAnkle','LeftLeg','LeftFoot'],
            ['rightHip','rightKnee','RightUpLeg','RightLeg'], ['rightKnee','rightAnkle','RightLeg','RightFoot'],
            ['leftWrist','leftIndex','LeftHand','LeftHandIndex3'], ['rightWrist','rightIndex','RightHand','RightHandIndex3'],
            ['leftAnkle','leftToe','LeftFoot','LeftToeBase'], ['rightAnkle','rightToe','RightFoot','RightToeBase']
          ];
          const targets = window.__replayTargets;
          for (const [joint, end, parentName, childName] of limbs) {
            const target = targets?.directions[joint], a = scene.getTransformNodeByName(parentName), b = scene.getTransformNodeByName(childName);
            if (!target || !targets.confidence[joint] || !targets.confidence[end] || !a || !b) continue;
            a.computeWorldMatrix(true); b.computeWorldMatrix(true);
            const vector = b.getAbsolutePosition().subtract(a.getAbsolutePosition());
            if (vector.lengthSquared() < .000001) { stats.badRig++; continue; }
            const actual = vector.normalize();
            const dot = Math.max(-1, Math.min(1, actual.x * target.x + actual.y * target.y + actual.z * target.z));
            const degrees = Math.acos(dot) * 180 / Math.PI;
            if (!Number.isFinite(degrees)) { stats.badRig++; continue; }
            stats.directionChecks++;
            const segment = stats.segments[joint];
            segment.checks++;
            segment.maxErrorDeg = Math.max(segment.maxErrorDeg, degrees);
            stats.maxDirectionErrorDeg = Math.max(stats.maxDirectionErrorDeg, degrees);
            if (degrees > 10) { stats.directionMismatches++; segment.mismatches++; }
          }
          const arm = scene.getTransformNodeByName('LeftArm'), hand = scene.getTransformNodeByName('LeftHand');
          if (arm && hand) {
            arm.computeWorldMatrix(true); hand.computeWorldMatrix(true);
            const vector = hand.getAbsolutePosition().subtract(arm.getAbsolutePosition());
            if (!initialArm) initialArm = vector.clone();
            else stats.maxArmShift = Math.max(stats.maxArmShift, vector.subtract(initialArm).length());
          }
          stats.rigSamples++;
        });
      }
      return original.call(this, pose, offset, facing, directions, confidence);
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler) {
        super.onmessage = event => {
          if (event.data?.type === 'result') {
            const points = event.data.landmarks;
            const visible = i => { const p = points[i]; return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .45 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1; };
            window.__replayStats.frames++;
            if (points.length) window.__replayStats.personFrames++;
            if ([15,16].every(visible)) window.__replayStats.wristFrames++;
            if ([19,20].every(visible)) window.__replayStats.indexFrames++;
            if ([7,8].every(visible)) window.__replayStats.earFrames++;
            if ([27,28,31,32].every(visible)) window.__replayStats.footFrames++;
            window.__replayLastPoints = points;
          }
          handler(event);
        };
      }
    };
    const replay = document.createElement('video');
    replay.muted = true; replay.playsInline = true; replay.src = `data:video/webm;base64,${encoded}`;
    await new Promise((resolve, reject) => { replay.onloadeddata = resolve; replay.onerror = () => reject(new Error('Could not load the replay video')); });
    if (seek >= replay.duration) throw new Error('Replay seek must be before the end of the video');
    if (seek > 0) await new Promise((resolve, reject) => { replay.onseeked = resolve; replay.onerror = () => reject(new Error('Could not seek in the replay video')); replay.currentTime = seek; });
    const canvas = document.createElement('canvas'); canvas.width = replay.videoWidth; canvas.height = replay.videoHeight;
    const draw = () => canvas.getContext('2d').drawImage(replay, 0, 0);
    draw();
    const stream = canvas.captureStream(10);
    const interval = setInterval(() => { if (stream.getVideoTracks()[0].readyState === 'ended') clearInterval(interval); else draw(); }, 100);
    navigator.mediaDevices.getUserMedia = async () => stream;
    window.__replayVideo = replay; window.__replayStream = stream;
  }, { encoded: encodedVideo, seek, segmentNames });
  const before = await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') }));
  await page.click('#btn-playzone');
  await page.click('#playzone-camera-settings summary');
  await page.click('#playzone-camera-toggle');
  await page.waitForFunction(() => document.querySelector('#playzone-camera-toggle').textContent === 'Stop camera');
  await page.click('#playzone-pose-toggle');
  await page.waitForFunction(() => {
    const p = window.__replayLastPoints;
    return p?.length && [11,12,23,24].every(i => (p[i]?.visibility ?? 0) >= .45 && p[i].x > 0 && p[i].x < 1 && p[i].y > 0 && p[i].y < 1);
  }, { timeout: 30000 });
  await page.click('#playzone-pose-calibrate');
  assert.match(await page.$eval('#playzone-retarget-status', e => e.textContent), /Calibrated/);
  await page.click('#playzone-pose-xray');
  await page.evaluate(() => window.__replayVideo.play());
  try {
    await page.waitForFunction(() => window.__replayVideo.ended, { timeout: 45000 });
  } catch (error) {
    const playback = await page.evaluate(() => ({ time: window.__replayVideo.currentTime, duration: window.__replayVideo.duration, paused: window.__replayVideo.paused, ended: window.__replayVideo.ended, readyState: window.__replayVideo.readyState, stats: window.__replayStats }));
    throw new Error(`Replay did not finish: ${JSON.stringify(playback)}; page errors: ${JSON.stringify(errors)}`, { cause: error });
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  const stats = await page.evaluate(() => ({ ...window.__replayStats, score: document.querySelector('#playzone-score').textContent }));
  assert.ok(stats.personFrames >= 5 && stats.applied >= 5, `Replay should process changing person frames: ${JSON.stringify(stats)}`);
  assert.equal(stats.nonfinite, 0, 'retargeted rotations and offsets must remain finite');
  assert.ok(stats.rigSamples >= 5 && stats.badRig === 0, `rendered joints must remain finite: ${JSON.stringify(stats)}`);
  assert.ok(stats.maxJointError < .05, `X-ray markers must follow rendered joints: ${JSON.stringify(stats)}`);
  assert.ok(stats.maxArmShift > .03, `the replay should exercise visible arm movement: ${JSON.stringify(stats)}`);
  assert.ok(stats.directionChecks >= 20, `the replay must include confident tracked limb directions: ${JSON.stringify(stats)}`);
  assert.equal(stats.directionMismatches, 0, `rendered limbs must follow their tracked targets within 10 degrees: ${JSON.stringify(stats)}`);
  for (const name of requiredSegments) assert.ok(stats.segments[name].checks >= 20, `Required segment ${name} needs at least 20 confident rendered samples: ${JSON.stringify(stats.segments)}`);
  assert.match(stats.score, /0 runs \/ 0 wickets · 0 balls/, 'replay must not score a practice ball');
  assert.deepEqual(await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') })), before);
  await page.click('#playzone-exit');
  assert.equal(await page.evaluate(() => window.__replayStream.getTracks().every(track => track.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => window.__replayScene.scene.getMeshByName('poseXray_pelvis').isEnabled()), false, 'X-ray should close on exit');
  assert.deepEqual(errors, []);
  console.log(`Recorded-pose replay passed: ${JSON.stringify(stats)}`);
} finally {
  await browser?.close();
  await server.close();
}
