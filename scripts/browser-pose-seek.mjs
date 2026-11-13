import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const videoPath = process.env.HARDHIT_POSE_SEEK_VIDEO;
if (!videoPath) throw new Error('Set HARDHIT_POSE_SEEK_VIDEO to a local 120 fps WebM with different adjacent frames.');
const data = (await readFile(videoPath)).toString('base64');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const result = await page.evaluate(async data => {
    const { seekPoseReferenceFrame } = await import('/scripts/pose-reference-seek.mjs');
    const video = document.createElement('video'); video.muted = true; video.src = `data:video/webm;base64,${data}`;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    const sample = () => { context.drawImage(video, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height).data; };
    await seekPoseReferenceFrame(video, .0001, true);
    const first = sample();
    let duplicateRejected = false;
    try { await seekPoseReferenceFrame(video, .0002, false); } catch { duplicateRejected = true; }
    await seekPoseReferenceFrame(video, 1 / 120, false);
    const second = sample();
    let changed = 0;
    for (let i = 0; i < first.length; i += 4) if (first[i] !== second[i] || first[i + 1] !== second[i + 1] || first[i + 2] !== second[i + 2]) changed++;
    return { time: video.currentTime, changed, duplicateRejected };
  }, data);
  assert.ok(result.changed > 0, 'adjacent decoded frames must differ');
  assert.ok(Math.abs(result.time - 1 / 120) < .001, 'media time must advance to the adjacent frame');
  assert.ok(result.duplicateRejected, 'two indistinguishable frame-zero references must fail');
  console.log(`Pose reference seek passed: ${JSON.stringify(result)}`);
} finally {
  await browser?.close();
  await server.close();
}
