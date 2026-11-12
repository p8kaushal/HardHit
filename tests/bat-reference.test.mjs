import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAT_KEYPOINTS, scoreBatReference, validateBatReference } from '../scripts/bat-reference.mjs';

const reference = () => ({ version: 1, annotationSource: 'manual', width: 1000, height: 500, frameRate: 30, keypoints: [...BAT_KEYPOINTS], frames: [{ frame: 0, time: 0, points: BAT_KEYPOINTS.map((name, i) => ({ name, x: .2 + i * .1, y: .4 + i * .02 })) }] });
const predictions = (confidence = 1) => reference().frames[0].points.map(point => ({ ...point, confidence }));

test('validates manual bat references and scores pixel error with image aspect', () => {
  const ref = reference();
  assert.equal(validateBatReference(ref), ref);
  const exact = scoreBatReference(ref, [predictions()], 5);
  assert.equal(exact.passed, true);
  const shifted = predictions().map((point, i) => ({ ...point, x: point.x + (i === 0 ? .003 : 0), y: point.y + (i === 0 ? .004 : 0) }));
  assert.equal(scoreBatReference(ref, [shifted], 5).passed, true, '3-4-5 pixel error is on the tolerance boundary');
  shifted[0].x += .002;
  assert.equal(scoreBatReference(ref, [shifted], 5).outsideTolerance, 1);
});

test('rejects malformed, reordered, duplicate and unlabelled bat references', () => {
  const variants = [
    { version: 2 }, { annotationSource: 'model' }, { width: 0 }, { frameRate: 0 },
    { keypoints: [...BAT_KEYPOINTS].reverse() }, { frames: [] },
    { frames: [{ frame: -1, time: 0, points: [] }] },
    { frames: [{ frame: 0, time: 0, points: [] }] }
  ];
  for (const changes of variants) assert.throws(() => validateBatReference({ ...reference(), ...changes }));
  const badPoint = reference(); badPoint.frames[0].points[2].x = NaN;
  assert.throws(() => validateBatReference(badPoint), /normalized finite/);
  const duplicateTime = reference(); duplicateTime.frames.push(structuredClone(duplicateTime.frames[0]));
  assert.throws(() => validateBatReference(duplicateTime), /strictly increasing/);
});

test('counts low confidence and absent endpoints as missing and never passes partial coverage', () => {
  const ref = reference();
  const points = predictions(); points[1].confidence = .49; points[3] = null;
  const summary = scoreBatReference(ref, [points], 10);
  assert.equal(summary.expectedPoints, 4);
  assert.equal(summary.comparedPoints, 2);
  assert.equal(summary.missingPoints, 2);
  assert.equal(summary.passed, false);
  assert.throws(() => scoreBatReference(ref, [], 10), /Every annotated frame/);
});
