import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scorePoseReference, validatePoseReference } from './pose-reference.mjs';

const videoPath = process.env.HARDHIT_POSE_REPLAY;
const referencePath = process.env.HARDHIT_POSE_REFERENCE;
if (!videoPath || !referencePath) throw new Error('Set HARDHIT_POSE_REPLAY to a local WebM and HARDHIT_POSE_REFERENCE to its local annotation JSON.');
const reference = validatePoseReference(JSON.parse(await readFile(referencePath, 'utf8')));
const encoded = (await readFile(videoPath)).toString('base64');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  const results = await page.evaluate(async ({ encoded, reference }) => {
    const { default: PoseWorker } = await import('/src/pose-worker.ts?worker');
    const worker = new PoseWorker();
    const request = (message, transfer = []) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Annotated-frame pose worker timed out.')), 30000);
      worker.onmessage = event => {
        clearTimeout(timer);
        if (event.data.type === 'error') reject(new Error('Annotated-frame pose worker failed.'));
        else resolve(event.data);
      };
      worker.onerror = () => { clearTimeout(timer); reject(new Error('Annotated-frame pose worker failed to load.')); };
      worker.postMessage(message, transfer);
    });
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    try {
      await request({ type: 'init', modelUrl: new URL('models/pose/pose_landmarker_lite.task', document.baseURI).href });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Reference video load timed out.')), 15000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Could not decode reference video.')); };
        video.src = `data:video/webm;base64,${encoded}`;
      });
      if (video.videoWidth !== reference.width || video.videoHeight !== reference.height) throw new Error('Reference dimensions must match the decoded source video.');
      const results = [];
      for (const frame of reference.frames) {
        if (frame.time >= video.duration) throw new Error('An annotated frame is beyond the video duration.');
        if (video.currentTime !== frame.time) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Annotated-frame seek timed out.')), 15000);
          video.onseeked = () => { clearTimeout(timer); resolve(); };
          video.onerror = () => { clearTimeout(timer); reject(new Error('Could not seek to annotated frame.')); };
          video.currentTime = frame.time;
        });
        const bitmap = await createImageBitmap(video);
        const response = await request({ type: 'frame', bitmap, timestamp: 1000 + frame.time * 1000 }, [bitmap]);
        if (response.type !== 'result') throw new Error('Expected an annotated-frame inference result.');
        results.push(response.landmarks);
      }
      return results;
    } finally {
      worker.terminate();
      video.removeAttribute('src');
      video.load();
    }
  }, { encoded, reference });
  const summary = scorePoseReference(reference, results);
  console.log(`Annotated pose ${reference.annotationSource === 'manual' ? 'reference' : 'synthetic smoke (not accuracy evidence)'}: ${JSON.stringify(summary)}`);
  assert.deepEqual(errors, [], 'No browser runtime errors should occur.');
  assert.ok(summary.passed, 'Annotated pose reference failed: missing landmarks or pixel errors exceed the supplied tolerance.');
} finally {
  await browser?.close();
  await server.close();
}
