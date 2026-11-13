import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';

// Seed only the isolated test page; production randomness and game timing are unchanged.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, ...(process.env.HARDHIT_BROWSER_PROFILE ? { userDataDir: process.env.HARDHIT_BROWSER_PROFILE } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    let seed = 12345;
    window.__HARDHIT_MATCH_SEED = 12345;
    Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${msg.text()} ${msg.location().url ?? ''}`); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle0' });
  const noBallFixture = process.argv.includes('--fixture-noball');
  const pauseVisibility = process.argv.includes('--pause-visibility');
  const pauseRotation = process.argv.includes('--pause-rotation');
  const botBatsFast = process.argv.includes('--bot-bats-fast');
  const botBatsSpin = process.argv.includes('--bot-bats-spin');
  const fixtureWide = process.argv.includes('--fixture-wide');
  const verifyReplay = process.argv.includes('--verify-replay');
  if ([botBatsFast, botBatsSpin, fixtureWide].filter(Boolean).length > 1) throw new Error('Choose only one bot batting delivery override');
  const pauseFlight = process.argv.includes('--pause-flight') || pauseVisibility || pauseRotation;
  if (pauseRotation && pauseVisibility) throw new Error('Choose either --pause-rotation or --pause-visibility');
  if (noBallFixture && !['--trace-shots', '--swing', '--loft', '--square'].every(flag => process.argv.includes(flag))) {
    throw new Error('--fixture-noball requires --trace-shots --swing --loft --square');
  }
  if (process.argv.includes('--require-miss') && (!process.argv.includes('--trace-shots') || !process.argv.includes('--loft') || process.argv.includes('--swing'))) {
    throw new Error('--require-miss requires --trace-shots --loft and no --swing');
  }
  if (pauseFlight && !['--trace-shots', '--swing', '--loft', '--square'].every(flag => process.argv.includes(flag))) {
    throw new Error('--pause-flight requires --trace-shots --swing --loft --square');
  }
  if (pauseRotation) {
    await page.exposeFunction('__setMatchPortrait', async portrait => {
      await page.setViewport({ width: portrait ? 390 : 1024, height: portrait ? 844 : 768, isMobile: true, hasTouch: true });
      await page.waitForFunction(async expected => {
        const { isGamePaused } = await import('/src/game-clock.ts');
        return matchMedia('(orientation: portrait)').matches === expected && isGamePaused() === expected;
      }, { timeout: 5000 }, portrait);
    });
  }
  await page.evaluate(async ({ traceShots, noBallFixture, pauseFlight, pauseVisibility, pauseRotation, botBatsFast, botBatsSpin, fixtureWide }) => {
    const { GameScene } = await import('/src/scene.ts');
    const { UIManager } = await import('/src/ui.ts');
    const { globalAutoAssistConfig } = await import('/src/game.ts');
    const { MatchController } = await import('/src/game.ts');
    const { setGamePaused, isGamePaused } = await import('/src/game-clock.ts');
    const { deliveryContactPoint, BALL_RADIUS_METERS } = await import('/src/formula.ts');
    const animateDelivery = GameScene.prototype.animateDelivery;
    const deliverBall3D = UIManager.prototype.deliverBall3D;
    UIManager.prototype.deliverBall3D = function (...args) {
      const playerIsBowling = this.controller.getCurrentInnings().batter.id !== this.controller.state.player.id;
      if (playerIsBowling && this.activeDelivery) {
        if (botBatsFast) Object.assign(this.activeDelivery, { type: 'fast', pace: 0.95, turn: 0, swing: 0 });
        if (botBatsSpin) Object.assign(this.activeDelivery, { type: 'legspin', pace: 0.65, turn: 0.9, swing: 0 });
        if (fixtureWide && !window.__wideInjected) {
          Object.assign(this.activeDelivery, { aimTarget: { x: 1.65, z: -3.5 }, line: 'off', length: 'good', frontFootHeel: -0.1, swing: 0, turn: 0 });
          window.__wideInjected = true;
        }
        globalAutoAssistConfig.currentDelivery = this.activeDelivery;
      }
      if (!playerIsBowling && noBallFixture && !window.__noBallInjected && this.activeDelivery) {
        Object.assign(this.activeDelivery, { frontFootHeel: 0.01 });
        window.__noBallInjected = true;
        globalAutoAssistConfig.currentDelivery = this.activeDelivery;
      }
      return deliverBall3D.apply(this, args);
    };
    window.__matchContacts = [];
    window.__playerShotTrace = [];
    window.__matchReplay = [];
    let playerBatting = false;
    let playerController;
    window.__flightPause = null;
    const recordBall = MatchController.prototype.recordBall;
    MatchController.prototype.recordBall = function (delivery, shot) {
      const contact = window.__matchContacts.at(-1);
      const result = recordBall.call(this, delivery, shot);
      window.__matchReplay.push({
        batter: this.getCurrentInnings().batter.id,
        delivery: structuredClone(delivery),
        shot: structuredClone(shot),
        missed: result.missed,
        wicket: result.isWicket,
        wicketReason: result.wicketReason,
        extra: result.extraType,
        freeHit: result.isFreeHit,
        estimatedDistance: result.distance,
        resolved: false,
      });
      playerBatting = this.getCurrentInnings().batter.id === this.state.player.id;
      if (traceShots && playerBatting) {
        playerController = this;
        window.__playerShotTrace.push({ delivery: structuredClone(delivery), shot: structuredClone(shot), missed: result.missed, wicket: result.isWicket, reason: result.wicketReason, extra: result.extraType, freeHit: result.isFreeHit, estimatedDistance: result.distance });
      }
      if (contact && !contact.recorded) {
        contact.recorded = true;
        contact.shot = !!shot && !!result.shot;
      }
      return result;
    };
    const finalize = MatchController.prototype.finalizeBallOutcome;
    MatchController.prototype.finalizeBallOutcome = function (distance, bounced, reachedBoundary) {
      const playerBatting = this.getCurrentInnings().batter.id === this.state.player.id;
      const runs = finalize.call(this, distance, bounced, reachedBoundary);
      const replayEntry = window.__matchReplay.at(-1);
      if (replayEntry && !replayEntry.resolved) Object.assign(replayEntry, { resolved: true, flightDistance: distance, bounced, reachedBoundary, runs });
      if (traceShots && playerBatting) Object.assign(window.__playerShotTrace.at(-1), { flightDistance: distance, bounced, reachedBoundary, runs });
      return runs;
    };
    const animateHitPath = GameScene.prototype.animateHitPath;
    GameScene.prototype.animateHitPath = function (distance, direction, velocity, ...rest) {
      const result = animateHitPath.call(this, distance, direction, velocity, ...rest);
      const trace = window.__playerShotTrace.at(-1);
      if (traceShots && playerBatting && trace && !('launchVelocity' in trace)) {
        Object.assign(trace, { launchVelocity: velocity ? { ...velocity } : null, launchPosition: this.shotOrigin ? { x: this.shotOrigin.x, y: this.shotOrigin.y, z: this.shotOrigin.z } : null });
      }
      if (pauseFlight && playerBatting && window.__flightPause === null) {
        const innings = playerController.getCurrentInnings();
        const point = () => ({ x: this.shotPhysics.position.x, y: this.shotPhysics.position.y, z: this.shotPhysics.position.z });
        const origin = point();
        window.__flightPause = { origin };
        const pauseWhenMoving = async () => {
          const position = point();
          if (Math.hypot(position.x - origin.x, position.y - origin.y, position.z - origin.z) < 0.2 && globalAutoAssistConfig.isBallInPlay) {
            requestAnimationFrame(pauseWhenMoving);
            return;
          }
          if (pauseRotation) await window.__setMatchPortrait(true);
          else if (pauseVisibility) {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
          } else setGamePaused(true);
          const pending = document.querySelector('#over-tracker .pending');
          window.__flightPause.before = { position: point(), score: innings.score, runs: innings.balls.at(-1).runs, trackerText: pending?.textContent, trackerTitle: pending?.title };
          setTimeout(async () => {
            window.__flightPause.after = { position: point(), score: innings.score, runs: innings.balls.at(-1).runs, paused: isGamePaused() };
            if (pauseRotation) await window.__setMatchPortrait(false);
            else if (pauseVisibility) {
              delete document.hidden;
              document.dispatchEvent(new Event('visibilitychange'));
            } else setGamePaused(false);
          }, 600);
        };
        requestAnimationFrame(pauseWhenMoving);
      }
      return result;
    };
    GameScene.prototype.animateDelivery = function (target, length, type, arrived, ...rest) {
      return animateDelivery.call(this, target, length, type, () => {
        const position = this.scene.getMeshByName('cricketBall').position;
        const expected = deliveryContactPoint(globalAutoAssistConfig.currentDelivery);
        window.__matchContacts.push({ error: Math.hypot(position.x - expected.x, position.y - expected.y - (0.075 - BALL_RADIUS_METERS), position.z - expected.z), swung: this.hasBotSwung });
        arrived();
      }, ...rest);
    };
  }, { traceShots: process.argv.includes('--trace-shots'), noBallFixture, pauseFlight, pauseVisibility, pauseRotation, botBatsFast, botBatsSpin, fixtureWide });
  if (process.argv.includes('--force-tie')) {
    // Test-only fixture: make regular-innings deliveries legal dots so the
    // real UI must play both sudden-death innings. Production code is unchanged.
    await page.evaluate(async () => {
      const { MatchController } = await import('/src/game.ts');
      const record = MatchController.prototype.recordBall;
      MatchController.prototype.recordBall = function (delivery, shot) {
        if (this.state.tieBreakerActive) return record.call(this, delivery, shot);
        return record.call(this, { ...delivery, aimTarget: { x: 0.7, z: -3.5 }, type: 'fast', swing: 0, turn: 0, overTheWicket: undefined, frontFootHeel: -0.1 }, null);
      };
    });
  }
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
  const squareDuringBatting = process.argv.includes('--square');
  let lastAttempt = 0, lastState = '', swings = 0, selectedLoft = false, selectedSquare = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      summary: document.querySelector('#match-summary-modal').classList.contains('active'),
      bowling: !document.querySelector('#control-bowling').classList.contains('hidden'),
      batting: !document.querySelector('#control-batting').classList.contains('hidden'),
      loftSelected: document.querySelector('#bat-type-group [data-val="lofted"]').classList.contains('active'),
      squareSelected: document.querySelector('#aim-clock [data-val="2"]').classList.contains('active'),
      cue: !!document.querySelector('#hit-space-banner') && getComputedStyle(document.querySelector('#hit-space-banner')).display !== 'none',
      innings: document.querySelector('#hud-innings-title').textContent,
      balls: document.querySelector('#hud-balls-count').textContent,
      score: document.querySelector('#hud-score-count').textContent,
    }));
    const label = `${state.innings}: ${state.balls} score ${state.score}`;
    const counts = state.balls.match(/^(\d+)\/(\d+)$/);
    if (counts && Number(counts[1]) > Number(counts[2])) throw new Error(`Legal ball limit exceeded: ${label}`);
    if (label !== lastState) { console.log(label); lastState = label; }
    if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    if (state.summary) break;
    if (loftDuringBatting && state.batting && !state.loftSelected) await page.keyboard.press('1');
    if (squareDuringBatting && state.batting) await page.keyboard.press('d');
    if (state.loftSelected && state.batting) selectedLoft = true;
    if (state.squareSelected && state.batting) selectedSquare = true;
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
  if (verifyReplay) {
    const replay = await page.evaluate(async () => {
      const stored = JSON.parse(localStorage.getItem('six_hitting_contest_match_history') || 'null');
      const record = stored?.records?.[0];
      if (!record) throw new Error('Completed match was not persisted before replay');
      const { replayMatchRecord } = await import('/src/match-replay.ts');
      const replayed = replayMatchRecord(record);
      const inningsFor = batterId => {
        const innings = replayed.state.innings.find(item => item.batter.id === batterId);
        return innings ? { score: innings.score, wickets: innings.wicketsLost, legal: innings.ballsBowled } : null;
      };
      return {
        id: record.id,
        expectedOutcome: record.outcome,
        recordedEvents: record.events.length,
        replayEvents: replayed.state.events.length,
        status: replayed.state.status,
        outcome: replayed.state.winnerId === replayed.state.player.id ? 'WON' : replayed.state.winnerId === replayed.state.bot.id ? 'LOST' : 'TIED',
        player: inningsFor(replayed.state.player.id),
        bot: inningsFor(replayed.state.bot.id),
      };
    });
    const visible = await page.evaluate(() => ({
      outcome: /DRAW|TIE/.test(document.querySelector('#summary-winner-title')?.textContent?.toUpperCase() ?? '') ? 'TIED' :
        document.querySelector('#summary-winner-title')?.textContent?.toUpperCase().includes('WON') ? 'WON' : 'LOST',
      player: {
        score: Number(document.querySelector('#summary-player-runs')?.textContent),
        wickets: Number(document.querySelector('#summary-player-wickets')?.textContent?.split('/')[0]),
        legal: document.querySelectorAll('#summary-player-tracker .mini-dot:not(.extra)').length,
      },
      bot: {
        score: Number(document.querySelector('#summary-bot-runs')?.textContent),
        wickets: Number(document.querySelector('#summary-bot-wickets')?.textContent?.split('/')[0]),
        legal: document.querySelectorAll('#summary-bot-tracker .mini-dot:not(.extra)').length,
      },
    }));
    if (replay.status !== 'completed' || replay.recordedEvents !== replay.replayEvents || replay.outcome !== replay.expectedOutcome || replay.outcome !== visible.outcome) {
      throw new Error(`Persisted match replay result mismatch: replay=${JSON.stringify(replay)}, visible=${JSON.stringify(visible)}`);
    }
    for (const role of ['player', 'bot']) {
      const actual = replay[role];
      const shown = visible[role];
      if (!actual || actual.score !== shown.score || actual.wickets !== shown.wickets || actual.legal !== shown.legal) {
        throw new Error(`Persisted match replay ${role} innings mismatch: replay=${JSON.stringify(replay)}, visible=${JSON.stringify(visible)}`);
      }
    }
    console.log(`Persisted match replay matched the visible scorecards for ${replay.recordedEvents} events: ${JSON.stringify(replay)}`);
  }
  if (fixtureWide) {
    const wide = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('#summary-bot-tracker .mini-dot')];
      const wideIndex = dots.findIndex(dot => dot.textContent === 'WD');
      return { wideIndex, legalBalls: document.querySelectorAll('#summary-bot-tracker .mini-dot:not(.extra)').length, score: document.querySelector('#summary-bot-runs')?.textContent };
    });
    if (wide.wideIndex < 0 || wide.legalBalls !== 6) throw new Error(`Wide was not scored as an extra without consuming a legal ball: ${JSON.stringify(wide)}`);
    console.log(`Wide delivery recorded as WD without consuming a legal ball (bot score ${wide.score}).`);
  }
  const contacts = await page.evaluate(() => window.__matchContacts);
  // The sudden-death fixture intentionally records no shot in the regular innings.
  const requireRecordedShot = !process.argv.includes('--force-tie');
  if (contacts.length < 6 || contacts.some(contact => contact.error >= 1e-6 || !contact.swung || !contact.recorded || (requireRecordedShot && !contact.shot))) throw new Error(`Bowling contact mismatch: ${JSON.stringify(contacts)}`);
  if (process.argv.includes('--force-tie')) {
    const sudden = await page.evaluate(() => ({
      visible: !document.querySelector('#summary-sudden-death').classList.contains('hidden'),
      playerLegal: document.querySelectorAll('#summary-sudden-player-tracker .mini-dot:not(.extra)').length,
      botLegal: document.querySelectorAll('#summary-sudden-bot-tracker .mini-dot:not(.extra)').length,
    }));
    if (!sudden.visible || sudden.playerLegal !== 1 || sudden.botLegal !== 1) throw new Error(`Incorrect sudden-death scorecard: ${JSON.stringify(sudden)}`);
    console.log('Sudden-death scorecard has one legal ball per player.');
  }
  if (swingDuringBatting && !swings) throw new Error('No batting swing was triggered');
  if (squareDuringBatting && !selectedSquare) throw new Error('Square shot direction was not selected');
  if (loftDuringBatting) {
    if (!selectedLoft) throw new Error('Lofted shot was not selected');
    const six = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('#summary-player-tracker .mini-dot.six')];
      const noBallSixes = [...document.querySelectorAll('#summary-player-tracker .mini-dot.extra')].filter(el => el.textContent === 'NB6').length;
      const distances = markers.map(el => Number(el.title.match(/\(([\d.]+)m\)/)?.[1]));
      return {
        count: Number(document.querySelector('#summary-player-six-count').textContent),
        biggest: Number.parseFloat(document.querySelector('#summary-player-six').textContent),
        score: Number(document.querySelector('#summary-player-runs').textContent),
        fours: [...document.querySelectorAll('#summary-player-tracker .mini-dot.dot')].filter(el => el.textContent === '4').length,
        outcomes: [...document.querySelectorAll('#summary-player-tracker .mini-dot')].map(el => ({ text: el.textContent, extra: el.classList.contains('extra') })),
        distances, noBallSixes
      };
    });
    if (!Number.isFinite(six.biggest) || (six.count === 0) !== (six.biggest === 0) || six.count !== six.distances.length + six.noBallSixes || six.distances.some(value => !Number.isFinite(value) || value > six.biggest + 0.01) || (!six.noBallSixes && six.distances.length > 0 && Math.abs(Math.max(...six.distances) - six.biggest) > 0.01)) {
      throw new Error(`Lofted six not recorded consistently: ${JSON.stringify(six)}`);
    }
    if (process.argv.includes('--trace-shots')) {
      const trace = await page.evaluate(() => window.__playerShotTrace);
      console.log(`Player shot trace: ${JSON.stringify(trace)}`);
      const validSix = trace.some(shot => shot.runs === 6 && shot.reachedBoundary === true && shot.bounced === false);
      const validFour = trace.some(shot => shot.runs === 4 && shot.reachedBoundary === true && shot.bounced === true);
      if (process.argv.includes('--require-six') && !validSix) throw new Error('No traced six cleared the boundary on the full');
      if (process.argv.includes('--require-four') && !validFour) throw new Error('No traced four bounced before reaching the boundary');
      if (noBallFixture && (trace[0]?.extra !== 'noball' || trace[0]?.runs !== 6 || trace[0]?.bounced !== false || trace[1]?.freeHit !== true || six.noBallSixes !== 1)) {
        throw new Error(`No-ball six or following free hit was not recorded correctly: ${JSON.stringify({ trace: trace.slice(0, 2), six })}`);
      }
      if (noBallFixture && six.score !== trace.reduce((sum, shot) => sum + (shot.runs ?? 0) + (shot.extra ? 1 : 0), 0)) {
        throw new Error(`No-ball penalty and shot runs do not match the summary: ${JSON.stringify({ score: six.score, trace })}`);
      }
      if (process.argv.includes('--require-miss')) {
        const missesCorrect = trace.length === six.outcomes.length && trace.every((shot, index) => {
          const outcome = six.outcomes[index];
          return shot.shot === null && shot.missed === true && shot.runs === undefined && shot.launchVelocity === undefined &&
            (shot.extra ? outcome.extra : shot.wicket ? outcome.text === 'W' : outcome.text === '•');
        });
        const penalties = trace.filter(shot => shot.extra).length;
        if (!missesCorrect || six.score !== penalties || six.count !== 0) throw new Error(`Unswung misses scored incorrectly: ${JSON.stringify({ trace, six })}`);
      }
      if (pauseFlight) {
        const paused = await page.evaluate(() => window.__flightPause);
        const travelled = paused?.before && Math.hypot(paused.before.position.x - paused.origin.x, paused.before.position.y - paused.origin.y, paused.before.position.z - paused.origin.z);
        const uninterrupted = await page.evaluate(async first => {
          const { stepBall } = await import('/src/ball-physics.ts');
          const state = { position: { ...first.launchPosition }, velocity: { ...first.launchVelocity }, hasBounced: false, reachedBoundary: false, stopped: false };
          for (let i = 0; i < 2400 && !state.stopped && !(state.reachedBoundary && (!state.boundaryOnFull || state.hasBounced)); i++) stepBall(state, 1 / 120);
          return { distance: Math.hypot(state.position.x - first.launchPosition.x, state.position.z - first.launchPosition.z), reachedBoundary: state.reachedBoundary, boundaryOnFull: state.boundaryOnFull };
        }, trace[0]);
        if (!paused?.after?.paused || !(travelled >= 0.2) || paused.before.trackerText !== '…' || !paused.before.trackerTitle?.includes('runs pending') || JSON.stringify(paused.before.position) !== JSON.stringify(paused.after.position) || paused.before.score !== paused.after.score || paused.before.runs !== undefined || paused.after.runs !== undefined || trace[0]?.runs !== 6 || !uninterrupted.reachedBoundary || !uninterrupted.boundaryOnFull || Math.abs(trace[0].flightDistance - uninterrupted.distance) > 1e-7) {
          throw new Error(`Flight pause did not preserve the pending shot and resume scoring: ${JSON.stringify({ paused, first: trace[0], uninterrupted })}`);
        }
      }
    }
    if (process.argv.includes('--require-six') && !six.count) throw new Error('No six was scored in this timing-sensitive run');
    if (process.argv.includes('--require-four') && !six.fours) throw new Error('No four was recorded in the player scorecard');
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
  const leaderboardEntries = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('six_hitting_contest_leaderboard') || '[]').length; }
    catch { return -1; }
  });
  console.log(`Persistent leaderboard entries: ${leaderboardEntries}`);
  const historyEntries = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('six_hitting_contest_match_history') || 'null')?.records?.length ?? 0; }
    catch { return -1; }
  });
  console.log(`Persistent match-history entries: ${historyEntries}`);
  const replayPath = process.argv.find(arg => arg.startsWith('--replay-out='))?.slice('--replay-out='.length);
  if (replayPath) {
    const replay = await page.evaluate(() => window.__matchReplay);
    await writeFile(replayPath, `${JSON.stringify(replay, null, 2)}\n`);
    console.log(`Wrote ${replay.length} resolved delivery events to ${replayPath}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
