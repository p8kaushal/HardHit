import { createServer } from 'vite';
import puppeteer from 'puppeteer';

// Seed only the isolated test page; production randomness and game timing are unchanged.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    let seed = 12345;
    Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${msg.text()} ${msg.location().url ?? ''}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await page.click('#btn-start-toss');
  // Force the toss only, then restore the seeded sequence.
  await page.evaluate(() => { window.__testRandom = Math.random; Math.random = () => 0; });
  await page.click('#btn-toss-heads');
  await page.waitForSelector('#toss-choice-buttons:not(.hidden)', { timeout: 5000 });
  await page.evaluate(() => { Math.random = window.__testRandom; delete window.__testRandom; });
  await page.click('#btn-choice-bowl');
  const deadline = Date.now() + 240000;
  let lastAttempt = 0, lastState = '';
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      summary: document.querySelector('#match-summary-modal').classList.contains('active'),
      bowling: !document.querySelector('#control-bowling').classList.contains('hidden'),
      innings: document.querySelector('#hud-innings-title').textContent,
      balls: document.querySelector('#hud-balls-count').textContent,
      score: document.querySelector('#hud-score-count').textContent,
    }));
    const label = `${state.innings}: ${state.balls} score ${state.score}`;
    if (label !== lastState) { console.log(label); lastState = label; }
    if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    if (state.summary) break;
    if (state.bowling && Date.now() - lastAttempt > 3000) {
      lastAttempt = Date.now();
      const box = await (await page.$('#btn-bowl-pitch')).boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await new Promise(resolve => setTimeout(resolve, 1200));
        await page.mouse.up();
      }
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  await page.waitForSelector('#match-summary-modal.active', { timeout: 1000 });
  for (const selector of ['#summary-player-tracker .mini-dot', '#summary-bot-tracker .mini-dot']) {
    if (await page.$$eval(selector, els => els.length) < 6) throw new Error(`Incomplete scorecard: ${selector}`);
  }
  await page.click('#btn-return-lobby');
  await page.waitForSelector('#screen-lobby.active');
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Browser match passed: two innings, scorecards and return to lobby.');
} finally {
  await browser?.close();
  await server.close();
}
