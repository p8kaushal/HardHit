import { createServer } from 'vite';
import puppeteer from 'puppeteer';

// This smoke test owns its temporary server and browser; it never uses an existing game session.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  browser = await puppeteer.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url ?? ''}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#screen-lobby.active');
  await page.click('#btn-start-toss');
  await page.waitForSelector('#screen-toss.active');
  await page.click('#btn-toss-heads');
  await page.waitForSelector('#toss-result-message:not(.hidden)', { timeout: 5000 });
  const won = await page.$eval('#toss-choice-buttons', el => !el.classList.contains('hidden'));
  await page.click(won ? '#btn-choice-bat' : '#btn-start-match');
  await page.waitForSelector('#screen-gameplay.active');
  await page.waitForSelector('#game-canvas');
  // Give initialization and the first render a chance to report errors.
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Browser smoke passed: lobby → toss → gameplay (1024×768, headless Chromium).');
} finally {
  await browser?.close();
  await server.close();
}
