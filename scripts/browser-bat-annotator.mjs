import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { validateBatReference } from './bat-reference.mjs';

const clip = process.env.HARDHIT_BAT_CLIP;
if (!clip) throw new Error('Set HARDHIT_BAT_CLIP to a local video file.');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/bat-annotator.html`);
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = value => { if (value instanceof Blob && !(value instanceof File)) window.__exported = value.text(); return original.call(URL, value); };
    HTMLAnchorElement.prototype.click = function () {};
  });
  await (await page.$('#file')).uploadFile(clip);
  await page.click('#load');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Frame 0'));
  const alignment = await page.evaluate(() => {
    const frame = document.querySelector('#frame').getBoundingClientRect(), view = document.querySelector('#view').getBoundingClientRect();
    return Math.max(Math.abs(frame.left - view.left), Math.abs(frame.top - view.top), Math.abs(frame.width - view.width), Math.abs(frame.height - view.height));
  });
  assert.ok(alignment < 1, `bat overlay must align with the decoded frame; difference ${alignment}px`);
  async function save(x) {
    const box = await (await page.$('#view')).boundingBox();
    for (let i = 0; i < 4; i++) await page.mouse.click(box.x + box.width * (x + i * .03), box.y + box.height * .5);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('0/4 points'));
  }
  await save(.1); // frame 0, then frame 5
  await save(.2); // frame 5, then frame 10
  await page.keyboard.press('a');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Frame 5'));
  await page.keyboard.press('a');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Frame 0'));
  await save(.4); // replace frame 0 after a later frame exists
  await page.click('#export');
  const result = JSON.parse(await page.evaluate(() => window.__exported));
  validateBatReference(result);
  assert.deepEqual(result.frames.map(frame => frame.frame), [0, 5]);
  assert.ok(Math.abs(result.frames[0].points[0].x - .4) < .01, 'replacement must retain the new annotation');
  assert.ok(Math.abs(result.frames[0].points[0].y - .5) < .01, 'exported coordinates must match the clicked frame position');
  console.log('Bat annotator replacement and ordered export passed.');
} finally {
  await browser?.close();
  await server.close();
}
