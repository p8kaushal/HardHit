import puppeteer from 'puppeteer';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });

  console.log('Navigating to lobby...');
  await page.goto('http://localhost:3002/');
  await page.waitForSelector('#btn-start-toss');

  console.log('Transitioning to Toss...');
  await page.click('#btn-start-toss');
  await page.waitForSelector('#btn-toss-heads');
  await page.click('#btn-toss-heads');
  await delay(4000); // Wait for toss resolution

  // Start Innings (Bowl First)
  console.log('Starting Innings 1...');
  const choiceVisible = await page.evaluate(() => {
    const buttons = document.getElementById('toss-choice-buttons');
    return buttons && !buttons.classList.contains('hidden');
  });

  if (choiceVisible) {
    await page.click('#btn-choice-bowl'); // Choose bowling first
  } else {
    await page.click('#btn-start-match');
  }

  await page.waitForSelector('#game-canvas');
  await delay(2500); // Let scene initialize

  // Deliver a ball (hold Spacebar to charge)
  console.log('Bowling ball...');
  await page.keyboard.down('Space');
  await delay(600);
  await page.keyboard.up('Space');
  
  // Wait 12 seconds for delivery, ball path, outcome toast, and auto-transition to next active turn
  await delay(12000);

  // Deliver 5 more balls to complete the over
  for (let i = 2; i <= 6; i++) {
    console.log(`Bowling ball ${i}...`);
    await page.keyboard.down('Space');
    await delay(600);
    await page.keyboard.up('Space');
    await delay(12000);
  }

  // Once Innings 1 is completed, Innings 2 starts.
  // In Innings 2, Bot delivers automatically. Let's just wait 45 seconds for the bot to finish its over
  console.log('Innings 2 started. Waiting for Bot to complete the over...');
  await delay(45000);

  // Check if summary modal is visible and take screenshot
  console.log('Capturing Post-Match Scorecard summary modal...');
  await page.screenshot({ path: '/Users/parthkaushal/.gemini/antigravity/brain/c44359f7-1851-4027-9928-1014993d5cee/post_match_scorecard.png' });

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
