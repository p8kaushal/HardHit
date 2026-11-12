import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { GameScene } = await import('/src/scene.ts');
    const { globalAutoAssistConfig } = await import('/src/game.ts');
    const { deliveryContactPoint, BALL_RADIUS_METERS } = await import('/src/formula.ts');
    const swing = GameScene.prototype.animateBatterSwing;
    const setHand = GameScene.prototype.setBatterHandedness;
    const hit = GameScene.prototype.animateHitPath;
    const pick = GameScene.prototype.pickBowlingTarget;
    const animateDelivery = GameScene.prototype.animateDelivery;
    window.__bowlingSwings = [];
    window.__bowlingViews = [];
    window.__batterHands = [];
    window.__pitchPicks = 0;
    window.__practiceContacts = [];
    GameScene.prototype.animateDelivery = function (target, length, type, arrived, ...rest) {
      return animateDelivery.call(this, target, length, type, () => {
        const position = this.scene.getMeshByName('cricketBall').position;
        const expected = deliveryContactPoint(globalAutoAssistConfig.currentDelivery);
        window.__practiceContacts.push({ error: Math.hypot(position.x - expected.x, position.y - expected.y - (0.075 - BALL_RADIUS_METERS), position.z - expected.z), swung: this.hasBotSwung });
        arrived();
      }, ...rest);
    };
    GameScene.prototype.pickBowlingTarget = function (x, y) {
      window.__pitchPicks++;
      return pick.call(this, x, y);
    };
    GameScene.prototype.animateBatterSwing = function (direction, done, type, footwork) {
      window.__bowlingSwings.push({ direction, type });
      return swing.call(this, direction, done, type, footwork);
    };
    GameScene.prototype.setBatterHandedness = function (hand) {
      window.__batterHands.push(hand);
      return setHand.call(this, hand);
    };
    GameScene.prototype.animateHitPath = function (distance, direction, velocity, fixedView) {
      window.__bowlingViews.push(fixedView);
      return hit.call(this, distance, direction, velocity, fixedView);
    };
  });
  const before = await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') }));
  await page.click('#btn-playzone');
  await page.select('#playzone-mode', 'bowling');
  await page.click('#playzone-bot-controls summary');
  await page.click('#playzone-display-settings summary');
  await page.click('#playzone-follow-ball');
  await page.mouse.click(640, 400);
  assert.equal(await page.evaluate(() => window.__pitchPicks), 1, 'clicking the 3D pitch should pick a target');
  assert.equal(await page.$eval('#playzone-batting-controls', element => element.hidden), true);
  assert.equal(await page.$eval('#playzone-bot-controls', element => element.hidden), false);
  assert.equal(await page.$eval('#playzone-repeat-control', element => getComputedStyle(element).display), 'none');
  await page.select('#playzone-batter-hand', 'LHB');
  await page.select('#playzone-batter-difficulty', 'Hard');
  await page.select('#playzone-batter-style', 'defensive');
  await page.select('#playzone-type', 'offspin');
  await page.select('#playzone-line', 'off');
  await page.select('#playzone-length', 'full');
  const map = await (await page.$('#playzone-pitch-map')).boundingBox();
  await page.mouse.click(map.x + map.width * 0.7, map.y + map.height * 0.31);
  assert.equal(await page.$eval('#playzone-line', element => element.value), 'off');
  assert.equal(await page.$eval('#playzone-length', element => element.value), 'full');
  const intended = { x: -0.6, z: -8.2 + 0.31 * 8.7 };
  await page.select('#playzone-side', 'around');
  await page.$eval('#playzone-pace', element => { element.value = '60'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#playzone-spin', element => { element.value = '80'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), false);
  assert.equal(await page.$eval('#playzone-swing-control', element => element.hidden), true);
  await page.evaluate(() => { window.__oldBowlingRandom = Math.random; Math.random = () => 0.25; });
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('RUN-UP'));
  assert.equal(await page.$eval('#playzone-line', element => element.disabled), true);
  const lockedMarker = await page.$eval('#playzone-map-marker', element => element.style.cssText);
  await page.mouse.click(map.x + map.width * 0.2, map.y + map.height * 0.8);
  assert.equal(await page.$eval('#playzone-map-marker', element => element.style.cssText), lockedMarker, 'aim must stay locked during run-up');
  await page.waitForFunction(() => Number(document.querySelector('#playzone-release-meter').getAttribute('aria-valuenow')) >= 45, { timeout: 5000 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('BALL LIVE'));
  const actual = await page.evaluate(async () => ({ delivery: (await import('/src/game.ts')).globalAutoAssistConfig.currentDelivery, hand: window.__batterHands.at(-1) }));
  assert.equal(actual.hand, 'LHB');
  assert.equal(actual.delivery.type, 'offspin');
  assert.equal(actual.delivery.line, 'off');
  assert.ok(actual.delivery.aimTarget.x < 0, 'off-side target must mirror for left-hand batters');
  assert.equal(actual.delivery.overTheWicket, false);
  assert.equal(actual.delivery.turn, 0.8);
  assert.equal(actual.delivery.swing, 0);
  assert.equal(actual.delivery.pace, 0.6);
  assert.ok(actual.delivery.releaseTiming >= 0.4 && actual.delivery.releaseTiming <= 0.65);
  const expectedTarget = await page.evaluate(async ({ intended, timing }) => {
    const { bowlingExecutionTarget } = await import('/src/formula.ts');
    const { getOrCreatePlayer } = await import('/src/game.ts');
    return bowlingExecutionTarget(intended, timing, getOrCreatePlayer().stats.bowling.accuracy);
  }, { intended, timing: actual.delivery.releaseTiming });
  assert.ok(Math.abs(actual.delivery.aimTarget.x - expectedTarget.x) < 0.03 && Math.abs(actual.delivery.aimTarget.z - expectedTarget.z) < 0.03, 'delivery must use the precise map target');
  await page.waitForFunction(() => window.__bowlingSwings.length > 0, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__bowlingSwings.at(-1).type), 'defensive');
  await page.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('READY'), { timeout: 30000 });
  const contacts = await page.evaluate(() => window.__practiceContacts);
  assert.equal(contacts.length, 1);
  assert.ok(contacts[0].error < 1e-6 && contacts[0].swung, `spin practice contact mismatch: ${JSON.stringify(contacts)}`);
  assert.match(await page.$eval('#playzone-score', element => element.textContent), actual.delivery.frontFootHeel >= 0 ? /0 balls/ : /1 balls/);
  const expectedTiming = await page.evaluate(async delivery => {
    const { botChooseShot } = await import('/src/bot.ts');
    const { createBotPlayer, getOrCreatePlayer } = await import('/src/game.ts');
    const { battingTimingFeedback } = await import('/src/batting-timing.ts');
    const expected = botChooseShot({ ...createBotPlayer('Hard'), batterHand: 'LHB' }, getOrCreatePlayer(), delivery, 'Hard');
    return battingTimingFeedback(expected.timing).offsetMs;
  }, actual.delivery);
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), new RegExp(`\\(${expectedTiming} ms\\)`), 'Hard bot timing should be used');
  assert.deepEqual(await page.evaluate(() => window.__bowlingViews), [false], 'bowling practice should follow the hit ball');
  const outcome = await page.$eval('#playzone-feedback', element => element.textContent);
  await page.click('#playzone-show-outcome');
  assert.equal(await page.$eval('#playzone-feedback', element => element.textContent), 'Delivery complete.');
  await page.click('#playzone-show-outcome');
  assert.equal(await page.$eval('#playzone-feedback', element => element.textContent), outcome);
  await page.evaluate(() => { Math.random = window.__oldBowlingRandom; delete window.__oldBowlingRandom; });
  await page.select('#playzone-type', 'fast');
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), true);
  assert.equal(await page.$eval('#playzone-swing-control', element => element.hidden), false);
  await page.evaluate(() => document.activeElement.blur());
  const scoreBeforeCancel = await page.$eval('#playzone-score', element => element.textContent);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('RUN-UP'));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space');
  assert.match(await page.$eval('#playzone-phase', element => element.textContent), /READY/);
  assert.equal(await page.$eval('#playzone-score', element => element.textContent), scoreBeforeCancel);
  await page.select('#playzone-mode', 'delivery');
  assert.equal(await page.$eval('#playzone-bot-controls', element => element.hidden), true);
  assert.equal(await page.$eval('#playzone-batting-controls', element => element.hidden), false);
  await page.select('#playzone-mode', 'bowling');
  assert.equal(await page.$eval('#playzone-bot-controls', element => element.open), false, 'opponent settings should collapse on re-entry');
  await page.click('#playzone-exit');
  const after = await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') }));
  assert.deepEqual(after, before);
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 667, height: 300, isMobile: true, hasTouch: true });
  await mobile.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await mobile.click('#btn-playzone');
  await mobile.select('#playzone-mode', 'bowling');
  for (const viewport of [{ width: 667, height: 300 }, { width: 568, height: 240 }]) {
    await mobile.setViewport({ ...viewport, isMobile: true, hasTouch: true });
    for (const selector of ['#playzone-mode', '#playzone-line', '#playzone-length', '#playzone-pitch-map', '#playzone-type', '#playzone-pace', '#playzone-swing-amount', '#playzone-side', '#playzone-bot-controls summary', '#playzone-display-settings summary']) {
    const state = await mobile.$eval(selector, element => {
      const rect = element.getBoundingClientRect();
      const panel = element.closest('.playzone-panel').getBoundingClientRect();
      return { within: rect.top >= panel.top && rect.bottom <= panel.bottom && rect.left >= panel.left && rect.right <= panel.right, reachable: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element };
    });
      assert.ok(state.within && state.reachable, `${viewport.width}×${viewport.height} ${selector} must be reachable without scrolling: ${JSON.stringify(state)}`);
    }
  }
  await mobile.setViewport({ width: 667, height: 300, isMobile: true, hasTouch: true });
  await mobile.tap('#playzone-bot-controls summary');
  await mobile.tap('#playzone-display-settings summary');
  const button = await (await mobile.$('#playzone-bowl-action')).boundingBox();
  assert.ok(button && button.x >= 0 && button.y >= 0 && button.x + button.width <= 667 && button.y + button.height <= 300);
  const meter = await (await mobile.$('#playzone-release-meter')).boundingBox();
  assert.ok(meter && meter.x >= 0 && meter.y >= 0 && meter.x + meter.width <= 667 && meter.y + meter.height <= 300, 'release meter must remain visible');
  for (const selector of ['#playzone-batter-style', '#playzone-batter-difficulty', '#playzone-batter-hand', '#playzone-side', '#playzone-follow-ball', '#playzone-show-outcome', '#playzone-pitch-map']) {
    const reachable = await mobile.$eval(selector, element => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element;
    });
    assert.ok(reachable, `${selector} must be reachable`);
  }
  await mobile.$eval('#playzone-pitch-map', element => element.scrollIntoView({ block: 'center' }));
  const markerBeforeTouch = await mobile.$eval('#playzone-map-marker', element => element.style.cssText);
  const mobileMap = await (await mobile.$('#playzone-pitch-map')).boundingBox();
  await mobile.touchscreen.tap(mobileMap.x + mobileMap.width * 0.8, mobileMap.y + mobileMap.height * 0.2);
  assert.notEqual(await mobile.$eval('#playzone-map-marker', element => element.style.cssText), markerBeforeTouch, 'touch should move the map marker');
  const mapTouchMarker = await mobile.$eval('#playzone-map-marker', element => element.style.cssText);
  await mobile.touchscreen.tap(333, 120);
  assert.notEqual(await mobile.$eval('#playzone-map-marker', element => element.style.cssText), mapTouchMarker, 'touching the pitch should move the marker');
  await mobile.tap('#playzone-bowl-action');
  await mobile.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('BALL LIVE'), { timeout: 5000 });
  await mobile.click('#playzone-exit');
  await mobile.close();
  console.log('Bowling practice passed: bot settings, handedness, shot style, spin, side, release, cancellation, isolation and touch.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
