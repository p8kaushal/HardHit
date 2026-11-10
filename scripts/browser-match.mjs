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
  if (process.argv.includes('--loft')) {
    // Read the live delivery clock in this isolated test page so host/browser
    // scheduling does not turn a deliberately well-timed swing into a late one.
    await page.evaluate(async () => {
      const game = await import('/src/game.ts');
      const formula = await import('/src/formula.ts');
      const clock = await import('/src/game-clock.ts');
      window.__loftReady = () => {
        const state = game.globalAutoAssistConfig;
        if (!state.isDeliveryActive || !state.currentDelivery || state.deliveryStartTime === undefined) return true;
        const ideal = formula.deliveryDurationMs(state.currentDelivery.type, state.currentDelivery.pace) * formula.batterContactProgress(state.currentDelivery) - 150;
        return clock.gameNow() - state.deliveryStartTime >= ideal;
      };
    });
  }
  await page.click('#btn-start-toss');
  // Force the toss only, then restore the seeded sequence.
  await page.evaluate(() => { window.__testRandom = Math.random; Math.random = () => 0; });
  await page.click('#btn-toss-heads');
  await page.waitForSelector('#toss-choice-buttons:not(.hidden)', { timeout: 5000 });
  await page.evaluate(() => { Math.random = window.__testRandom; delete window.__testRandom; });
  const batFirst = process.argv.includes('--bat-first');
  await page.click(batFirst ? '#btn-choice-bat' : '#btn-choice-bowl');
  const deadline = Date.now() + 240000;
  const swingDuringBatting = process.argv.includes('--swing');
  const loftDuringBatting = process.argv.includes('--loft');
  let lastAttempt = 0, lastState = '', swings = 0, selectedLoft = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      summary: document.querySelector('#match-summary-modal').classList.contains('active'),
      bowling: !document.querySelector('#control-bowling').classList.contains('hidden'),
      batting: !document.querySelector('#control-batting').classList.contains('hidden'),
      loftSelected: document.querySelector('#bat-type-group [data-val="lofted"]').classList.contains('active'),
      cue: !!document.querySelector('#hit-space-banner') && getComputedStyle(document.querySelector('#hit-space-banner')).display !== 'none',
      innings: document.querySelector('#hud-innings-title').textContent,
      balls: document.querySelector('#hud-balls-count').textContent,
      score: document.querySelector('#hud-score-count').textContent,
    }));
    const label = `${state.innings}: ${state.balls} score ${state.score}`;
    if (label !== lastState) { console.log(label); lastState = label; }
    if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    if (state.summary) break;
    if (loftDuringBatting && state.batting && !state.loftSelected) await page.keyboard.press('1');
    if (state.loftSelected && state.batting) selectedLoft = true;
    if (swingDuringBatting && state.cue) {
      if (loftDuringBatting) await page.waitForFunction(() => window.__loftReady(), { timeout: 2000 });
      await page.keyboard.press('Space');
      if (await page.$eval('#timing-widget', el => !el.classList.contains('hidden'))) swings++;
    }
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
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  await page.waitForSelector('#match-summary-modal.active', { timeout: 1000 });
  if (swingDuringBatting && !swings) throw new Error('No batting swing was triggered');
  if (loftDuringBatting) {
    if (!selectedLoft) throw new Error('Lofted shot was not selected');
    const six = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('#summary-player-tracker .mini-dot.six')];
      const noBallSixes = [...document.querySelectorAll('#summary-player-tracker .mini-dot.extra')].filter(el => el.textContent === 'NB6').length;
      const distances = markers.map(el => Number(el.title.match(/\(([\d.]+)m\)/)?.[1]));
      return {
        count: Number(document.querySelector('#summary-player-six-count').textContent),
        biggest: Number.parseFloat(document.querySelector('#summary-player-six').textContent),
        distances, noBallSixes
      };
    });
    if (!Number.isFinite(six.biggest) || (six.count === 0) !== (six.biggest === 0) || six.count !== six.distances.length + six.noBallSixes || six.distances.some(value => !Number.isFinite(value) || value > six.biggest + 0.01) || (!six.noBallSixes && six.distances.length > 0 && Math.abs(Math.max(...six.distances) - six.biggest) > 0.01)) {
      throw new Error(`Lofted six not recorded consistently: ${JSON.stringify(six)}`);
    }
    if (process.argv.includes('--require-six') && !six.count) throw new Error('No six was scored in this timing-sensitive run');
    console.log(`Lofted batting recorded ${six.count} six(es), biggest ${six.biggest.toFixed(1)}m.`);
  }
  for (const selector of ['#summary-player-tracker .mini-dot', '#summary-bot-tracker .mini-dot']) {
    if (await page.$$eval(selector, els => els.length) < 6) throw new Error(`Incomplete scorecard: ${selector}`);
    if (await page.$$eval(`${selector}:not(.extra)`, els => els.length) !== 6) throw new Error(`Incorrect legal-ball count: ${selector}`);
    const labelsMatch = await page.$$eval(selector, els => {
      let legal = 0;
      return els.every(el => {
        const correct = el.title.startsWith(`Ball ${legal + 1}:`);
        if (!el.classList.contains('extra')) legal++;
        return correct;
      });
    });
    if (!labelsMatch) throw new Error(`Incorrect ball labels on scorecard: ${selector}`);
  }
  if (process.argv.includes('--rematch')) {
    await page.click('#btn-rematch');
    await page.waitForSelector('#screen-toss.active');
    if (await page.$eval('#btn-toss-heads', el => el.disabled)) throw new Error('Rematch toss is disabled');
    await page.evaluate(() => { window.__testRandom = Math.random; Math.random = () => 0; });
    await page.click('#btn-toss-heads');
    await page.waitForSelector('#toss-choice-buttons:not(.hidden)', { timeout: 5000 });
    await page.evaluate(() => { Math.random = window.__testRandom; delete window.__testRandom; });
    await page.click('#btn-choice-bowl');
    await page.waitForSelector('#screen-gameplay.active');
    const fresh = await page.evaluate(() => ({
      balls: document.querySelector('#hud-balls-count').textContent,
      score: document.querySelector('#hud-score-count').textContent,
      wickets: document.querySelector('#hud-wickets-count').textContent,
      bowling: !document.querySelector('#control-bowling').classList.contains('hidden'),
    }));
    if (fresh.balls !== '0/6' || fresh.score !== '0' || fresh.wickets !== '0' || !fresh.bowling) {
      throw new Error(`Rematch did not start fresh: ${JSON.stringify(fresh)}`);
    }
    console.log('Browser match passed: two innings, scorecards and a fresh rematch.');
  } else {
    await page.click('#btn-return-lobby');
    await page.waitForSelector('#screen-lobby.active');
    console.log('Browser match passed: two innings, scorecards and return to lobby.');
  }
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
} finally {
  await browser?.close();
  await server.close();
}
