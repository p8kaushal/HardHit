const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:5173');
  
  console.log("Navigated to game.");
  
  await page.waitForFunction(() => !!window.gameApp);
  
  // Force a difficulty if needed
  await page.evaluate(() => {
    document.getElementById('btn-play').click();
  });
  
  console.log("Clicked Play Match");
  
  await page.evaluate(() => {
    return new Promise(resolve => {
       let ballsBowled = 0;
       let playBatting = setInterval(() => {
         const match = window.gameApp.match;
         if (match.state.currentInningsIndex === 1 || match.state.status === 'completed') {
           clearInterval(playBatting);
           resolve();
           return;
         }
         
         const isBatting = match.getCurrentInnings()?.batter.id === match.state.player.id;
         // Try to hit when z < 0 or so
         if (isBatting && window.gameApp.sceneManager.isAnimatingBall) {
            const ballMesh = window.gameApp.sceneManager.ballMesh;
            if (ballMesh && ballMesh.position.z > 6.0 && ballMesh.position.z < 9.5) {
               window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' '}));
               setTimeout(() => {
                 window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' '}));
               }, 50);
            }
         }
       }, 50);
    });
  });
  
  console.log("Batting phase done. Waiting for transition to finish...");
  await page.waitForTimeout(3000); // Wait for transition overlay to clear
  
  const metrics = await page.evaluate(() => {
     const scene = window.gameApp.sceneManager;
     const cam = scene.primaryCamera;
     const batter = scene.batterRoot;
     const match = window.gameApp.match;
     return {
       camZ: cam.position.z,
       batterZ: batter ? batter.position.z : null,
       currentInningsIndex: match.state.currentInningsIndex,
       status: match.state.status
     };
  });
  console.log("METRICS AFTER INNINGS 1:", metrics);
  
  // Play bowling phase
  console.log("Starting bowling phase");
  await page.evaluate(() => {
    return new Promise(resolve => {
       let playBowling = setInterval(() => {
         const match = window.gameApp.match;
         if (match.state.status === 'completed') {
           clearInterval(playBowling);
           resolve();
           return;
         }
         
         const isBowling = match.getCurrentInnings()?.bowler.id === match.state.player.id;
         if (isBowling && !window.gameApp.sceneManager.isAnimatingBall && !window.gameApp.match.globalAutoAssistConfig?.isBallInPlay) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' '}));
            setTimeout(() => {
              window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' '}));
            }, 50);
         }
       }, 500);
    });
  });
  
  const endMetrics = await page.evaluate(() => {
     return {
       status: window.gameApp.match.state.status
     };
  });
  console.log("END STATUS:", endMetrics);

  await browser.close();
})();
