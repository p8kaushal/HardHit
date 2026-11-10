import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';

// This smoke test owns its temporary server and browser; it never uses an existing game session.
const production = process.argv.includes('--preview');
let server;
let browser;
try {
  if (production) {
    server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0, open: false } });
  } else {
    server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
    await server.listen();
  }
  const address = server.httpServer.address();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const viewport of [{ width: 568, height: 240 }, { width: 667, height: 300 }, { width: 1024, height: 768 }]) {
    for (const role of ['bat', 'bowl']) {
      const page = await browser.newPage();
      await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url ?? ''}`); });
      page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
      await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#screen-lobby.active');
      await page.click('#btn-start-toss');
      await page.waitForSelector('#screen-toss.active');
      // Force only the toss in the test browser so each control layout is reachable.
      await page.evaluate(() => { window.__smokeRandom = Math.random; Math.random = () => 0; });
      await page.click('#btn-toss-heads');
      await page.waitForSelector('#toss-choice-buttons:not(.hidden)', { timeout: 5000 });
      await page.evaluate(() => { Math.random = window.__smokeRandom; delete window.__smokeRandom; });
      await page.click(`#btn-choice-${role}`);
      await page.waitForSelector('#screen-gameplay.active');
      const selectors = role === 'bat'
        ? ['#touch-stick', '.touch-batting-controls .batter-movement-grid [data-batter-move="left"]', '.touch-batting-controls .batter-movement-grid [data-batter-move="right"]', '.touch-batting-controls .footwork-control [data-footwork="front_foot"]', '.touch-batting-controls .footwork-control [data-footwork="back_foot"]', ...['lofted', 'grounded', 'power', 'defensive'].map(shot => `.touch-shot[data-shot="${shot}"]`)]
        : ['#bowling-pitch-map', '#bowl-line-group button', '#bowl-length-group button', '#bowl-side-group button', '#bowl-type-group button', '#bowl-pace', '#bowl-swing', '#btn-bowl-pitch'];
      const issues = await page.evaluate(selectors => selectors.flatMap(selector => {
        const elements = [...document.querySelectorAll(selector)];
        if (!elements.length) return [`${selector}: missing`];
        return elements.map(el => {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (!rect.width || !rect.height || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight || !(hit === el || el.contains(hit))) {
          return `${selector}: ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} (hit ${hit?.id || hit?.className || 'none'})`;
        }
        return null;
        }).filter(Boolean);
      }), selectors);
      if (issues.length) throw new Error(`${viewport.width}×${viewport.height} ${role}:\n${issues.join('\n')}`);
      if (role === 'bowl') {
        const beforeAim = await page.$eval('#bowling-map-marker', el => el.style.left);
        await page.focus('#bowl-pace');
        const beforePace = await page.$eval('#bowl-pace', el => el.valueAsNumber);
        await page.keyboard.press('ArrowLeft');
        const afterPace = await page.$eval('#bowl-pace', el => el.valueAsNumber);
        const afterAim = await page.$eval('#bowling-map-marker', el => el.style.left);
        if (beforePace === afterPace || beforeAim !== afterAim) throw new Error('Pace slider keyboard input changed bowling aim or failed to adjust pace');
        await page.keyboard.press('4');
        if (!await page.$eval('#bowl-type-group [data-val="fast"]', el => el.classList.contains('active'))) throw new Error('Slider keyboard input changed delivery type');
        await page.$eval('#bowl-pace', el => el.blur());
        await page.click('#bowl-side-group [data-side="around"]');
        if (await page.$eval('#bowl-side-group [data-side="around"]', el => el.getAttribute('aria-pressed')) !== 'true') throw new Error('Bowling side did not change');
        await page.click('#bowl-type-group [data-val="offspin"]');
        const spinControls = await page.evaluate(() => ({
          turn: !document.querySelector('#bowl-turn-control').classList.contains('hidden'),
          swing: !document.querySelector('#bowl-swing-control').classList.contains('hidden'),
          pace: document.querySelector('#bowl-pace').getBoundingClientRect().height > 0,
        }));
        if (!spinControls.turn || spinControls.swing || !spinControls.pace) throw new Error(`Incorrect spin controls: ${JSON.stringify(spinControls)}`);
        await page.click('#bowl-type-group [data-val="fast"]');
        if (await page.$eval('#bowl-swing-control', el => el.classList.contains('hidden'))) throw new Error('Swing control did not return for pace');
        if (viewport.width === 667) {
          const beforeRotation = await (await page.$('#btn-bowl-pitch')).boundingBox();
          await page.mouse.move(beforeRotation.x + beforeRotation.width / 2, beforeRotation.y + beforeRotation.height / 2);
          await page.mouse.down();
          await page.waitForSelector('#bowler-runup-indicator');
          await page.setViewport({ width: 300, height: 667, isMobile: true, hasTouch: true });
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.rotate-hint')).display !== 'none');
          await page.waitForFunction(() => !document.querySelector('#bowler-runup-indicator'));
          await page.mouse.up();
          await page.setViewport({ ...viewport, isMobile: true, hasTouch: true });
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.rotate-hint')).display === 'none');
          await new Promise(resolve => setTimeout(resolve, 800));
          if (await page.$('#over-tracker .over-dot:not(.upcoming)')) throw new Error('Rotation released an unintended delivery');
        }
        if (viewport.width === 1024) {
          await page.focus('#btn-bowl-pitch');
          await page.keyboard.down('Enter');
          await new Promise(resolve => setTimeout(resolve, 300));
          await page.keyboard.up('Enter');
        } else {
          const release = await page.$('#btn-bowl-pitch');
          const box = await release.boundingBox();
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        }
        await page.waitForSelector('#over-tracker .over-dot:not(.upcoming)', { timeout: 30000 });
        if (viewport.width === 667) {
          await page.waitForFunction(() => {
            const button = document.querySelector('#btn-bowl-pitch');
            return button && button.getBoundingClientRect().width > 0;
          }, { timeout: 30000 });
          const before = await page.$$eval('#over-tracker .over-dot:not(.upcoming)', els => els.length);
          const box = await (await page.$('#btn-bowl-pitch')).boundingBox();
          const client = await page.createCDPSession();
          const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await page.waitForSelector('#bowler-runup-indicator');
          const visible = await page.$eval('#btn-bowl-pitch', el => ({
            width: el.getBoundingClientRect().width,
            select: getComputedStyle(el).webkitUserSelect,
            touch: getComputedStyle(el).touchAction,
          }));
          if (!visible.width || visible.select !== 'none' || visible.touch !== 'none') throw new Error(`Hold control unavailable or selectable: ${JSON.stringify(visible)}`);
          await new Promise(resolve => setTimeout(resolve, 600));
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForFunction(count => document.querySelectorAll('#over-tracker .over-dot:not(.upcoming)').length > count, { timeout: 30000 }, before);
          await page.waitForFunction(() => !document.querySelector('#bowler-runup-indicator'));
          await client.detach();
        }
      } else {
        // The beginner's prompt is a visible cue for exercising a real batting input.
        if (viewport.width === 1024) await page.focus('.touch-shot[data-shot="lofted"]');
        await page.waitForFunction(() => {
          const cue = document.querySelector('#hit-space-banner');
          return cue && getComputedStyle(cue).display !== 'none';
        }, { timeout: 30000 });
        if (await page.$eval('#hit-space-banner', el => el.textContent) !== 'TAP A SHOT') throw new Error('Touch batting prompt is incorrect');
        if (viewport.width === 667) await page.click('.touch-shot[data-shot="lofted"]');
        else await page.keyboard.press('Space');
        await page.waitForSelector('#timing-widget:not(.hidden)', { timeout: 3000 });
        await page.waitForSelector('#over-tracker .over-dot:not(.upcoming)', { timeout: 30000 });
      }
      if (errors.length) throw new Error(`${viewport.width}×${viewport.height} ${role} browser errors:\n${errors.join('\n')}`);
      await page.close();
      console.log(`${production ? 'Production preview' : 'Browser'} smoke passed: ${viewport.width}×${viewport.height} ${role} controls and first delivery`);
    }
  }
} finally {
  await browser?.close();
  if (production && server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  else await server?.close();
}
