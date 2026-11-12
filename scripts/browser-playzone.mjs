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
    const original = GameScene.prototype.animateHitPath;
    window.__practiceShots = [];
    GameScene.prototype.animateHitPath = function (distance, direction, velocity, fixedView) {
      const ball = this.scene.getMeshByName('cricketBall');
      const startX = ball.position.x;
      const record = { direction, velocity, fixedView, displacementX: null };
      window.__practiceShots.push(record);
      setTimeout(() => { record.displacementX = ball.position.x - startX; }, 250);
      return original.call(this, distance, direction, velocity, fixedView);
    };
  });
  const before = await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') }));
  await page.click('#btn-playzone');
  await page.waitForSelector('#screen-playzone.active');
  await page.setViewport({ width: 600, height: 900 });
  assert.equal(await page.$eval('#screen-playzone .rotate-hint', element => getComputedStyle(element).display), 'none', 'Desktop portrait must not show the rotation prompt');
  const desktopClock = await page.evaluate(async () => (await import('/src/game-clock.ts')).gameNow());
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(await page.evaluate(async start => (await import('/src/game-clock.ts')).gameNow() - start, desktopClock) > 50, 'Desktop portrait must not pause gameplay');
  await page.setViewport({ width: 1280, height: 800 });
  await page.waitForFunction(() => document.querySelector('#game-canvas').dataset.batterModel === 'skinned', { timeout: 10000 });
  await page.click('#playzone-swing');
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), /Previewing grounded/);
  await page.select('#playzone-shot', 'lofted');
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), /Previewing lofted/);
  await page.select('#playzone-direction', '2');
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), /Point/);
  for (const shot of ['defensive', 'grounded', 'lofted', 'power']) {
    await page.select('#playzone-shot', shot);
    assert.match(await page.$eval('#playzone-feedback', element => element.textContent), new RegExp(`Previewing ${shot}`));
    assert.equal(await page.$eval(`[data-practice-shot="${shot}"]`, button => button.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$$eval('[data-practice-shot][aria-pressed="true"]', buttons => buttons.length), 1);
  }
  for (const direction of ['left', 'right', 'forward', 'back']) await page.click(`[data-practice-move="${direction}"]`);
  await page.click('[data-practice-footwork="back_foot"]');
  assert.equal(await page.$eval('[data-practice-footwork="back_foot"]', button => button.getAttribute('aria-pressed')), 'true');
  await page.click('[data-practice-footwork="front_foot"]');
  assert.equal(await page.$eval('[data-practice-footwork="front_foot"]', button => button.getAttribute('aria-pressed')), 'true');
  await page.select('#playzone-mode', 'delivery');
  const leftDock = await (await page.$('.practice-dock-left')).boundingBox();
  const rightDock = await (await page.$('.practice-dock-right')).boundingBox();
  assert.ok(leftDock && rightDock && leftDock.x + leftDock.width < rightDock.x, 'Practice controls should leave a clear area between the docks');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('2');
  assert.equal(await page.$eval('#playzone-shot', input => input.value), 'power');
  assert.equal(await page.$eval('[data-practice-shot="power"]', button => button.getAttribute('aria-pressed')), 'true');
  await page.keyboard.press('e');
  assert.equal(await page.$eval('[data-practice-footwork="back_foot"]', button => button.getAttribute('aria-pressed')), 'true');
  await page.keyboard.press('d');
  assert.equal(await page.$eval('#playzone-direction', input => input.value), '2');
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), true);
  await page.select('#playzone-type', 'offspin');
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), false);
  await page.$eval('#playzone-spin', input => { input.value = '80'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.$eval('#playzone-spin-value', output => output.textContent), '80%');
  await page.select('#playzone-length', 'short');
  await page.select('#playzone-line', 'off');
  await page.$eval('#playzone-pace', input => { input.value = '75'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#playzone-bowl');
  await page.waitForFunction(() => document.querySelector('#playzone-feedback').textContent.includes('running in'));
  await page.waitForFunction(() => document.querySelector('#playzone-feedback').textContent.includes('Ball incoming'));
  const configured = await page.evaluate(async () => (await import('/src/game.ts')).globalAutoAssistConfig.currentDelivery);
  assert.equal(configured.type, 'offspin');
  assert.equal(configured.line, 'off');
  assert.equal(configured.length, 'short');
  assert.equal(configured.pace, 0.75);
  assert.equal(configured.turn, 0.8);
  const spinDifference = await page.evaluate(async delivery => {
    const { sampleDeliveryPath } = await import('/src/formula.ts');
    return sampleDeliveryPath(delivery, 1).x - sampleDeliveryPath({ ...delivery, turn: 0 }, 1).x;
  }, configured);
  assert.ok(spinDifference < -0.1, `Spin should affect the delivery path: ${spinDifference}`);
  await page.waitForFunction(async () => {
    const game = await import('/src/game.ts');
    const formula = await import('/src/formula.ts');
    const clock = await import('/src/game-clock.ts');
    const state = game.globalAutoAssistConfig;
    return state.isDeliveryActive && clock.gameNow() - state.deliveryStartTime >= formula.deliveryDurationMs(state.currentDelivery.type, state.currentDelivery.pace) * formula.batterContactProgress(state.currentDelivery) - 150;
  }, { timeout: 5000 });
  await page.click('#playzone-swing');
  await page.waitForFunction(() => /EARLY|PERFECT|LATE/.test(document.querySelector('#playzone-feedback').textContent), { timeout: 3000 });
  await page.waitForFunction(() => /runs|Missed|Bowled|LBW/.test(document.querySelector('#playzone-feedback').textContent), { timeout: 30000 });
  assert.match(await page.$eval('#playzone-score', element => element.textContent), /1 balls/);
  await page.waitForFunction(() => window.__practiceShots[0]?.displacementX !== null && window.__practiceShots[0]?.displacementX !== undefined, { timeout: 3000 });
  const firstShot = await page.evaluate(() => window.__practiceShots[0]);
  assert.ok(firstShot && firstShot.direction === 2 && firstShot.velocity.x > 0 && firstShot.displacementX > 0 && firstShot.fixedView, `Right shot did not travel right: ${JSON.stringify(firstShot)}`);
  await page.click('#playzone-follow-ball');
  await page.click('#playzone-show-outcome');
  assert.equal(await page.$eval('#playzone-feedback', element => element.textContent), 'Delivery complete.');
  await page.select('#playzone-direction', '6');
  assert.match(await page.$eval('#practice-stick', element => element.getAttribute('aria-label')), /Left/);
  await page.click('#playzone-bowl');
  await page.waitForFunction(async () => {
    const game = await import('/src/game.ts');
    const formula = await import('/src/formula.ts');
    const clock = await import('/src/game-clock.ts');
    const state = game.globalAutoAssistConfig;
    return state.isDeliveryActive && clock.gameNow() - state.deliveryStartTime >= formula.deliveryDurationMs(state.currentDelivery.type, state.currentDelivery.pace) * formula.batterContactProgress(state.currentDelivery) - 150;
  }, { timeout: 7000 });
  await page.click('#playzone-swing');
  await page.waitForFunction(() => window.__practiceShots.length === 2, { timeout: 5000 });
  await page.waitForFunction(() => window.__practiceShots[1]?.displacementX !== null && window.__practiceShots[1]?.displacementX !== undefined, { timeout: 3000 });
  const secondShot = await page.evaluate(() => window.__practiceShots[1]);
  assert.ok(secondShot.direction === 6 && secondShot.velocity.x < 0 && secondShot.displacementX < 0 && !secondShot.fixedView, `Left shot did not travel left with follow camera: ${JSON.stringify(secondShot)}`);
  await page.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('READY'), { timeout: 30000 });
  assert.equal(await page.$eval('#playzone-feedback', element => element.textContent), 'Delivery complete.');
  await page.click('#playzone-show-outcome');
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), /runs/);
  if (!await page.$eval('#playzone-repeat', input => input.checked)) await page.click('#playzone-repeat');
  await page.waitForFunction(() => document.querySelector('#playzone-feedback').textContent.includes('Ball incoming'), { timeout: 10000 });
  const repeated = await page.evaluate(async () => (await import('/src/game.ts')).globalAutoAssistConfig.currentDelivery);
  assert.deepEqual(repeated, configured, 'manual repeat must reproduce the configured delivery');
  await page.select('#playzone-bowler-mode', 'simulated');
  await page.select('#playzone-difficulty', 'Hard');
  assert.equal(await page.$eval('#playzone-manual-options', element => element.hidden), true);
  assert.equal(await page.$eval('#playzone-simulated-options', element => element.hidden), false);
  await page.waitForFunction(async () => (await import('/src/game.ts')).globalAutoAssistConfig.isDeliveryActive, { timeout: 10000 });
  const simulatedHard = await page.evaluate(async () => {
    const state = (await import('/src/game.ts')).globalAutoAssistConfig;
    window.__firstSimulatedDelivery = state.currentDelivery;
    return state.currentDelivery;
  });
  assert.equal(simulatedHard.type, 'fast', 'Hard should use the match Hard bot');
  await page.select('#playzone-difficulty', 'Rookie');
  await page.waitForFunction(async () => {
    const state = (await import('/src/game.ts')).globalAutoAssistConfig;
    return state.isDeliveryActive && state.currentDelivery !== window.__firstSimulatedDelivery;
  }, { timeout: 20000 });
  const simulatedRookie = await page.evaluate(async () => (await import('/src/game.ts')).globalAutoAssistConfig.currentDelivery);
  assert.equal(simulatedRookie.type, 'slow', 'changed difficulty should apply on the next ball');
  await page.select('#playzone-bowler-mode', 'manual');
  assert.equal(await page.$eval('#playzone-manual-options', element => element.hidden), false);
  assert.equal(await page.$eval('#playzone-simulated-options', element => element.hidden), true);
  await page.select('#playzone-type', 'fast');
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), true);
  await page.select('#playzone-type', 'legspin');
  assert.equal(await page.$eval('#playzone-spin-control', element => element.hidden), false);
  await page.select('#playzone-mode', 'free');
  assert.match(await page.$eval('#playzone-feedback', element => element.textContent), /Choose a shot/);
  await page.click('#playzone-exit');
  await page.waitForSelector('#screen-lobby.active');
  const after = await page.evaluate(() => ({ player: localStorage.getItem('six_hitting_contest_player'), board: localStorage.getItem('six_hitting_contest_leaderboard') }));
  assert.deepEqual(after, before);
  await page.click('#btn-playzone');
  await page.waitForSelector('#screen-playzone.active');
  await page.click('#playzone-exit');
  await page.click('#btn-start-toss');
  await page.waitForSelector('#screen-toss.active');
  await page.evaluate(() => { Math.random = () => 0; });
  await page.click('#btn-toss-heads');
  await page.waitForSelector('#btn-choice-bat', { visible: true });
  await page.click('#btn-choice-bat');
  await page.waitForSelector('#screen-gameplay.active');
  await page.waitForFunction(() => document.querySelector('#hud-balls-count').textContent.startsWith('1/'), { timeout: 20000 });
  assert.deepEqual(errors, []);
  const fallback = await browser.newPage();
  await fallback.setViewport({ width: 1280, height: 800 });
  await fallback.setRequestInterception(true);
  fallback.on('request', request => request.url().endsWith('/models/batter-human.glb') ? request.abort() : request.continue());
  await fallback.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await fallback.evaluate(async () => {
    const { GameScene } = await import('/src/scene.ts');
    const original = GameScene.prototype.setBatterHandedness;
    GameScene.prototype.setBatterHandedness = function (...args) { window.__fallbackScene = this; return original.apply(this, args); };
  });
  await fallback.click('#btn-playzone');
  await fallback.waitForFunction(() => document.querySelector('#game-canvas').dataset.batterModel === 'fallback', { timeout: 10000 });
  await fallback.evaluate(() => {
    const rig = window.__fallbackScene.batterRig, vector = rig.joints.leftShoulder.position.clone();
    rig.applyTrackingPose({ leftShoulder: vector.set(0, 0, 0) }, { leftShoulder: vector.clone().set(1, 0, 0) });
  });
  await fallback.waitForFunction(() => {
    const rig = window.__fallbackScene.batterRig;
    rig.joints.leftShoulder.computeWorldMatrix(true); rig.joints.leftElbow.computeWorldMatrix(true);
    return rig.joints.leftElbow.getAbsolutePosition().subtract(rig.joints.leftShoulder.getAbsolutePosition()).normalize().x > .98;
  });
  await fallback.click('#playzone-camera-settings summary');
  await fallback.click('#playzone-pose-xray');
  await fallback.waitForFunction(() => {
    const scene = window.__fallbackScene.scene, marker = scene.getMeshByName('poseXray_leftElbow'), joint = window.__fallbackScene.batterRig.joints.leftElbow;
    joint.computeWorldMatrix(true);
    return marker?.isEnabled() && marker.position.subtract(joint.getAbsolutePosition()).length() < .03;
  });
  await fallback.evaluate(() => window.__fallbackScene.setBatterHandedness('RHB'));
  assert.equal(await fallback.evaluate(() => window.__fallbackScene.batterRig.joints.leftShoulder.rotationQuaternion), null);
  await fallback.click('#playzone-swing');
  assert.match(await fallback.$eval('#playzone-feedback', element => element.textContent), /Previewing grounded/);
  await fallback.close();
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 667, height: 300, isMobile: true, hasTouch: true });
  await mobile.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  await mobile.click('#btn-playzone');
  for (const shot of ['defensive', 'grounded', 'lofted', 'power']) {
    await mobile.tap(`[data-practice-shot="${shot}"]`);
    assert.match(await mobile.$eval('#playzone-feedback', element => element.textContent), new RegExp(`Previewing ${shot}`));
    assert.equal(await mobile.$eval('#playzone-shot', input => input.value), shot);
    assert.equal(await mobile.$eval(`[data-practice-shot="${shot}"]`, button => button.getAttribute('aria-pressed')), 'true');
    assert.equal(await mobile.$$eval('[data-practice-shot][aria-pressed="true"]', buttons => buttons.length), 1);
  }
  await mobile.select('#playzone-mode', 'delivery');
  await mobile.select('#playzone-type', 'legspin');
  const stickBox = await (await mobile.$('#practice-stick')).boundingBox();
  await mobile.mouse.move(stickBox.x + stickBox.width * 0.85, stickBox.y + stickBox.height * 0.5);
  await mobile.mouse.down();
  await mobile.mouse.up();
  assert.equal(await mobile.$eval('#playzone-direction', select => select.value), '2', 'touch aim must update the direction selector');
  await mobile.select('#playzone-direction', '6');
  for (const selector of ['#playzone-bowler-mode', '#playzone-type', '#playzone-line', '#playzone-length', '#playzone-pace', '#playzone-spin', '#playzone-repeat', '#playzone-shot', '#playzone-direction', '[data-practice-footwork="back_foot"]']) {
    const reachable = await mobile.$eval(selector, element => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    });
    assert.ok(reachable, `${selector} must be reachable without another control covering it`);
  }
  for (const selector of ['#practice-stick', '[data-practice-shot="grounded"]', '#playzone-bowl', '[data-practice-move="right"]']) {
    const box = await (await mobile.$(selector)).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 667 && box.y + box.height <= 300, `${selector} must be visible within the viewport`);
  }
  await mobile.tap('#playzone-bowl');
  await mobile.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('RUN-UP'), { timeout: 3000 });
  await mobile.waitForFunction(() => document.querySelector('#playzone-phase').textContent.includes('BALL LIVE'), { timeout: 5000 });
  await mobile.tap('[data-practice-shot="power"]');
  assert.match(await mobile.$eval('#playzone-feedback', element => element.textContent), /On-side sweep/);
  await mobile.select('#playzone-bowler-mode', 'simulated');
  const difficultyReachable = await mobile.$eval('#playzone-difficulty', element => {
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element;
  });
  assert.ok(difficultyReachable, 'simulated bowler difficulty must be reachable on touch screens');
  await mobile.click('#playzone-exit');
  await mobile.close();
  console.log('Playzone browser check passed: free swing, practice delivery, repeat, cancellation, re-entry, match entry and storage isolation.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
