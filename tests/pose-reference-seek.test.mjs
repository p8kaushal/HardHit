import test from 'node:test';
import assert from 'node:assert/strict';
import { seekPoseReferenceFrame } from '../scripts/pose-reference-seek.mjs';

test('pose reference seeks distinct high-frame-rate times and handles frame zero', async () => {
  let time = 0, seeks = 0;
  const video = {
    get currentTime() { return time; },
    set currentTime(value) { time = value; seeks++; queueMicrotask(() => this.onseeked()); },
  };
  await seekPoseReferenceFrame(video, .0001, true);
  assert.equal(seeks, 0);
  await assert.rejects(seekPoseReferenceFrame(video, .0002, false), /frame zero/);
  await seekPoseReferenceFrame(video, 1 / 120, false);
  assert.equal(seeks, 1);
  await seekPoseReferenceFrame(video, 2 / 120, false);
  assert.equal(seeks, 2);
});
