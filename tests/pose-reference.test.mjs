import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePoseReference, validatePoseReference } from '../scripts/pose-reference.mjs';

const reference = () => ({ version: 1, annotationSource: 'manual', mirrored: false, width: 1000, height: 500, maxErrorPixels: 5, frames: [{ time: 0, points: [{ index: 15, x: .5, y: .5 }] }] });
const result = (x = .503, y = .508, visibility = 1) => { const points = []; points[15] = { x, y, visibility }; return points; };

test('reference scoring uses image aspect and includes the exact tolerance boundary', () => {
  const summary = scorePoseReference(reference(), [result()]);
  assert.ok(Math.abs(summary.meanErrorPixels - 5) < 1e-10);
  assert.equal(summary.passed, true, 'roundoff must not reject the exact tolerance boundary');
  const exact = reference(); exact.width = 1024; exact.height = 512;
  assert.equal(scorePoseReference(exact, [result(.5 + 3 / 1024, .5 + 4 / 512)]).passed, true);
  assert.equal(scorePoseReference(reference(), [result(.506, .5)]).outsideTolerance, 1);
  assert.equal(scorePoseReference(reference(), [result(.5, .506)]).passed, true, 'pixel distance must account for height separately');
});

test('reference scoring fails on missing or uncertain landmarks and missing frames', () => {
  for (const points of [[], result(.5, .5, .49), result(NaN), result(1.1), result(.5, .5, NaN)]) {
    const summary = scorePoseReference(reference(), [points]);
    assert.equal(summary.passed, false);
    assert.equal(summary.missingPoints, 1);
    assert.equal(summary.comparedPoints, 0);
    assert.equal(summary.meanErrorPixels, null);
  }
  assert.throws(() => scorePoseReference(reference(), []), /Every annotated frame/);
  assert.throws(() => scorePoseReference(reference(), [null]), /landmark arrays/);
});

test('reference validation rejects ambiguous, malformed and duplicate annotations', () => {
  const variants = [
    { version: 2 }, { annotationSource: 'model' }, { mirrored: true }, { width: 0 }, { height: 2.5 },
    { maxErrorPixels: 0 }, { maxErrorPixels: Infinity }, { frames: [] },
    { frames: [{ time: -1, points: [] }] },
    { frames: [{ time: 0, points: [] }] },
    { frames: [{ time: 0, points: [{ index: 33, x: .5, y: .5 }] }] },
    { frames: [{ time: 0, points: [{ index: 0, x: -1, y: .5 }] }] },
    { frames: [{ time: 0, points: [{ index: 0, x: .5, y: NaN }] }] }
  ];
  for (const changes of variants) assert.throws(() => validatePoseReference({ ...reference(), ...changes }));
  const duplicatePoint = reference(); duplicatePoint.frames[0].points.push({ ...duplicatePoint.frames[0].points[0] });
  assert.throws(() => validatePoseReference(duplicatePoint), /unique/);
  const duplicateTime = reference(); duplicateTime.frames.push(structuredClone(duplicateTime.frames[0]));
  assert.throws(() => validatePoseReference(duplicateTime), /strictly increasing/);
});

test('reference report retains declared synthetic status and all annotated point coverage', () => {
  const fixture = reference(); fixture.annotationSource = 'synthetic-smoke';
  fixture.frames.push({ time: 1, points: [{ index: 15, x: .5, y: .5 }, { index: 16, x: .5, y: .5 }] });
  const summary = scorePoseReference(fixture, [result(.5, .5), result(.5, .5)]);
  assert.equal(summary.annotationSource, 'synthetic-smoke');
  assert.equal(summary.expectedPoints, 3);
  assert.equal(summary.comparedPoints, 2);
  assert.equal(summary.missingPoints, 1);
  assert.equal(summary.passed, false, 'coverage must not pass when one annotated landmark is absent');
});
