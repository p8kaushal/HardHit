import assert from 'node:assert/strict';

/** References use the unmirrored, pre-cropped source image. No model-generated labels count as independent evidence. */
export function validatePoseReference(reference) {
  assert.ok(reference && reference.version === 1, 'Reference version must be 1.');
  assert.ok(['manual', 'synthetic-smoke'].includes(reference.annotationSource), 'Declare annotationSource as manual or synthetic-smoke.');
  assert.equal(reference.mirrored, false, 'References must use an unmirrored source clip.');
  for (const key of ['width', 'height']) assert.ok(Number.isInteger(reference[key]) && reference[key] > 0, `Reference ${key} must be a positive integer.`);
  assert.ok(Number.isFinite(reference.maxErrorPixels) && reference.maxErrorPixels > 0, 'Set an explicit positive maxErrorPixels tolerance.');
  assert.ok(Array.isArray(reference.frames) && reference.frames.length > 0, 'Annotate at least one frame.');
  let previousTime = -1;
  for (const frame of reference.frames) {
    assert.ok(Number.isFinite(frame.time) && frame.time >= 0 && frame.time > previousTime, 'Frame times must be nonnegative, finite and strictly increasing.');
    previousTime = frame.time;
    assert.ok(Array.isArray(frame.points) && frame.points.length > 0, 'Every annotated frame needs points.');
    const indices = new Set();
    for (const point of frame.points) {
      assert.ok(Number.isInteger(point.index) && point.index >= 0 && point.index < 33 && !indices.has(point.index), 'Landmark indices must be unique integers from 0 through 32 in each frame.');
      indices.add(point.index);
      assert.ok([point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1), 'Reference coordinates must be normalized finite image positions.');
    }
  }
  return reference;
}

/** Count missing detections as failures rather than silently skipping low-confidence annotations. */
export function scorePoseReference(reference, results) {
  validatePoseReference(reference);
  assert.ok(Array.isArray(results) && results.length === reference.frames.length, 'Every annotated frame needs an inference result.');
  const summary = { annotationSource: reference.annotationSource, frames: results.length, expectedPoints: 0, comparedPoints: 0, missingPoints: 0, outsideTolerance: 0, meanErrorPixels: null, maxErrorPixels: null, tolerancePixels: reference.maxErrorPixels, passed: false };
  let totalError = 0;
  reference.frames.forEach((frame, index) => {
    const points = results[index];
    assert.ok(Array.isArray(points), 'Inference results must be landmark arrays.');
    for (const target of frame.points) {
      summary.expectedPoints++;
      const actual = points[target.index];
      if (!actual || ![actual.x, actual.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1) || !Number.isFinite(actual.visibility) || actual.visibility < .5) {
        summary.missingPoints++;
        continue;
      }
      const error = Math.hypot((actual.x - target.x) * reference.width, (actual.y - target.y) * reference.height);
      summary.comparedPoints++;
      totalError += error;
      summary.maxErrorPixels = Math.max(summary.maxErrorPixels ?? 0, error);
      if (error - reference.maxErrorPixels > 1e-9) summary.outsideTolerance++;
    }
  });
  if (summary.comparedPoints) summary.meanErrorPixels = totalError / summary.comparedPoints;
  summary.passed = summary.missingPoints === 0 && summary.outsideTolerance === 0;
  return summary;
}
