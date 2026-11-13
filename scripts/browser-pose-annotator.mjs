import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { validatePoseReference, scorePoseReference } from './pose-reference.mjs';

const path = process.env.HARDHIT_POSE_ANNOTATOR_VIDEO;
if (!path) throw new Error('Set HARDHIT_POSE_ANNOTATOR_VIDEO to a local video.');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/pose-annotator.html`);
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = value => { if (value instanceof Blob && !(value instanceof File)) window.__exported = value.text(); return original.call(URL, value); };
    HTMLAnchorElement.prototype.click = function () {};
  });
  await (await page.$('#file')).uploadFile(path);
  await page.click('#load');
  await page.waitForFunction(() => !document.querySelector('#save').disabled);
  const alignment = await page.evaluate(() => {
    const frame = document.querySelector('#frame').getBoundingClientRect(), view = document.querySelector('#view').getBoundingClientRect();
    return Math.max(Math.abs(frame.left - view.left), Math.abs(frame.top - view.top), Math.abs(frame.width - view.width), Math.abs(frame.height - view.height));
  });
  assert.ok(alignment < 1, 'annotation overlay must match the displayed video frame');
  async function point(index, x, y) {
    await page.select('#landmark', String(index));
    const box = await (await page.$('#view')).boundingBox();
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  }
  async function seek(time) {
    await page.$eval('#time', (input, time) => { input.value = String(time); }, time);
    await page.click('#seek');
    await page.waitForFunction(time => !document.querySelector('#video').seeking && Math.abs(document.querySelector('#video').currentTime - time) < .001 && document.querySelector('#status').textContent.startsWith(`Time ${time.toFixed(4)}`), {}, time);
  }
  await point(11, .3, .3); await point(12, .7, .3); await page.click('#save');
  await seek(.1); await point(23, .4, .6); await page.click('#save');
  await seek(0); await point(11, .4, .3); await page.click('#save');
  await page.click('#export');
  assert.match(await page.$eval('#status', element => element.textContent), /positive pixel tolerance/);
  await page.$eval('#tolerance', input => { input.value = '20'; });
  await page.click('#export');
  const reference = validatePoseReference(JSON.parse(await page.evaluate(() => window.__exported)));
  assert.equal(reference.annotationSource, 'manual'); assert.equal(reference.mirrored, false);
  assert.equal(reference.frames.length, 2); assert.ok(reference.frames[0].time < reference.frames[1].time);
  assert.equal(reference.frames[0].points.length, 2); assert.ok(Math.abs(reference.frames[0].points[0].x - .4) < .01);
  const predictions = reference.frames.map(frame => { const points = []; for (const p of frame.points) points[p.index] = { ...p, visibility: 1 }; return points; });
  assert.equal(scorePoseReference(reference, predictions).passed, true);
  assert.equal(scorePoseReference(reference, reference.frames.map(() => [])).passed, false);
  assert.deepEqual(errors, []);
  console.log('Pose annotator export, replacement, ordering and scorer integration passed.');
} finally {
  await browser?.close();
  await server.close();
}
