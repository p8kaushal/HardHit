import assert from 'node:assert/strict';

export const BAT_KEYPOINTS = ['handle-top', 'splice', 'blade-middle', 'toe'];

export function validateBatReference(reference) {
  assert.ok(reference && reference.version === 1, 'Bat reference version must be 1.');
  assert.ok(reference.annotationSource === 'manual', 'Bat references must be manually annotated.');
  assert.ok(Number.isInteger(reference.width) && reference.width > 0 && Number.isInteger(reference.height) && reference.height > 0, 'Reference dimensions must be positive integers.');
  assert.ok(Number.isFinite(reference.frameRate) && reference.frameRate > 0, 'Declare the source frame rate.');
  assert.ok(Array.isArray(reference.keypoints) && reference.keypoints.length === 4 && BAT_KEYPOINTS.every((name, index) => reference.keypoints[index] === name), 'Declare the four bat keypoints in canonical order.');
  assert.ok(Array.isArray(reference.frames) && reference.frames.length > 0, 'Annotate at least one frame.');
  let previousTime = -1;
  for (const frame of reference.frames) {
    assert.ok(Number.isInteger(frame.frame) && frame.frame >= 0, 'Frame index must be a nonnegative integer.');
    assert.ok(Number.isFinite(frame.time) && frame.time >= 0 && frame.time > previousTime, 'Frame times must be finite and strictly increasing.');
    previousTime = frame.time;
    assert.ok(Array.isArray(frame.points) && frame.points.length === 4, 'Every frame must annotate all four bat points.');
    for (const [index, point] of frame.points.entries()) {
      assert.ok(point.name === BAT_KEYPOINTS[index], 'Bat point names must match canonical order.');
      assert.ok([point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1), 'Bat points must be normalized finite image coordinates.');
    }
  }
  return reference;
}

export function scoreBatReference(reference, predictions, maxErrorPixels) {
  validateBatReference(reference);
  assert.ok(Number.isFinite(maxErrorPixels) && maxErrorPixels > 0, 'Set an explicit positive pixel tolerance.');
  assert.ok(Array.isArray(predictions) && predictions.length === reference.frames.length, 'Every annotated frame needs a prediction.');
  const summary = { frames: predictions.length, expectedPoints: predictions.length * 4, comparedPoints: 0, missingPoints: 0, outsideTolerance: 0, tolerancePixels: maxErrorPixels, meanErrorPixels: null, maxErrorPixels: null, passed: false };
  let sum = 0;
  for (let f = 0; f < predictions.length; f++) {
    const points = predictions[f];
    for (let k = 0; k < 4; k++) {
      const target = reference.frames[f].points[k];
      const actual = points?.[k];
      if (!actual || ![actual.x, actual.y, actual.confidence].every(Number.isFinite) || actual.confidence < .5 || actual.x < 0 || actual.x > 1 || actual.y < 0 || actual.y > 1) { summary.missingPoints++; continue; }
      const error = Math.hypot((actual.x - target.x) * reference.width, (actual.y - target.y) * reference.height);
      summary.comparedPoints++; sum += error; summary.maxErrorPixels = Math.max(summary.maxErrorPixels ?? 0, error);
      if (error - maxErrorPixels > 1e-9) summary.outsideTolerance++;
    }
  }
  if (summary.comparedPoints) summary.meanErrorPixels = sum / summary.comparedPoints;
  summary.passed = summary.missingPoints === 0 && summary.outsideTolerance === 0;
  return summary;
}

/** Align predictions explicitly; arrays alone do not establish which source frame was processed. */
export function scoreBatPredictionFile(reference, output, maxErrorPixels) {
  validateBatReference(reference);
  assert.ok(output && output.version === 1, 'Prediction version must be 1.');
  assert.equal(output.width, reference.width, 'Prediction width must match the reference.');
  assert.equal(output.height, reference.height, 'Prediction height must match the reference.');
  assert.ok(Array.isArray(output.frames) && output.frames.length === reference.frames.length, 'Every reference frame needs one prediction frame.');
  const predictions = output.frames.map((frame, index) => {
    const target = reference.frames[index];
    assert.ok(frame && frame.frame === target.frame && frame.time === target.time, 'Prediction frame index and time must match the reference in order.');
    assert.ok(Array.isArray(frame.points) && frame.points.length === BAT_KEYPOINTS.length, 'Each prediction must have four ordered points; use null for missing points.');
    for (const [pointIndex, point] of frame.points.entries()) {
      assert.ok(point === null || (point && point.name === BAT_KEYPOINTS[pointIndex]), 'Prediction names must match canonical point order.');
    }
    return frame.points;
  });
  return scoreBatReference(reference, predictions, maxErrorPixels);
}
