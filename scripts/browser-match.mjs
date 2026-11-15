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
  const compactFieldRadar = process.argv.includes('--compact-field-radar');
  const verifyFieldRadar = process.argv.includes('--verify-field-radar') || compactFieldRadar;
  await page.setViewport({ width: compactFieldRadar ? 667 : 1024, height: compactFieldRadar ? 300 : 768, isMobile: true, hasTouch: true });
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
  const runOutFixture = process.argv.includes('--require-runout');
  const recoveryFixture = process.argv.includes('--require-recovery');
  const padDeflectionFixture = process.argv.includes('--require-pad-deflection');
  const pauseReturn = process.argv.includes('--pause-return');
  if (pauseReturn && !runOutFixture) throw new Error('--pause-return requires --require-runout');
  const fieldingFixture = process.argv.includes('--require-fielding') || runOutFixture || recoveryFixture;
  const lowCatchFixture = process.argv.includes('--require-low-catch');
  const catchFixture = process.argv.includes('--require-catch') || lowCatchFixture;
  const verifyReplay = process.argv.includes('--verify-replay');
  const fieldPresetFixture = process.argv.find(argument => argument.startsWith('--field-setting='))?.split('=')[1];
  if (runOutFixture && !process.argv.includes('--trace-shots')) throw new Error('--require-runout requires --trace-shots');
  if (fieldPresetFixture && !['attacking', 'balanced', 'deep', 'all'].includes(fieldPresetFixture)) throw new Error(`Unknown field setting: ${fieldPresetFixture}`);
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
  await page.evaluate(async ({ traceShots, noBallFixture, pauseFlight, pauseVisibility, pauseRotation, pauseReturn, botBatsFast, botBatsSpin, fixtureWide, fieldingFixture, recoveryFixture, padDeflectionFixture, catchFixture, lowCatchFixture, fieldPresetFixture }) => {
    const { GameScene } = await import('/src/scene.ts');
    const { UIManager } = await import('/src/ui.ts');
    const { globalAutoAssistConfig } = await import('/src/game.ts');
    const { MatchController } = await import('/src/game.ts');
    const { gameNow, setGamePaused, isGamePaused } = await import('/src/game-clock.ts');
    const { deliveryContactPoint, deliveryIncomingVelocityAtTime, deliveryVelocityAtCrease, battingAssistanceMultiplier, shotFlightQuality, calculateShotTrajectory, BALL_RADIUS_METERS } = await import('/src/formula.ts');
    const { fieldRadarPoint } = await import('/src/field-radar.ts');
    const { sampleAutomatedRunners, sampleAutomatedReturn } = await import('/src/fielding.ts');
    if (fieldPresetFixture) {
      const startBowling = UIManager.prototype.startUserBowlingDelivery;
      UIManager.prototype.startUserBowlingDelivery = function (...args) {
        if (!window.__fieldPresetSelected) {
          const presets = fieldPresetFixture === 'all' ? ['attacking', 'balanced', 'deep'] : [fieldPresetFixture];
          for (const preset of presets) {
            const button = document.querySelector(`[data-field-preset="${preset}"]`);
            if (!button) throw new Error(`Missing ${preset} field setting button`);
            button.click();
            (window.__fieldPresetCycle ??= []).push({ preset, selected: button.getAttribute('aria-pressed') === 'true', positions: this.gameScene.getFielderPositions(), radarPoint: document.querySelector('[data-player-key="fielder-point"]')?.getAttribute('transform') });
          }
          window.__fieldPresetSelected = document.querySelector(`[data-field-preset="${presets.at(-1)}"]`)?.getAttribute('aria-pressed') === 'true';
        }
        return startBowling.apply(this, args);
      };
    }
    const animateDelivery = GameScene.prototype.animateDelivery;
    const endDeliveryCycle = GameScene.prototype.endDeliveryCycle;
    const beginFieldingReturn = GameScene.prototype.beginFieldingReturn;
    const animateMissWicket = GameScene.prototype.animateMissWicket;
    GameScene.prototype.animateMissWicket = function (isWicket, continuingDelivery, padImpactDelivery) {
      const result = animateMissWicket.call(this, isWicket, continuingDelivery, padImpactDelivery);
      if (padDeflectionFixture && padImpactDelivery) {
        const startZ = this.ballMesh.position.z;
        const update = this.updateMissedAnimation;
        window.__padDeflection = { startZ, maxZ: startZ, wicket: isWicket };
        this.updateMissedAnimation = () => {
          update?.call(this);
          window.__padDeflection.maxZ = Math.max(window.__padDeflection.maxZ, this.ballMesh.position.z);
        };
      }
      return result;
    };
    const setRunnerVisuals = GameScene.prototype.setRunnerVisuals;
    const getShotFielder = GameScene.prototype.getShotFielder;
    const getShotCatcher = GameScene.prototype.getShotCatcher;
    const showResultToast = UIManager.prototype.showResultToast;
    UIManager.prototype.showResultToast = function (title, description, ...args) {
      if ((fieldingFixture && (title === 'Fielded' || title === 'WICKET!')) || (catchFixture && title === 'WICKET!')) (window.__fieldingToasts ??= []).push({ title, description });
      return showResultToast.call(this, title, description, ...args);
    };
    const setFieldingRatings = GameScene.prototype.setFieldingRatings;
    GameScene.prototype.setFieldingRatings = function (agility, reaction, catching, throwing) {
      return setFieldingRatings.call(this, (fieldingFixture || catchFixture) ? 100 : agility, (fieldingFixture || catchFixture) ? 100 : reaction, catchFixture ? 100 : catching, throwing);
    };
    const deliverBall3D = UIManager.prototype.deliverBall3D;
    UIManager.prototype.deliverBall3D = function (...args) {
      const playerIsBowling = this.controller.getCurrentInnings().batter.id !== this.controller.state.player.id;
      const nonStriker = this.gameScene.getNonStrikerPosition();
      const nonStrikerPoint = fieldRadarPoint(nonStriker.x, nonStriker.z);
      const fieldCheck = {
        playerIsBowling,
        hand: this.controller.getCurrentInnings().batter.batterHand || 'RHB',
        preset: this.gameScene.getFieldPreset(),
        positions: this.gameScene.getFielderPositions(),
        meshes: this.gameScene.scene.meshes.filter(mesh => mesh.name.startsWith('fielder_')).map(mesh => ({
          pickable: mesh.isPickable,
          visible: mesh.isVisible && mesh.isEnabled(),
        })),
        nonStriker: { position: nonStriker,
          visible: this.gameScene.nonStrikerRoot?.isEnabled() && this.gameScene.nonStrikerRoot.getChildMeshes().every(mesh => mesh.isVisible && mesh.isEnabled() && !mesh.isPickable),
          meshCount: this.gameScene.nonStrikerRoot?.getChildMeshes().length ?? 0,
          marker: document.querySelector('[data-player-key="non-striker"]')?.getAttribute('transform'),
          expectedMarker: `translate(${nonStrikerPoint.x.toFixed(2)} ${nonStrikerPoint.y.toFixed(2)})` },
      };
      window.__fielderSceneCheck = fieldCheck;
      (window.__fielderSceneChecks ??= []).push(fieldCheck);
      if (playerIsBowling && this.activeDelivery) {
        if (botBatsFast) Object.assign(this.activeDelivery, { type: 'fast', pace: 0.95, turn: 0, swing: 0 });
        if (botBatsSpin) Object.assign(this.activeDelivery, { type: 'legspin', pace: 0.65, turn: 0.9, swing: 0 });
        if (fixtureWide && !window.__wideInjected) {
          Object.assign(this.activeDelivery, { aimTarget: { x: 1.65, z: -3.5 }, line: 'off', length: 'good', frontFootHeel: -0.1, swing: 0, turn: 0 });
          window.__wideInjected = true;
        }
        globalAutoAssistConfig.currentDelivery = this.activeDelivery;
      }
      if (!playerIsBowling && padDeflectionFixture && !window.__padDeliveryInjected && this.activeDelivery) {
        Object.assign(this.activeDelivery, { aimTarget: { x: 0.35, z: -3.5 }, line: 'middle', length: 'good', type: 'offspin', pace: 0.65, swing: 0, turn: 1, frontFootHeel: -0.1 });
        window.__padDeliveryInjected = true;
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
    window.__sweepTiming = { scene: [], record: [] };
    const setDeliverySwing = GameScene.prototype.setDeliverySwing;
    GameScene.prototype.setDeliverySwing = function (...args) {
      const started = performance.now();
      const result = setDeliverySwing.apply(this, args);
      window.__sweepTiming.scene.push(performance.now() - started);
      return result;
    };
    window.__playerShotTrace = [];
    window.__matchReplay = [];
    window.__fielderSceneChecks = [];
    window.__fieldingReturns = [];
    window.__runnerChecks = { flightSamples: 0, returnSamples: 0, maxMovement: 0, maxError: 0, legMotion: false, legHierarchy: false, radarSamples: 0, radarErrors: 0 };
    const updateFieldRadar = UIManager.prototype.updateFieldRadar;
    UIManager.prototype.updateFieldRadar = function (...args) {
      const result = updateFieldRadar.apply(this, args);
      if (window.__runnerChecks && globalAutoAssistConfig.isBallInPlay) {
        for (const [key, position] of [['striker', this.gameScene.getBatterPosition()], ['non-striker', this.gameScene.getNonStrikerPosition()]]) {
          const marker = document.querySelector(`[data-player-key="${key}"]`);
          if (!marker) continue;
          const point = fieldRadarPoint(position.x, position.z);
          window.__runnerChecks.radarSamples++;
          if (marker.getAttribute('transform') !== `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`) window.__runnerChecks.radarErrors++;
        }
      }
      return result;
    };
    GameScene.prototype.setRunnerVisuals = function (positions, timeSeconds) {
      const result = setRunnerVisuals.call(this, positions, timeSeconds);
      const expected = this.fieldingReturn
        ? sampleAutomatedReturn(this.shotElapsedSeconds, this.fieldingReturn.decision, Math.max(0, timeSeconds - this.shotElapsedSeconds))
        : sampleAutomatedRunners(this.shotElapsedSeconds);
      const checks = window.__runnerChecks;
      if (this.fieldingReturn) checks.returnSamples++; else checks.flightSamples++;
      checks.maxMovement = Math.max(checks.maxMovement, Math.abs(this.batterRoot.position.z + 8.8), Math.abs(this.nonStrikerRoot.position.z - 8.8));
      checks.maxError = Math.max(checks.maxError, Math.abs(this.batterRoot.position.z - expected.strikerPositionZ), Math.abs(this.nonStrikerRoot.position.z - expected.nonStrikerPositionZ));
      checks.legMotion ||= this.batterLegs.some(leg => Math.abs(leg.rotation.x) > 0.01) && this.nonStrikerLegs.some(leg => Math.abs(leg.rotation.x) > 0.01);
      checks.legHierarchy ||= [...this.batterLegs, ...this.nonStrikerLegs].every(leg => leg.getChildMeshes().length === 2);
      return result;
    };
    let playerBatting = false;
    let playerController;
    GameScene.prototype.getShotFielder = function (...args) {
      const fieldedBy = getShotFielder.apply(this, args);
      const trace = window.__playerShotTrace.at(-1);
      if (traceShots && playerBatting && trace) {
        trace.fieldedBy = fieldedBy;
        trace.fielderPosition = fieldedBy ? this.getFielderPositions().find(fielder => fielder.name === fieldedBy)?.position ?? null : null;
      }
      return fieldedBy;
    };
    GameScene.prototype.getShotCatcher = function (...args) {
      const caughtBy = getShotCatcher.apply(this, args);
      const trace = window.__playerShotTrace.at(-1);
      if (traceShots && playerBatting && trace) trace.caughtBy = caughtBy;
      return caughtBy;
    };
    window.__flightPause = null;
    const recordBall = MatchController.prototype.recordBall;
    MatchController.prototype.recordBall = function (delivery, shot, fieldPreset, contactModel) {
      if (window.__replayingMatch) return recordBall.call(this, delivery, shot, fieldPreset, contactModel);
      window.__liveMatchController = this;
      const contact = window.__matchContacts.at(-1);
      const started = performance.now();
      const result = recordBall.call(this, delivery, shot, fieldPreset, contactModel);
      window.__sweepTiming.record.push(performance.now() - started);
      window.__matchReplay.push({
        batter: this.getCurrentInnings().batter.id,
        delivery: structuredClone(delivery),
        shot: structuredClone(shot),
        missed: result.missed,
        wicket: result.isWicket,
        wicketReason: result.wicketReason,
        extra: result.extraType,
        freeHit: result.isFreeHit,
        fieldPreset,
        pendingDistance: result.distance,
        resolved: false,
      });
      playerBatting = this.getCurrentInnings().batter.id === this.state.player.id;
      if (traceShots && playerBatting) {
        playerController = this;
        const batContact = this.state.events.at(-1)?.batContact ?? null;
        const innings = this.getCurrentInnings();
        const assist = battingAssistanceMultiplier(innings.batter, innings.bowler, this.botDifficulty);
        const incoming = batContact ? deliveryIncomingVelocityAtTime(delivery, batContact.timeSeconds) : deliveryVelocityAtCrease(delivery);
        const expectedLaunch = shot && !result.missed && !result.isWicket && result.extraType !== 'wide'
          ? calculateShotTrajectory(shotFlightQuality(shot, delivery, assist), 0.5, 0.5, shot.direction * Math.PI / 4 - Math.PI / 2, incoming, { x: 0, y: 0, z: 0 }, true, false, 'Medium', shot.type, innings.batter.stats.batting.power)
          : null;
        window.__playerShotTrace.push({ delivery: structuredClone(delivery), shot: structuredClone(shot), batContact: structuredClone(batContact), expectedLaunch, missed: result.missed, wicket: result.isWicket, reason: result.wicketReason, extra: result.extraType, freeHit: result.isFreeHit, pendingDistance: result.distance });
      }
      if (contact && !contact.recorded) {
        contact.recorded = true;
        contact.shot = !!shot && !!result.shot;
        const event = this.state.events.at(-1);
        const expected = !result.missed && event?.batContact ? event.batContact.ballPosition : deliveryContactPoint(delivery);
        contact.error = Math.hypot(contact.position.x - expected.x, contact.position.y - expected.y - (0.075 - BALL_RADIUS_METERS), contact.position.z - expected.z);
        delete contact.position;
      }
      return result;
    };
    const finalize = MatchController.prototype.finalizeBallOutcome;
    MatchController.prototype.finalizeBallOutcome = function (distance, bounced, reachedBoundary, caughtBy, fieldedRuns, runOutBy, physicsEvents) {
      if (window.__replayingMatch) return finalize.call(this, distance, bounced, reachedBoundary, caughtBy, fieldedRuns, runOutBy, physicsEvents);
      const playerBatting = this.getCurrentInnings().batter.id === this.state.player.id;
      const runs = finalize.call(this, distance, bounced, reachedBoundary, caughtBy, fieldedRuns, runOutBy, physicsEvents);
      const lastBall = this.getCurrentInnings().balls.at(-1);
      const replayEntry = window.__matchReplay.at(-1);
      if (replayEntry && !replayEntry.resolved) Object.assign(replayEntry, { resolved: true, flightDistance: distance, bounced, reachedBoundary, runs });
      if (traceShots && playerBatting) Object.assign(window.__playerShotTrace.at(-1), { flightDistance: distance, bounced, reachedBoundary, runs, wicket: lastBall.isWicket, wicketReason: lastBall.wicketReason, fieldedRuns, runOutBy });
      return runs;
    };
    const animateHitPath = GameScene.prototype.animateHitPath;
    GameScene.prototype.animateHitPath = function (distance, direction, velocity, ...rest) {
      if (recoveryFixture && playerBatting && !window.__recoveryFixtureSet) {
        velocity = { x: 1, y: 0, z: 0 };
      } else if (catchFixture && playerBatting) {
        velocity = lowCatchFixture ? { x: 6, y: 1, z: 0 } : { x: 10, y: 6, z: 0 };
      } else if (fieldingFixture && playerBatting && velocity) {
        velocity = { ...velocity, x: velocity.x * 0.35, z: velocity.z * 0.35 };
      }
      const result = animateHitPath.call(this, distance, direction, velocity, ...rest);
      if (recoveryFixture && playerBatting && !window.__recoveryFixtureSet) {
        for (const fielder of this.fielderRoots.values()) fielder.position.set(30, 0, -8.4);
        window.__recoveryFixtureSet = true;
      }
      if (fieldingFixture && !recoveryFixture && playerBatting && !window.__fieldingFixtureSet) {
        const pointFielder = this.fielderRoots.get('point');
        pointFielder?.position.set(2.5, 0, -8.4);
        window.__fieldingFixtureSet = true;
      }
      if (catchFixture && playerBatting && !window.__catchFixtureSet) {
        this.fielderRoots.get('point')?.position.set(lowCatchFixture ? 1.5 : 3.8, 0, -8.4);
        window.__catchFixtureSet = true;
      }
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
    GameScene.prototype.endDeliveryCycle = function (...args) {
      if (this.fieldingReturn) {
        const returning = this.fieldingReturn;
        window.__fieldingReturns.push({ elapsed: (gameNow() - returning.startedAt) / 1000,
          expected: returning.arrivalSeconds, wicket: { x: returning.wicket.x, y: returning.wicket.y, z: returning.wicket.z },
          restStartedAt: this.shotRestStartedAt, flightSeconds: this.shotElapsedSeconds, fielder: this.shotFieldedBy,
          ball: { x: this.ballMesh.position.x, y: this.ballMesh.position.y, z: this.ballMesh.position.z },
          ballInPlay: globalAutoAssistConfig.isBallInPlay, pendingAtStart: returning.pendingAtStart,
          pendingAtEnd: window.__liveMatchController?.state.events.at(-1)?.resolved === false,
          scoreAtStart: returning.scoreAtStart, scoreAtEnd: window.__liveMatchController?.getCurrentInnings().score });
      }
      const trace = window.__playerShotTrace.at(-1);
      if (traceShots && playerBatting && trace && !trace.flightSamples && this.shotPhysics) {
        const flightSamples = this.getShotTrajectory();
        Object.assign(trace, {
          flightSamples,
          flightEndpoint: {
            x: this.shotPhysics.position.x,
            y: this.shotPhysics.position.y,
            z: this.shotPhysics.position.z,
          },
        });
      }
      return endDeliveryCycle.apply(this, args);
    };
    GameScene.prototype.beginFieldingReturn = function (...args) {
      const started = beginFieldingReturn.apply(this, args);
      if (started) {
        this.fieldingReturn.pendingAtStart = window.__liveMatchController?.state.events.at(-1)?.resolved === false;
        this.fieldingReturn.scoreAtStart = window.__liveMatchController?.getCurrentInnings().score;
        if (pauseReturn && !window.__returnPause) {
          const snapshot = () => ({ ball: this.ballMesh.position.asArray(), strikerZ: this.batterRoot.position.z,
            nonStrikerZ: this.nonStrikerRoot.position.z, score: window.__liveMatchController.getCurrentInnings().score,
            pending: window.__liveMatchController.state.events.at(-1)?.resolved === false });
          setGamePaused(true);
          const before = snapshot();
          window.__returnPause = { before };
          window.setTimeout(() => { window.__returnPause.after = snapshot(); setGamePaused(false); }, 600);
        }
      }
      return started;
    };
    GameScene.prototype.animateDelivery = function (target, length, type, arrived, ...rest) {
      return animateDelivery.call(this, target, length, type, () => {
        const position = this.scene.getMeshByName('cricketBall').position;
        window.__matchContacts.push({ position: { x: position.x, y: position.y, z: position.z }, swung: this.hasBotSwung });
        arrived();
      }, ...rest);
    };
  }, { traceShots: process.argv.includes('--trace-shots'), noBallFixture, pauseFlight, pauseVisibility, pauseRotation, pauseReturn, botBatsFast, botBatsSpin, fixtureWide, fieldingFixture, recoveryFixture, padDeflectionFixture, catchFixture, lowCatchFixture, fieldPresetFixture });
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
  let lastObservedState;
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
    lastObservedState = state;
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
  if (!lastObservedState?.summary) throw new Error(`Match did not finish before its deadline. Last observed state: ${JSON.stringify(lastObservedState)}`);
  await page.waitForSelector('#match-summary-modal.active', { timeout: 1000 });
  if (verifyFieldRadar) {
    const radar = await page.evaluate(() => {
      const markers = [...document.querySelectorAll('#field-radar-markers .field-radar-marker')];
      const expanded = document.querySelector('#field-radar-toggle')?.getAttribute('aria-expanded');
      const batting = markers.filter(marker => marker.getAttribute('data-team') === 'batting');
      const fielding = markers.filter(marker => marker.getAttribute('data-team') === 'fielding');
      const roles = Object.fromEntries(['fielder', 'bowler', 'striker', 'non-striker'].map(role => [role, markers.filter(marker => marker.getAttribute('data-player-role') === role).length]));
      const colors = { batting: getComputedStyle(batting[0]).fill, fielding: getComputedStyle(fielding[0]).fill };
      const shortLabels = markers.map(marker => marker.getAttribute('data-short-label'));
      const radarPanel = document.querySelector('#field-radar');
      const panelWidthBefore = radarPanel.getBoundingClientRect().width;
      const button = document.querySelector('#field-radar-toggle');
      button?.click();
      const expandedAfterClick = button?.getAttribute('aria-expanded');
      const bodyVisible = getComputedStyle(document.querySelector('#field-radar-body')).display !== 'none';
      const panelWidthAfter = radarPanel.getBoundingClientRect().width;
      button?.click();
      return { count: markers.length, batting: batting.length, fielding: fielding.length, roles, expanded, expandedAfterClick, bodyVisible, collapsedAgain: button?.getAttribute('aria-expanded'), panelWidthBefore, panelWidthAfter, colors, shortLabels,
        labels: [...markers].every(marker => !!marker.getAttribute('aria-label') && !!marker.querySelector('title')?.textContent && !!marker.querySelector('.field-radar-marker-label')?.textContent) && new Set(shortLabels).size === 13 && document.querySelectorAll('#field-radar-player-list li').length === 13,
        points: markers.map(marker => ({ role: marker.getAttribute('data-player-role'), team: marker.getAttribute('data-team'), transform: marker.getAttribute('transform') })) };
    });
    const expectedExpanded = compactFieldRadar ? 'false' : 'true';
    const expectedAfterClick = compactFieldRadar ? 'true' : 'false';
    const expectedVisibleAfterClick = compactFieldRadar;
    if (radar.count !== 13 || radar.batting !== 2 || radar.fielding !== 11 || radar.roles.fielder !== 10 || radar.roles.bowler !== 1 || radar.roles.striker !== 1 || radar.roles['non-striker'] !== 1 || radar.expanded !== expectedExpanded || radar.expandedAfterClick !== expectedAfterClick || radar.bodyVisible !== expectedVisibleAfterClick || radar.collapsedAgain !== expectedExpanded || (compactFieldRadar && radar.panelWidthAfter <= radar.panelWidthBefore) || !radar.labels || radar.points.some(point => !point.transform) || radar.colors.batting !== 'rgb(53, 215, 244)' || radar.colors.fielding !== 'rgb(255, 196, 92)') {
      throw new Error(`Field radar did not show all players or accessible collapse behavior: ${JSON.stringify(radar)}`);
    }
    if (fieldPresetFixture === 'all') {
      const pointTransforms = await page.evaluate(() => (window.__fieldPresetCycle ?? []).map(item => item.radarPoint));
      if (pointTransforms.length !== 3 || new Set(pointTransforms).size !== 3 || pointTransforms.some(transform => !transform)) {
        throw new Error(`Field radar did not track all selected field plans: ${JSON.stringify(pointTransforms)}`);
      }
    }
    console.log(`Ground map showed 10 fielders, bowler and both batters with team colors; collapse/expand worked${compactFieldRadar ? ' at 667×300' : ''}.`);
  }
  if (verifyReplay) {
    const replay = await page.evaluate(async () => {
      const stored = JSON.parse(localStorage.getItem('six_hitting_contest_match_history') || 'null');
      const record = stored?.records?.[0];
      if (!record) throw new Error('Completed match was not persisted before replay');
      const { replayMatchRecord } = await import('/src/match-replay.ts');
      let replayed;
      window.__replayingMatch = true;
      try { replayed = replayMatchRecord(record); } finally { window.__replayingMatch = false; }
      const inningsFor = batterId => {
        const innings = replayed.state.innings.find(item => item.batter.id === batterId);
        return innings ? { score: innings.score, wickets: innings.wicketsLost, legal: innings.ballsBowled } : null;
      };
      return {
        id: record.id,
        expectedOutcome: record.outcome,
        recordedEvents: record.events.length,
        replayEvents: replayed.state.events.length,
        fieldPresetsMatch: record.events.every((event, index) => event.fieldPreset === replayed.state.events[index]?.fieldPreset),
        status: replayed.state.status,
        outcome: replayed.state.winnerId === replayed.state.player.id ? 'WON' : replayed.state.winnerId === replayed.state.bot.id ? 'LOST' : 'TIED',
        player: inningsFor(replayed.state.player.id),
        bot: inningsFor(replayed.state.bot.id),
      };
    });
    const visible = await page.evaluate(() => {
      const title = document.querySelector('#summary-winner-title')?.textContent?.toUpperCase() ?? '';
      return {
      title,
      outcome: /DRAW|TIE/.test(title) ? 'TIED' : title.includes('BOT') ? 'LOST' : title.includes('YOU') ? 'WON' : 'UNKNOWN',
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
      };
    });
    if (replay.status !== 'completed' || replay.recordedEvents !== replay.replayEvents || !replay.fieldPresetsMatch || replay.outcome !== replay.expectedOutcome || replay.outcome !== visible.outcome) {
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
  if (process.argv.includes('--trace-shots')) {
    const timing = await page.evaluate(() => window.__sweepTiming);
    const summarize = samples => {
      const sorted = [...samples].sort((a, b) => a - b);
      return { count: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null, maxMs: sorted.at(-1) ?? null };
    };
    console.log(`Desktop browser contact-path timing (includes controller work; not a device budget): ${JSON.stringify({ scene: summarize(timing.scene), record: summarize(timing.record) })}`);
  }
  const fielders = await page.evaluate(() => window.__fielderSceneCheck);
  if (!fielders || fielders.positions.length !== 10 || fielders.meshes.length !== 40 || fielders.meshes.some(mesh => mesh.pickable || !mesh.visible) || fielders.positions.some(fielder => Math.hypot(fielder.position.x, fielder.position.z) >= 65)) {
    throw new Error(`Visible default fielder setup is incomplete: ${JSON.stringify(fielders)}`);
  }
  console.log(`Visible fielding setup has ${fielders.positions.length} players in range with ${fielders.meshes.length} enabled, non-pickable meshes.`);
  const supportingBatters = await page.evaluate(() => window.__fielderSceneChecks);
  if (![true, false].every(playerIsBowling => supportingBatters.some(check => check.playerIsBowling === playerIsBowling &&
      check.nonStriker.visible && check.nonStriker.meshCount >= 10 && check.nonStriker.position.x === 3.2 &&
      check.nonStriker.position.z === 8.8 && check.nonStriker.marker === check.nonStriker.expectedMarker))) {
    throw new Error(`Non-striker model or map marker missing in an innings: ${JSON.stringify(supportingBatters)}`);
  }
  console.log('Visible non-striker and matching ground-map marker verified in both innings.');
  if (fieldPresetFixture) {
    const fieldingSetups = await page.evaluate(() => ({ selected: window.__fieldPresetSelected, checks: window.__fielderSceneChecks, cycle: window.__fieldPresetCycle ?? [] }));
    const requestedPresets = fieldPresetFixture === 'all' ? ['attacking', 'balanced', 'deep'] : [fieldPresetFixture];
    const setup = fieldingSetups.checks.find(check => check.playerIsBowling && check.preset === requestedPresets.at(-1));
    const xSign = setup?.hand === 'LHB' ? -1 : 1;
    for (const preset of requestedPresets) {
      const selection = fieldingSetups.cycle.find(item => item.preset === preset);
      const point = selection?.positions.find(fielder => fielder.name === 'point');
      const thirdMan = selection?.positions.find(fielder => fielder.name === 'thirdMan');
      const expectedX = preset === 'attacking' ? 19 : preset === 'deep' ? 33 : 25;
      const expectedZ = preset === 'attacking' ? -7 : preset === 'deep' ? -10 : -6;
      const expectedThirdManX = preset === 'attacking' ? -24 : preset === 'deep' ? -46 : -38;
      const expectedThirdManZ = preset === 'attacking' ? -12 : preset === 'deep' ? -23 : -16;
      if (!selection?.selected || !point || point.position.x !== expectedX * xSign || point.position.z !== expectedZ || !thirdMan || thirdMan.position.x !== expectedThirdManX * xSign || thirdMan.position.z !== expectedThirdManZ) {
        throw new Error(`Selected ${preset} field did not reach live fielder positions: ${JSON.stringify({ fieldingSetups, preset })}`);
      }
    }
    const point = setup?.positions.find(fielder => fielder.name === 'point');
    if (!fieldingSetups.selected || !setup || !point) {
      throw new Error(`Selected field setting did not reach live fielder positions: ${JSON.stringify({ fieldingSetups, fieldPresetFixture })}`);
    }
    console.log(`Bowler selected ${requestedPresets.join(', ')} field plans; live positions matched each and replay retained the final ${setup.preset} setting.`);
  }
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
      for (const shot of trace) {
        if (shot.launchPosition && shot.batContact) {
          const p = shot.launchPosition, c = shot.batContact.ballPosition;
          if (Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) > 1e-6) throw new Error(`Shot launch does not match recorded bat contact: ${JSON.stringify({ p, c })}`);
        }
        if (shot.launchVelocity && shot.expectedLaunch) {
          const v = shot.launchVelocity, e = shot.expectedLaunch;
          if (Math.hypot(v.x - e.x, v.y - e.y, v.z - e.z) > 1e-9) throw new Error(`Shot velocity does not use impact-time incoming velocity: ${JSON.stringify({ v, e })}`);
        }
      }
      const summarized = trace.map(({ flightSamples, ...shot }) => {
        const landing = flightSamples?.find(sample => sample.position.y <= 0.036 + 1e-6);
        const firstLandingDistance = landing && shot.launchPosition
          ? Math.hypot(landing.position.x - shot.launchPosition.x, landing.position.z - shot.launchPosition.z)
          : null;
        return { ...shot, firstLandingDistance,
          flightSampleCount: flightSamples?.length ?? 0, flightFirst: flightSamples?.[0], flightLast: flightSamples?.at(-1) };
      });
      console.log(`Player shot trace: ${JSON.stringify(summarized)}`);
      const incompleteTrajectory = trace.find(shot => shot.launchVelocity && (
        !Array.isArray(shot.flightSamples) || shot.flightSamples.length < 2 ||
        shot.flightSamples.some((sample, index) => !Number.isFinite(sample.timeSeconds) || (index > 0 && Math.abs(sample.timeSeconds - shot.flightSamples[index - 1].timeSeconds - 1 / 120) > 1e-9)) ||
        !shot.flightEndpoint || ['x', 'y', 'z'].some(axis =>
          !Number.isFinite(shot.flightEndpoint[axis]) ||
          shot.flightSamples.some(sample => !Number.isFinite(sample.position[axis])) ||
          Math.abs(shot.flightSamples.at(-1).position[axis] - shot.flightEndpoint[axis]) > 1e-9
        )
      ));
      if (incompleteTrajectory) throw new Error(`Live fixed-step trajectory was incomplete or disagreed with its endpoint: ${JSON.stringify(incompleteTrajectory)}`);
      const validSix = trace.some(shot => shot.runs === 6 && shot.reachedBoundary === true && shot.bounced === false);
      const validFour = trace.some(shot => shot.runs === 4 && shot.reachedBoundary === true && shot.bounced === true);
      if (process.argv.includes('--require-six') && !validSix) throw new Error('No traced six cleared the boundary on the full');
      if (process.argv.includes('--require-six') && trace.some(shot => shot.runs === 6 && shot.fieldedBy)) throw new Error('A boundary-on-full shot was intercepted by a ground fielder');
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
    if (process.argv.includes('--require-six')) {
      const progression = await page.$eval('#summary-progression-stat', el => el.textContent?.trim() || '');
      if (!progression.includes(' · ') || !/(boundary hit|scoring shot|successful contact|wicket|delivery type)/i.test(progression)) {
        throw new Error(`Performance upgrade reason is missing from the summary: ${progression}`);
      }
      console.log(`Progression summary shows its performance reason: ${progression}`);
    }
    if (process.argv.includes('--require-four') && !six.fours) throw new Error('No four was recorded in the player scorecard');
    console.log(`Lofted batting recorded ${six.count} six(es), biggest ${six.biggest.toFixed(1)}m.`);
  }
  if (process.argv.includes('--require-fielding')) {
    if (!process.argv.includes('--trace-shots')) throw new Error('--require-fielding requires --trace-shots');
    const trace = await page.evaluate(() => window.__playerShotTrace);
    const fielded = trace.find(shot => shot.fieldedBy && shot.bounced && !shot.reachedBoundary && shot.runs < 4);
    if (!fielded) throw new Error(`No ground ball was intercepted into fewer than four estimated runs: ${JSON.stringify(trace.map(shot => ({ shot: shot.shot, fieldedBy: shot.fieldedBy, bounced: shot.bounced, reachedBoundary: shot.reachedBoundary, runs: shot.runs, flightDistance: shot.flightDistance })))}`);
    const noFielder = await page.evaluate(async shot => {
      const { stepBall } = await import('/src/ball-physics.ts');
      const { evaluateFinalOutcome } = await import('/src/formula.ts');
      const state = { position: { ...shot.launchPosition }, velocity: { ...shot.launchVelocity }, hasBounced: false, reachedBoundary: false, stopped: false };
      for (let i = 0; i < 5000 && !state.stopped && !(state.reachedBoundary && (!state.boundaryOnFull || state.hasBounced)); i++) stepBall(state, 1 / 120);
      const distance = Math.hypot(state.position.x - shot.launchPosition.x, state.position.z - shot.launchPosition.z);
      return { distance, runs: evaluateFinalOutcome(distance, state.hasBounced, state.reachedBoundary) };
    }, fielded);
    const fielderGap = fielded.fielderPosition && fielded.flightEndpoint
      ? Math.hypot(fielded.fielderPosition.x - fielded.flightEndpoint.x, fielded.fielderPosition.z - fielded.flightEndpoint.z)
      : Infinity;
    const resultToasts = await page.evaluate(() => window.__fieldingToasts ?? []);
    const resultToast = resultToasts.find(toast => toast.description.includes(`Fielded by ${fielded.fieldedBy};`));
    if (noFielder.runs <= fielded.runs || fielderGap > 0.61 || !resultToast) {
      throw new Error(`Interception did not move the fielder, identify it, and reduce the unobstructed run estimate: ${JSON.stringify({ fielded, noFielder, fielderGap, resultToast })}`);
    }
    console.log(`Ground ball was stopped by ${fielded.fieldedBy} for ${fielded.runs} estimated run(s); without fielding it would score ${noFielder.runs} at ${noFielder.distance.toFixed(1)}m.`);
  }
  if (runOutFixture) {
    const trace = await page.evaluate(() => window.__playerShotTrace);
    const runOut = trace.find(shot => shot.runOutBy && shot.wicket && shot.wicketReason === `Run out by ${shot.runOutBy}`);
    const toasts = await page.evaluate(() => window.__fieldingToasts ?? []);
    if (!runOut || !toasts.some(toast => toast.title === 'WICKET!' && toast.description === runOut.wicketReason)) {
      throw new Error(`A fielded ground shot did not resolve and display a run out: ${JSON.stringify(trace.map(shot => ({ fieldedBy: shot.fieldedBy, runs: shot.runs, runOutBy: shot.runOutBy, wicket: shot.wicket, wicketReason: shot.wicketReason })))}`);
    }
    const returns = await page.evaluate(() => window.__fieldingReturns);
    if (!returns.length || returns.some(item => !item.ballInPlay || !item.pendingAtStart || !item.pendingAtEnd || item.scoreAtStart !== item.scoreAtEnd || item.elapsed + 0.001 < item.expected ||
        Math.hypot(item.ball.x - item.wicket.x, item.ball.y - item.wicket.y, item.ball.z - item.wicket.z) > 1e-6)) {
      throw new Error(`Fielding return did not reach its wicket before resolution: ${JSON.stringify(returns)}`);
    }
    console.log(`Verified ${returns.length} timed fielding return(s) reached the modeled wicket before scoring.`);
    const runners = await page.evaluate(() => window.__runnerChecks);
    if (!runners.flightSamples || !runners.returnSamples || !runners.radarSamples || runners.radarErrors || runners.maxMovement < 0.5 || runners.maxError > 1e-8 || !runners.legMotion || !runners.legHierarchy) {
      throw new Error(`Runner visuals did not follow the modeled flight and return: ${JSON.stringify(runners)}`);
    }
    console.log(`Runner models followed flight and return positions; maximum movement ${runners.maxMovement.toFixed(2)} m.`);
    if (pauseReturn) {
      const paused = await page.evaluate(() => window.__returnPause);
      if (!paused?.after || !paused.before.pending || JSON.stringify(paused.before) !== JSON.stringify(paused.after)) {
        throw new Error(`Fielding return or score changed while paused: ${JSON.stringify(paused)}`);
      }
      console.log('Fielding return, runners and pending score remained fixed during a direct clock pause.');
    }
    console.log(`Ground shot was run out by ${runOut.runOutBy}; ${runOut.runs} run(s) counted before the wicket.`);
  }
  if (recoveryFixture) {
    const returns = await page.evaluate(() => window.__fieldingReturns);
    const recovered = returns.find(item => item.restStartedAt !== null && item.flightSeconds > item.restStartedAt + 0.1);
    if (!recovered || !recovered.fielder || !recovered.pendingAtStart || !recovered.pendingAtEnd ||
        recovered.scoreAtStart !== recovered.scoreAtEnd || recovered.elapsed + 0.001 < recovered.expected) {
      throw new Error(`Stopped ball was not recovered before its timed return and score: ${JSON.stringify(returns)}`);
    }
    console.log(`Stopped ball was recovered by ${recovered.fielder} ${(recovered.flightSeconds - recovered.restStartedAt).toFixed(2)} s after rest.`);
  }
  if (padDeflectionFixture) {
    const pad = await page.evaluate(() => window.__padDeflection);
    if (!pad || !(pad.maxZ > pad.startZ + 0.05)) throw new Error(`Pad impact did not visibly rebound toward the bowler: ${JSON.stringify(pad)}`);
    console.log(`Pad impact visibly rebounded ${(pad.maxZ - pad.startZ).toFixed(2)} m toward the bowler.`);
  }
  if (catchFixture) {
    if (!process.argv.includes('--trace-shots')) throw new Error('catch fixtures require --trace-shots');
    const trace = await page.evaluate(() => window.__playerShotTrace);
    const caught = trace.find(shot => shot.caughtBy && shot.wicket && shot.runs === 0 && shot.wicketReason === `Caught by ${shot.caughtBy}`);
    const toasts = await page.evaluate(() => window.__fieldingToasts ?? []);
    if (!caught || !toasts.some(toast => toast.title === 'WICKET!' && toast.description === caught.wicketReason)) {
      throw new Error(`Reachable aerial catch did not resolve and display as a wicket: ${JSON.stringify(trace.map(shot => ({ caughtBy: shot.caughtBy, wicket: shot.wicket, wicketReason: shot.wicketReason, runs: shot.runs })))}`);
    }
    if (lowCatchFixture && !(caught.flightEndpoint?.y > 0.036 && caught.flightEndpoint.y <= 1.2 && caught.bounced === false)) {
      throw new Error(`Catch did not occur below 1.2 m before bouncing: ${JSON.stringify(caught.flightEndpoint)}`);
    }
    console.log(`Aerial shot was caught by ${caught.caughtBy} and recorded as a wicket.`);
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
