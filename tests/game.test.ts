import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotPlayer, getOrCreatePlayer, globalAutoAssistConfig, MatchController } from '../src/game';
import { KeyboardInputManager } from '../src/input';
import { directionFromStick, suggestedShotDirection, TouchBattingControls } from '../src/touch-controls';
import { stepBall, type BallState } from '../src/ball-physics';
import { botChooseDelivery, botChooseShot } from '../src/bot';
import { addLeaderboardEntry, readLeaderboard } from '../src/leaderboard';
import { BALL_AIR_DAMPING, BALL_RADIUS_METERS, BATTER_CREASE_Z, batterContactProgress, battingContactZone, bowlingExecutionTarget, bowlingReleaseTiming, bowlingTargetFromScreen, calculateBounceTarget, calculateShotDistance, calculateShotTrajectory, checkExtraBall, deliveryAnimationStep, deliveryArrivalHeight, deliveryBaseCreaseX, deliveryCreaseX, deliveryDurationMs, deliveryPitchPoint, deliveryReleaseX, deliverySwingAtBounce, deliveryVelocityAtCrease, evaluateFinalOutcome, evaluateWicket, footworkFactor, frameIndependentDamping, getDeliveryFlightPosition, getLineTypeFromAimX, getParabolicFlightPosition, resolveMissedDelivery, sampleFrontFootLanding } from '../src/formula';
import { isSpinDelivery, updateBowlingAdjustmentVisibility } from '../src/bowling-controls';
import { clearGameTimeout, gameNow, isGamePaused, setGamePaused, setGameTimeout, shouldPauseGameplay } from '../src/game-clock';
import { SoundManager } from '../src/sound';
import { UIManager } from '../src/ui';
import { GameScene } from '../src/scene';
import { battingTimingFeedback } from '../src/batting-timing';
import { moveBatter } from '../src/batter-position';
import { followShotPose, shotCameraDirection, shotResultPose } from '../src/camera-director';
import type { BallOutcome, DeliveryChoice, ShotType } from '../src/types';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value)
} });

const delivery = (timing: number, x = 0): DeliveryChoice => ({
  aimTarget: { x, z: -3.5 }, line: 'middle', length: 'good', type: 'fast', releaseTiming: timing
});

test('shot cameras follow every direction and keep a stable elevated result view', () => {
  const ball = { x: 12, y: 3, z: -4 };
  for (const [x, z] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]) {
    const direction = shotCameraDirection({ x, y: 12, z });
    const follow = followShotPose(ball, direction);
    const result = shotResultPose(ball, direction);
    const behind = (ball.x - follow.position.x) * direction.x + (ball.z - follow.position.z) * direction.z;
    assert.ok(Math.abs(behind - 12) < 1e-9);
    assert.ok(follow.position.y > ball.y && result.position.y > ball.y);
    assert.deepEqual(follow.target, ball);
    assert.deepEqual(result.target, ball);
    assert.ok(Object.values(result.position).every(Number.isFinite));
  }
  assert.deepEqual(shotCameraDirection({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
  const beyondRope = shotResultPose({ x: 90, y: 0, z: 90 }, shotCameraDirection({ x: 1, y: 0, z: 1 }));
  assert.ok(Math.hypot(beyondRope.position.x, beyondRope.position.z) <= 55.000001);
  assert.ok(Math.hypot(beyondRope.target.x, beyondRope.target.z) <= 62.000001);
  const chase = followShotPose({ x: 90, y: 4, z: 90 }, shotCameraDirection({ x: 1, y: 0, z: 1 }));
  assert.ok(Math.hypot(chase.position.x, chase.position.z) <= 60.000001);
  assert.ok(chase.position.y >= 14);
});

test('batting timing feedback matches the shot timing scale and clamps its marker', () => {
  assert.deepEqual(battingTimingFeedback(0.5), { position: 0.5, offsetMs: 0, label: 'PERFECT' });
  assert.deepEqual(battingTimingFeedback(0.4), { position: 0.4, offsetMs: -50, label: 'EARLY' });
  assert.deepEqual(battingTimingFeedback(0.6), { position: 0.6, offsetMs: 50, label: 'LATE' });
  assert.equal(battingTimingFeedback(-2).position, 0);
  assert.equal(battingTimingFeedback(2).position, 1);
});

test('batting timing meter displays the actual shot offset', () => {
  const oldDocument = globalThis.document;
  const marker = { style: { left: '' } };
  const label = { textContent: '' };
  let shown = false;
  const widget = { dataset: { timing: '' }, classList: { remove: () => { shown = true; } } };
  Object.assign(globalThis, { document: { getElementById: (id: string) => ({
    'timing-widget': widget, 'timing-bar-cursor': marker, 'timing-instruction': label
  } as Record<string, unknown>)[id] ?? null } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.showBattingTiming(0.4);
    assert.equal(marker.style.left, '40%');
    assert.equal(label.textContent, 'EARLY · 50 ms');
    assert.equal(widget.dataset.timing, 'early');
    assert.equal(shown, true);
  } finally {
    Object.assign(globalThis, { document: oldDocument });
  }
});

test('the first run-up follows the newly selected bowling side, not the previous delivery', () => {
  const oldDelivery = globalAutoAssistConfig.currentDelivery;
  const oldStart = globalAutoAssistConfig.runUpStartTime;
  const scene = Object.create(GameScene.prototype) as any;
  scene.bowlerRoot = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0 }, setEnabled() {} };
  scene.batterRoot = null;
  scene.bowlerLegs = [];
  scene.bowlerArms = [];
  try {
    globalAutoAssistConfig.currentDelivery = { ...delivery(0.5), overTheWicket: true, bowlingArm: 'Right' };
    globalAutoAssistConfig.runUpStartTime = gameNow() - 1;
    scene.setBowlerSide(false, 'Right');
    scene.updateBowlerRunUp();
    assert.equal(scene.bowlerRoot.position.x, deliveryReleaseX({ overTheWicket: false, bowlingArm: 'Right' }));
    scene.setBowlerSide(true, 'Left');
    scene.updateBowlerRunUp();
    assert.equal(scene.bowlerRoot.position.x, deliveryReleaseX({ overTheWicket: true, bowlingArm: 'Left' }));
  } finally {
    globalAutoAssistConfig.currentDelivery = oldDelivery;
    globalAutoAssistConfig.runUpStartTime = oldStart;
  }
});

test('sound effects unlock on input and respect mute without interrupting play', () => {
  storage.delete('hardhit_sound_muted');
  let sources = 0;
  const parameter = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = { connect() { return this; }, start() {}, stop() {} };
  const context = {
    state: 'running', currentTime: 0, sampleRate: 100,
    destination: {},
    createGain: () => ({ ...node, gain: { ...parameter } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(50) }),
    createBufferSource: () => { sources++; return { ...node, buffer: null }; },
    createBiquadFilter: () => ({ ...node, frequency: { value: 0 } }),
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    resume() { this.state = 'running'; return Promise.resolve(); }
  };
  const sounds = new SoundManager(() => context as unknown as AudioContext);
  sounds.play('bat');
  assert.equal(sources, 0);
  sounds.unlock();
  sounds.play('bat');
  sounds.play('bounce');
  assert.equal(sources, 2);
  sounds.setMuted(true);
  sounds.play('wicket');
  assert.equal(sources, 2);
  sounds.setMuted(false);
  sounds.play('delivery');
  assert.equal(sources, 3);
  storage.delete('hardhit_sound_muted');
});

test('recorded cricket sounds play on their events and stop when muted', () => {
  const originalAudio = globalThis.Audio;
  const originalDocument = globalThis.document;
  const previousMute = storage.get('hardhit_sound_muted');
  storage.delete('hardhit_sound_muted');
  const loaded: string[] = [];
  let played = 0;
  let paused = 0;
  class FakeAudio {
    preload = '';
    volume = 1;
    constructor(url: string) { loaded.push(url); }
    cloneNode() { return { volume: 1, addEventListener() {}, play() { played++; return Promise.resolve(); }, pause() { paused++; } }; }
  }
  Object.assign(globalThis, { Audio: FakeAudio, document: { baseURI: 'http://localhost/game/' } });
  try {
    const context = { state: 'running', suspend() { return Promise.resolve(); } };
    const sounds = new SoundManager(() => context as unknown as AudioContext);
    sounds.unlock();
    assert.deepEqual(loaded.map(url => url.split('/').pop()), ['bat-impact.wav', 'stumps.wav', 'crowd-cheer.wav']);
    sounds.play('bat');
    sounds.play('boundary');
    assert.equal(played, 2);
    sounds.setMuted(true);
    assert.equal(paused, 2);
    sounds.play('wicket');
    assert.equal(played, 2);
  } finally {
    Object.assign(globalThis, { Audio: originalAudio, document: originalDocument });
    if (previousMute === undefined) storage.delete('hardhit_sound_muted'); else storage.set('hardhit_sound_muted', previousMute);
  }
});

test('gameplay pauses when hidden or in portrait, and resumes only when both clear', () => {
  assert.equal(shouldPauseGameplay(true, false, false), false);
  assert.equal(shouldPauseGameplay(true, true, false), true);
  assert.equal(shouldPauseGameplay(true, false, true), true);
  assert.equal(shouldPauseGameplay(true, true, true), true);
  assert.equal(shouldPauseGameplay(false, true, true), false);
});

test('pause freezes gameplay time and scheduled deliveries', () => {
  const originalPerformance = globalThis.performance;
  const originalWindow = globalThis.window;
  const originalClearTimeout = globalThis.clearTimeout;
  let now = 1000;
  let next = 0;
  const queue = new Map<number, () => void>();
  Object.assign(globalThis, {
    performance: { now: () => now },
    window: { setTimeout: (fn: () => void) => { const id = ++next; queue.set(id, fn); return id; } },
    clearTimeout: (id: number) => queue.delete(id)
  });
  const tick = () => { const [id, fn] = queue.entries().next().value!; queue.delete(id); fn(); };
  try {
    let delivered = false;
    const start = gameNow();
    setGameTimeout(() => { delivered = true; }, 200);
    now += 100;
    tick();
    setGamePaused(true);
    assert.equal(isGamePaused(), true);
    now += 10000;
    tick();
    assert.equal(gameNow() - start, 100);
    assert.equal(delivered, false);
    setGamePaused(false);
    now += 100;
    tick();
    assert.equal(delivered, true);
    const cancelled = setGameTimeout(() => { throw new Error('cancelled timer fired'); }, 100);
    clearGameTimeout(cancelled);
    assert.equal(queue.size, 0);
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { performance: originalPerformance, window: originalWindow, clearTimeout: originalClearTimeout });
  }
});

test('returning to the lobby cancels a pending bot delivery and run-up', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalClearTimeout = globalThis.clearTimeout;
  const queue = new Map<number, () => void>();
  let next = 0;
  let runUpCancelled = 0;
  Object.assign(globalThis, {
    document: { getElementById: () => null, querySelectorAll: () => [] },
    window: { setTimeout: (fn: () => void) => { const id = ++next; queue.set(id, fn); return id; } },
    clearTimeout: (id: number) => queue.delete(id)
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.deliveryGeneration = 3;
    ui.cancelBattingRunUp = () => { runUpCancelled++; };
    ui.botDeliveryTimer = setGameTimeout(() => { throw new Error('delivery survived lobby return'); }, 1500);
    ui.gameScene = { setCameraMode() {} };
    ui.refreshLobbyView = () => {};
    ui.handleReturnToLobby();
    assert.equal(runUpCancelled, 1);
    assert.equal(ui.deliveryGeneration, 4);
    assert.equal(ui.botDeliveryTimer, null);
    assert.equal(queue.size, 0);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, clearTimeout: originalClearTimeout });
  }
});

test('cancelled batting callbacks cannot observe or resolve a later delivery', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalClearTimeout = globalThis.clearTimeout;
  const oldRunUp = globalAutoAssistConfig.isRunUpActive;
  const oldStart = globalAutoAssistConfig.runUpStartTime;
  const oldActive = globalAutoAssistConfig.isDeliveryActive;
  const frames: Array<() => void> = [];
  let arrived: () => void = () => {};
  let resolved: () => void = () => {};
  let arrivals = 0;
  Object.assign(globalThis, {
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} }
    },
    window: { setTimeout: () => 1 },
    clearTimeout: () => {},
    requestAnimationFrame: (fn: () => void) => { frames.push(fn); return frames.length; }
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.activeDelivery = delivery(0.5);
    ui.deliveryGeneration = 1;
    ui.deliveryStarted = false;
    ui.botDeliveryTimer = null;
    ui.cancelBattingRunUp = null;
    ui.hideResultToast = () => {};
    ui.showBattingHelper = () => {};
    ui.handleBallArrivalAtStumps = () => { arrivals++; };
    ui.controller = {
      state: { player: { id: 'player' }, bot: { rank: 'Gold' } },
      getCurrentInnings: () => ({ batter: { id: 'player' } }),
      setCameraMode() {}
    };
    ui.gameScene = {
      prepareDeliverySound() {}, setCameraMode() {},
      scene: { getMeshByName: () => null },
      setDeliveryCallbacks: (a: () => void, r: () => void) => { arrived = a; resolved = r; }
    };
    ui.deliverBall3D();
    assert.equal(frames.length, 1);
    const previousFrame = frames.shift()!;
    ui.cancelPendingDelivery();
    ui.isBallActive = true;
    ui.activeDelivery = delivery(0.5);
    globalAutoAssistConfig.isDeliveryActive = false;
    previousFrame();
    arrived();
    resolved();
    assert.equal(frames.length, 0);
    assert.equal(arrivals, 0);
  } finally {
    globalAutoAssistConfig.isRunUpActive = oldRunUp;
    globalAutoAssistConfig.runUpStartTime = oldStart;
    globalAutoAssistConfig.isDeliveryActive = oldActive;
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, requestAnimationFrame: originalRaf, clearTimeout: originalClearTimeout });
  }
});

test('showing the same match summary twice records one leaderboard entry', () => {
  const key = 'six_hitting_contest_leaderboard';
  const previous = storage.get(key);
  const originalDocument = globalThis.document;
  storage.delete(key);
  Object.assign(globalThis, { document: { getElementById: () => null } });
  try {
    const game = match();
    game.state.status = 'completed';
    game.state.winnerId = game.state.player.id;
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.recordedSummary = null;
    ui.hideResultToast = () => {};
    ui.keyboardInputManager = { closeHelpModal() {} };
    ui.showGameOverScreen();
    ui.showGameOverScreen();
    assert.equal(readLeaderboard().length, 1);

    game.reset();
    game.setTossResult(game.state.player.id, 'bat');
    game.startMatch();
    game.state.status = 'completed';
    game.state.winnerId = game.state.bot.id;
    ui.showGameOverScreen();
    assert.equal(readLeaderboard().length, 2);
  } finally {
    if (previous === undefined) storage.delete(key); else storage.set(key, previous);
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('touch stick maps eight directions and ignores its dead zone', () => {
  assert.equal(directionFromStick(0, 0), null);
  assert.equal(directionFromStick(0.1, 0.1), null);
  assert.deepEqual([[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]].map(([x,y]) => directionFromStick(x,y)), [0,1,2,3,4,5,6,7]);
});

test('batter movement stays within its bounds and can be reset', () => {
  assert.deepEqual(moveBatter({ x: 0, z: 0 }, 5, 5), { x: 0.6, z: 0.8 });
  assert.deepEqual(moveBatter({ x: 0, z: 0 }, -5, -5), { x: -0.6, z: -0.3 });
  assert.deepEqual(moveBatter({ x: 0.2, z: 0.2 }, -0.2, -0.2), { x: 0, z: 0 });
});

test('batter stance changes contact timing and reach without manufacturing wides', () => {
  const central = delivery(0.5);
  const forward = { ...central, batterPosition: { x: 0, z: 0.8 } };
  const back = { ...central, batterPosition: { x: 0, z: -0.3 } };
  assert.ok(batterContactProgress(forward) < batterContactProgress(central));
  assert.ok(batterContactProgress(back) > batterContactProgress(central));
  const outside = { ...delivery(0.5, 0.7), batterPosition: { x: -0.6, z: 0 } };
  assert.equal(checkExtraBall(outside).isExtra, false);
  const movedIntoLine = { ...delivery(0.5, 1.1), batterPosition: { x: 0.4, z: 0 } };
  assert.equal(checkExtraBall(movedIntoLine).isExtra, false);
  const game = match();
  const shot = { direction: 0, type: 'power' as const, timing: 0.5, contactZone: 0.5 };
  assert.equal(game.recordBall(outside, shot).missed, true);
});

test('a second finger can strike while the aiming finger remains held', () => {
  const stickEvents: Record<string, (event: any) => void> = {};
  const shotEvents: Record<string, (event: any) => void> = {};
  const stick = {
    querySelector: () => ({ style: {} }),
    addEventListener: (name: string, fn: (event: any) => void) => { stickEvents[name] = fn; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { setProperty: () => {} },
    setPointerCapture: () => {}, setAttribute: () => {}
  };
  const button = { dataset: { shot: 'lofted' }, addEventListener: (name: string, fn: (event: any) => void) => { shotEvents[name] = fn; } };
  const shots: Array<[number, string]> = [];
  const controls = new TouchBattingControls(stick as unknown as HTMLElement, [button] as unknown as NodeListOf<HTMLButtonElement>, (direction, type) => shots.push([direction, type]));
  stickEvents.pointerdown({ pointerId: 1, clientX: 100, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 2, preventDefault() {} });
  assert.deepEqual(shots, [[2, 'lofted']]);
  stickEvents.pointerup({ pointerId: 1 });
  shotEvents.pointerdown({ pointerId: 3, preventDefault() {} });
  assert.deepEqual(shots[1], [2, 'lofted']);
  controls.setLocked(true);
  stickEvents.pointerdown({ pointerId: 4, clientX: 0, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 5, preventDefault() {} });
  assert.deepEqual(shots[2], [2, 'lofted']);
  controls.setLocked(false);
  stickEvents.pointerdown({ pointerId: 6, clientX: 0, clientY: 50, preventDefault() {} });
  shotEvents.pointerdown({ pointerId: 7, preventDefault() {} });
  assert.deepEqual(shots[3], [6, 'lofted']);
});

test('shot guide follows the delivered line including movement', () => {
  assert.equal(suggestedShotDirection(delivery(0.5)), 0);
  assert.equal(suggestedShotDirection(delivery(0.5, 0.5)), 1);
  assert.equal(suggestedShotDirection(delivery(0.5, -0.5)), 7);
  assert.equal(suggestedShotDirection({ ...delivery(0.5), type: 'offspin', turn: 1 }), 7);
});

function match(): MatchController {
  storage.clear();
  const controller = new MatchController('Medium');
  controller.setTossResult(controller.state.player.id, 'bowl');
  controller.startMatch();
  return controller;
}

test('new player defaults are not changed by a previous player profile', () => {
  storage.clear();
  const first = getOrCreatePlayer();
  first.stats.batting.power = 99;
  first.stats.bowling.accuracy = 99;
  storage.clear();
  const second = getOrCreatePlayer();
  assert.equal(second.stats.batting.power, 50);
  assert.equal(second.stats.bowling.accuracy, 50);
});

test('partially saved profiles retain progress while missing stats get defaults', () => {
  storage.clear();
  storage.set('six_hitting_contest_player', JSON.stringify({ xp: 120, rank: 'Silver', stats: { batting: { power: 72 } } }));
  const player = getOrCreatePlayer();
  assert.equal(player.xp, 120);
  assert.equal(player.rank, 'Silver');
  assert.equal(player.stats.batting.power, 72);
  assert.equal(player.stats.bowling.accuracy, 50);
});

test('a match can start when browser storage is unavailable', () => {
  const originalStorage = globalThis.localStorage;
  Object.assign(globalThis, { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
  try {
    const game = new MatchController('Medium');
    game.setTossResult(game.state.player.id, 'bat');
    game.startMatch();
    assert.equal(game.state.status, 'playing');
  } finally {
    Object.assign(globalThis, { localStorage: originalStorage });
  }
});

test('leaderboard tolerates corrupt storage and sorts old and new scores', () => {
  storage.clear();
  storage.set('six_hitting_contest_leaderboard', '{bad json');
  assert.deepEqual(readLeaderboard(), []);
  storage.set('six_hitting_contest_leaderboard', JSON.stringify([
    { opponent: 'Bot', biggestSix: '75.5', wicketsLost: '2', outcome: 'won' },
    { opponent: 'Bot', biggestSix: '75.5', wicketsLost: '1', outcome: 'lost' },
    null
  ]));
  addLeaderboardEntry({ date: '', opponent: 'Bot', biggestSix: 80, wicketsLost: 3, outcome: 'WON' });
  assert.deepEqual(readLeaderboard().map(entry => [entry.biggestSix, entry.wicketsLost]), [[80, 3], [75.5, 1], [75.5, 2]]);
});

test('front-foot landing and line distinguish legal balls, wides and no-balls', () => {
  assert.deepEqual(checkExtraBall(delivery(0.5)), { isExtra: false, type: null });
  assert.equal(checkExtraBall(delivery(0)).isExtra, false);
  assert.equal(checkExtraBall(delivery(1)).isExtra, false);
  assert.equal(checkExtraBall({ ...delivery(0.5), frontFootHeel: 0 }).type, 'noball');
  assert.equal(checkExtraBall(delivery(0.5, 1)).type, 'wide');
});

test('front-foot landing is independent of release timing and captured for replay', () => {
  const heel = sampleFrontFootLanding(50, 1, 1);
  assert.ok(heel > 0);
  assert.ok(sampleFrontFootLanding(100, 0.5, 1) < 0);
  assert.equal(checkExtraBall({ ...delivery(0.1), frontFootHeel: heel }).type, 'noball');
  assert.equal(checkExtraBall({ ...delivery(0.9), frontFootHeel: heel }).type, 'noball');
  assert.equal(checkExtraBall({ ...delivery(1), frontFootHeel: -0.01 }).isExtra, false);
});

test('LBW considers pitch, impact, offered shot, stumps, handedness and no-balls', () => {
  const turning = { ...delivery(0.5, 0.25), type: 'offspin' as const, turn: 1 };
  assert.equal(resolveMissedDelivery(turning, 'RHB', true), 'lbw');
  assert.equal(resolveMissedDelivery({ ...turning, batterPosition: { x: 0.6, z: 0 } }, 'RHB', true), 'bowled');
  assert.equal(resolveMissedDelivery({ ...turning, frontFootHeel: 0.01 }, 'RHB', true), null);
  const outsideLeg = { ...delivery(0.5, -0.25), type: 'legspin' as const, turn: 1 };
  assert.equal(resolveMissedDelivery(outsideLeg, 'RHB', true), null);
  const outsideOff = { ...turning, aimTarget: { x: 0.54, z: -3.5 } };
  assert.equal(resolveMissedDelivery(outsideOff, 'RHB', true), null);
  assert.equal(resolveMissedDelivery(outsideOff, 'RHB', false), 'lbw');
  const leftOutsideOff = { ...outsideOff, aimTarget: { x: -0.54, z: -3.5 }, type: 'legspin' as const };
  assert.equal(resolveMissedDelivery(leftOutsideOff, 'LHB', true), null);
  assert.equal(resolveMissedDelivery(leftOutsideOff, 'LHB', false), 'lbw');
  assert.equal(resolveMissedDelivery(delivery(0.5, 0.7), 'RHB', false), null);
});

test('a mistimed stroke that misses the stumps is a dot, not an invented catch', () => {
  const game = match();
  const result = game.recordBall(delivery(0.5, 0.7), { direction: 0, type: 'power', timing: 0, contactZone: 0.5 });
  assert.equal(result.missed, true);
  assert.equal(result.isWicket, false);
  assert.equal(game.getCurrentInnings().wicketsLost, 0);
});

test('bowling meter maps its midpoint to ideal release and clamps extremes', () => {
  assert.equal(bowlingReleaseTiming(-100), 0);
  assert.equal(bowlingReleaseTiming(1200), 0.5);
  assert.equal(bowlingReleaseTiming(3000), 1);
});

test('bowling release timing affects the executed target in a predictable way', () => {
  const target = { x: 0, z: -3.5 };
  assert.deepEqual(bowlingExecutionTarget(target, 0.5, 50), target);
  assert.notDeepEqual(bowlingExecutionTarget(target, 0, 100), target);
  assert.ok(Math.abs(bowlingExecutionTarget(target, 0, 100).z - target.z) < Math.abs(bowlingExecutionTarget(target, 0, 0).z - target.z));
  const early = bowlingExecutionTarget(target, 0.2, 50);
  const late = bowlingExecutionTarget(target, 0.8, 50);
  assert.ok(early.x < 0 && late.x > 0);
  assert.ok(early.z > target.z && late.z < target.z);
});

test('keyboard bowling starts at good length and updates the aim marker', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const listeners: Record<string, (event: any) => void> = {};
  const positions: Array<[number, number]> = [];
  Object.assign(globalThis, {
    window: {
      addEventListener: (name: string, listener: (event: any) => void) => { listeners[name] = listener; },
      removeEventListener: () => {}
    },
    document: {
      getElementById: (id: string) => id === 'screen-gameplay' ? { classList: { contains: () => true } } : null,
      querySelectorAll: () => []
    }
  });
  try {
    const input = new KeyboardInputManager(() => false, () => {}, () => {}, () => {}, () => 'RHB', (x, z) => positions.push([x, z]));
    assert.equal(input.intent.aimZ, -3.5);
    assert.equal(input.getBowlingLineLabel(0), 'Off Side');
    assert.equal(input.getBowlingLineLabel(2), 'Leg Side');
    listeners.keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    listeners.keydown({ key: 'ArrowUp', code: 'ArrowUp' });
    assert.deepEqual(positions, [[0.8, -3.5], [0.8, -5.5]]);
    input.setBowlingAim(-0.8, 0.5);
    listeners.keydown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    assert.deepEqual(positions[2], [0, 0.5]);
    input.destroy();
  } finally {
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test('interrupted keyboard holds clear without releasing a delivery', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const listeners: Record<string, (event: any) => void> = {};
  let starts = 0;
  let releases = 0;
  Object.assign(globalThis, {
    window: { addEventListener: (name: string, fn: (event: any) => void) => { listeners[name] = fn; }, removeEventListener() {} },
    document: {
      getElementById: (id: string) => id === 'screen-gameplay' ? { classList: { contains: () => true } } : null,
      querySelectorAll: () => []
    }
  });
  try {
    const input = new KeyboardInputManager(() => false, () => { starts++; }, () => { releases++; }, () => {}, () => 'RHB', () => {});
    const space = { key: ' ', code: 'Space' };
    listeners.keydown(space);
    assert.equal(starts, 1);
    setGamePaused(true);
    input.cancelHeldInputs();
    listeners.keyup(space);
    setGamePaused(false);
    listeners.keyup(space);
    assert.equal(releases, 0);
    listeners.keydown(space);
    listeners.keyup(space);
    assert.equal(starts, 2);
    assert.equal(releases, 1);
    input.destroy();
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { window: originalWindow, document: originalDocument });
  }
});

test('interrupting a bowling run-up restores controls without delivering', () => {
  const originalDocument = globalThis.document;
  const previousRunUp = globalAutoAssistConfig.isRunUpActive;
  const previousStart = globalAutoAssistConfig.runUpStartTime;
  let removed = 0;
  let controlsRestored = 0;
  let keysCleared = 0;
  let touchCleared = 0;
  let bowlerReset = 0;
  let restoredSide: unknown[] = [];
  Object.assign(globalThis, { document: { getElementById: (id: string) => {
    if (id === 'bowler-runup-indicator') return { remove: () => { removed++; } };
    if (id === 'control-bowling') return { classList: { remove: () => { controlsRestored++; } } };
    return null;
  } } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.keyboardInputManager = { cancelHeldInputs: () => { keysCleared++; } };
    ui.touchBattingControls = { cancelPointer: () => { touchCleared++; } };
    ui.gameScene = { resetBowlerMesh: () => { bowlerReset++; }, setBowlerSide: (...args: unknown[]) => { restoredSide = args; } };
    ui.controller = { getCurrentInnings: () => ({ bowler: { bowlingArm: 'Left' } }) };
    ui.overTheWicket = false;
    ui.userBowlingInProgress = true;
    ui.isBallActive = true;
    ui.bowlingPointerId = 12;
    globalAutoAssistConfig.isRunUpActive = true;
    globalAutoAssistConfig.runUpStartTime = 123;
    ui.interruptControls();
    assert.equal(ui.isBallActive, false);
    assert.equal(ui.userBowlingInProgress, false);
    assert.equal(ui.bowlingPointerId, null);
    assert.equal(globalAutoAssistConfig.isRunUpActive, false);
    assert.equal(globalAutoAssistConfig.runUpStartTime, undefined);
    assert.deepEqual([removed, controlsRestored, keysCleared, touchCleared, bowlerReset], [1, 1, 1, 1, 1]);
    assert.deepEqual(restoredSide, [false, 'Left']);
    ui.endUserBowlingDelivery();
    assert.equal(ui.isBallActive, false);
  } finally {
    globalAutoAssistConfig.isRunUpActive = previousRunUp;
    globalAutoAssistConfig.runUpStartTime = previousStart;
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('each turn applies the active batter handedness to the scene', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bowl');
  game.startMatch();
  game.getCurrentInnings().batter.batterHand = 'LHB';
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: () => null } });
  try {
    const seen: string[] = [];
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.deliveryGeneration = 0;
    ui.cancelBattingRunUp = null;
    ui.botDeliveryTimer = null;
    ui.gameScene = {
      setBatterHandedness: (hand: string) => seen.push(hand),
      setPlayerCreaseOffset() {}, setBowlerSide() {}, setCameraMode() {}
    };
    ui.keyboardInputManager = { updateFeedbackOverlay() {} };
    ui.updateHUD = () => {};
    ui.setupActiveTurn();
    assert.deepEqual(seen, ['LHB']);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('bowler camera screen directions map to the correct pitch coordinates', () => {
  assert.ok(bowlingTargetFromScreen(0, 0.5).x > 0);
  assert.ok(bowlingTargetFromScreen(1, 0.5).x < 0);
  assert.ok(bowlingTargetFromScreen(0.5, 0).z < bowlingTargetFromScreen(0.5, 1).z);
  assert.deepEqual(bowlingTargetFromScreen(0.5, 0), { x: 0, z: -8.2 });
  assert.ok(Math.abs(bowlingTargetFromScreen(0.5, 1).z - 0.5) < 1e-9);
  assert.equal(calculateBounceTarget('off', 'good', 'RHB').x, 0.45);
  assert.equal(calculateBounceTarget('off', 'good', 'LHB').x, -0.45);
  assert.equal(getLineTypeFromAimX(0.45, 'RHB'), 'off');
  assert.equal(getLineTypeFromAimX(-0.45, 'LHB'), 'off');
});

test('bot off-side deliveries use the batter handedness', () => {
  const random = Math.random;
  const bowler = createBotPlayer('Medium');
  bowler.stats.bowling.accuracy = 100;
  Math.random = () => 0.1;
  try {
    const rightHander = botChooseDelivery(bowler, 'Rookie', 'RHB');
    const leftHander = botChooseDelivery(bowler, 'Rookie', 'LHB');
    assert.equal(rightHander.line, 'off');
    assert.equal(leftHander.line, 'off');
    assert.ok(rightHander.aimTarget.x > 0);
    assert.ok(leftHander.aimTarget.x < 0);
  } finally {
    Math.random = random;
  }
});

test('well-timed shots retain their selected direction on every bot tier', () => {
  for (const tier of ['Rookie', 'Medium', 'Hard'] as const) {
    for (let direction = 0; direction < 8; direction++) {
      for (const type of ['defensive', 'grounded', 'lofted', 'power'] as ShotType[]) {
        const game = new MatchController(tier);
        game.setTossResult(game.state.player.id, 'bat');
        game.startMatch();
        const shot = { direction, type, timing: 0.5, contactZone: 0.5 };
        const ball = delivery(0.5);
        assert.equal(evaluateWicket(game.state.player, game.state.bot, ball, shot).isWicket, false);
        const outcome = game.recordBall(ball, shot);
        assert.equal(outcome.shot?.direction, direction);
        assert.equal(outcome.isWicket, false);
      }
    }
  }
});

test('extras do not consume a legal ball and only no-balls start a free hit', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0, 1), null);
  assert.equal(innings.ballsBowled, 0);
  assert.equal(innings.score, 1);
  assert.equal(innings.isNextFreeHit, false);
  game.recordBall({ ...delivery(1), frontFootHeel: 0.01 }, null);
  assert.equal(innings.isNextFreeHit, true);
  game.recordBall(delivery(0, 1), null);
  assert.equal(innings.isNextFreeHit, true);
  const legal = game.recordBall(delivery(0.5), null);
  assert.equal(legal.isFreeHit, true);
  assert.equal(innings.isNextFreeHit, false);
  assert.equal(innings.ballsBowled, 1);
  assert.equal(innings.score, 3);
});

test('the over display keeps upcoming legal balls after extras and shows the sudden-death limit', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  const originalDocument = globalThis.document;
  const count = { innerText: '' };
  const children: any[] = [];
  const tracker = {
    children,
    appendChild: (child: any) => { children.push(child); },
    removeChild: () => { children.pop(); },
    querySelectorAll: () => children,
    get lastChild() { return children[children.length - 1]; }
  };
  Object.assign(globalThis, { document: {
    getElementById: (id: string) => id === 'hud-balls-count' ? count : id === 'over-tracker' ? tracker : null,
    createElement: () => ({ className: '', textContent: '', title: '' })
  } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    game.recordBall(delivery(0, 1), null);
    ui.updateHUD();
    assert.equal(count.innerText, '0/6');
    assert.equal(children.length, 7);
    assert.equal(children[0].textContent, 'WD');
    assert.match(children[6].title, /Upcoming/);

    innings.balls = [];
    innings.ballsBowled = 0;
    game.state.tieBreakerActive = true;
    game.recordBall(delivery(0, 1), null);
    ui.updateHUD();
    assert.equal(count.innerText, '0/1');
    assert.equal(children.length, 2);
    assert.match(children[1].title, /Upcoming/);
    game.recordBall(delivery(0.5), null);
    ui.updateHUD();
    assert.equal(count.innerText, '1/1');
    assert.equal(children.length, 2);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('bat contact cancels a wide and counts the delivery as legal', () => {
  const game = match();
  const shot = { direction: 0, type: 'lofted' as const, timing: 0.5, contactZone: 0.5 };
  const result = game.recordBall(delivery(0.5, 1), shot);
  assert.equal(result.isExtra, false);
  assert.equal(result.missed, false);
  assert.equal(game.getCurrentInnings().ballsBowled, 1);
  assert.equal(game.finalizeBallOutcome(85, false, true), 6);
  assert.equal(game.getCurrentInnings().score, 6);
  const unreachable = game.recordBall(delivery(0.5, 1.4), shot);
  assert.equal(unreachable.extraType, 'wide');
  assert.equal(unreachable.missed, true);
  assert.equal(game.getCurrentInnings().ballsBowled, 1);
});

test('a hit off a no-ball scores as well as the penalty and preserves the free hit', () => {
  const game = match();
  const shot = { direction: 0, type: 'power' as const, timing: 0.5, contactZone: 0.5 };
  const result = game.recordBall({ ...delivery(1), frontFootHeel: 0.01 }, shot);
  const innings = game.getCurrentInnings();
  assert.equal(result.extraType, 'noball');
  assert.equal(result.missed, false);
  assert.equal(innings.ballsBowled, 0);
  assert.equal(innings.score, 1);
  assert.equal(game.finalizeBallOutcome(95, false, true), 6);
  assert.equal(innings.score, 7);
  assert.equal(innings.biggestSix, 95);
  assert.equal(innings.isNextFreeHit, true);
});

test('six legal deliveries finish the innings without counting extras', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0, 1), null);
  for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
  assert.equal(innings.ballsBowled, 6);
  assert.equal(innings.balls.length, 7);
  assert.equal(innings.finished, true);
});

test('dismissals do not cut a regular innings short', () => {
  const game = new MatchController('Hard');
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  const innings = game.getCurrentInnings();
  for (let i = 0; i < 6; i++) {
    const outcome = game.recordBall(delivery(0.5), { direction: 0, type: 'power', timing: 0, contactZone: 0.5 });
    assert.equal(outcome.isWicket, true);
    assert.equal(innings.finished, i === 5);
    assert.equal(innings.wicketsLost, i + 1);
  }
  assert.equal(innings.ballsBowled, 6);
});

test('shot trajectory follows all four cardinal directions with finite speed', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const trajectory = (direction: number) => calculateShotTrajectory(
    1, 0.5, 0.5, direction * Math.PI / 4 - Math.PI / 2, zero, zero
  );
  const [straight, right, back, left] = [0, 2, 4, 6].map(trajectory);
  assert.ok(straight.z > 0 && Math.abs(straight.x) < 1e-10);
  assert.ok(right.x > 0 && Math.abs(right.z) < 1e-10);
  assert.ok(back.z < 0 && Math.abs(back.x) < 1e-10);
  assert.ok(left.x < 0 && Math.abs(left.z) < 1e-10);
  for (const velocity of [straight, right, back, left]) {
    assert.ok(Object.values(velocity).every(Number.isFinite));
    assert.ok(Math.hypot(velocity.x, velocity.y, velocity.z) <= 38.000001);
  }
});

test('shot quality affects exit speed without changing direction', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const clean = calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 4, zero, zero);
  const mistimed = calculateShotTrajectory(0, 0.5, 0.5, -Math.PI / 4, zero, zero);
  assert.ok(Math.hypot(clean.x, clean.y, clean.z) > Math.hypot(mistimed.x, mistimed.y, mistimed.z));
  assert.ok(Math.abs(clean.x / clean.z - mistimed.x / mistimed.z) < 1e-9);
});

test('incoming delivery speed and movement influence the resulting shot', () => {
  const fast = deliveryVelocityAtCrease({ ...delivery(0.5), pace: 1 });
  const slow = deliveryVelocityAtCrease({ ...delivery(0.5), type: 'slow' });
  const swinging = deliveryVelocityAtCrease({ ...delivery(0.5), swing: 1 });
  assert.ok(Math.abs(fast.z) > Math.abs(slow.z));
  assert.ok(swinging.x < 0);
  const shot = (incoming: typeof fast) => calculateShotTrajectory(0.6, 0.5, 0.5, -Math.PI / 2, incoming, { x: 0, y: 0, z: 0 });
  assert.notEqual(shot(fast).z, shot(slow).z);
  assert.ok(shot(swinging).x < shot({ ...swinging, x: 0 }).x);
});

test('footwork choice changes the timing window for short and full balls', () => {
  assert.ok(footworkFactor('front_foot', 'full') > footworkFactor('back_foot', 'full'));
  assert.ok(footworkFactor('back_foot', 'short') > footworkFactor('front_foot', 'short'));
  const game = match();
  const bowler = game.state.bot;
  const batter = game.state.player;
  const ball = { ...delivery(0.5), length: 'full' as const };
  const shot = { direction: 0, type: 'grounded' as const, timing: 0.5, contactZone: 0.5 };
  const front = evaluateWicket(batter, bowler, ball, { ...shot, footwork: 'front_foot' });
  const back = evaluateWicket(batter, bowler, ball, { ...shot, footwork: 'back_foot' });
  assert.ok(front.safeWindowMs > back.safeWindowMs);
});

test('batter power influences the ball exit speed', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const velocity = (power: number) => calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', 'power', power);
  const low = velocity(30);
  const high = velocity(80);
  assert.ok(Math.hypot(high.x, high.y, high.z) > Math.hypot(low.x, low.y, low.z));
});

test('ball drag produces the same damping over time at 30 and 60 fps', () => {
  const at30 = frameIndependentDamping(BALL_AIR_DAMPING, 1 / 30) ** 30;
  const at60 = frameIndependentDamping(BALL_AIR_DAMPING, 1 / 60) ** 60;
  assert.ok(Math.abs(at30 - at60) < 1e-12);
});

test('a well-hit lofted shot can clear the boundary before bouncing', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const velocity = calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', 'lofted');
  let y = 0.4;
  let z = BATTER_CREASE_Z;
  let bounced = false;
  for (let i = 0; i < 600 && z < 65 && !bounced; i++) {
    velocity.y *= BALL_AIR_DAMPING;
    velocity.z *= BALL_AIR_DAMPING;
    if (y < BALL_RADIUS_METERS) { bounced = true; break; }
    if (y > BALL_RADIUS_METERS) velocity.y -= 9.81 / 60;
    y += velocity.y / 60;
    z += velocity.z / 60;
  }
  assert.equal(bounced, false);
  assert.ok(z >= 65);
});

test('fixed-step shot physics resolves a lofted six and a grounded shot', () => {
  const zero = { x: 0, y: 0, z: 0 };
  const simulate = (type: string): BallState => {
    const state: BallState = {
      position: { x: 0, y: 0.4, z: BATTER_CREASE_Z },
      velocity: calculateShotTrajectory(1, 0.5, 0.5, -Math.PI / 2, zero, zero, true, true, 'Medium', type),
      hasBounced: false, reachedBoundary: false, stopped: false
    };
    for (let i = 0; i < 2400 && !state.stopped && !state.reachedBoundary; i++) stepBall(state, 1 / 120);
    return state;
  };
  const loft = simulate('lofted');
  assert.equal(loft.reachedBoundary, true);
  assert.equal(loft.hasBounced, false);
  const ground = simulate('grounded');
  assert.equal(ground.hasBounced, true);
  assert.ok(ground.reachedBoundary || ground.stopped);
});

test('rope crossing and bounce are resolved in their actual order within a physics step', () => {
  const nearRope = (height: number): BallState => ({
    position: { x: 64.95, y: height, z: 0 },
    velocity: { x: 30, y: -4, z: 0 },
    hasBounced: false, reachedBoundary: false, stopped: false
  });
  const clearsRope = nearRope(BALL_RADIUS_METERS + 0.015);
  stepBall(clearsRope, 0.01);
  assert.equal(clearsRope.reachedBoundary, true);
  assert.equal(clearsRope.hasBounced, false);
  assert.equal(evaluateFinalOutcome(65, clearsRope.hasBounced, clearsRope.reachedBoundary), 6);

  const landsFirst = nearRope(BALL_RADIUS_METERS + 0.005);
  stepBall(landsFirst, 0.01);
  assert.equal(landsFirst.reachedBoundary, true);
  assert.equal(landsFirst.hasBounced, true);
  assert.equal(evaluateFinalOutcome(65, landsFirst.hasBounced, landsFirst.reachedBoundary), 4);
});

test('physical ground contact uses a regulation-sized ball radius', () => {
  const circumference = 2 * Math.PI * BALL_RADIUS_METERS;
  assert.ok(circumference >= 0.224 && circumference <= 0.229);
  const ball: BallState = { position: { x: 0, y: BALL_RADIUS_METERS + 0.01, z: 0 }, velocity: { x: 0, y: -1, z: 0 }, hasBounced: false, reachedBoundary: false, stopped: false };
  stepBall(ball, 0.02);
  assert.equal(ball.hasBounced, true);
  assert.equal(ball.position.y, BALL_RADIUS_METERS);
});

test('a six remains in flight beyond the rope until its landing distance is known', () => {
  const ball: BallState = {
    position: { x: 0, y: 1, z: BATTER_CREASE_Z },
    velocity: { x: 0, y: 20, z: 31 },
    hasBounced: false, reachedBoundary: false, stopped: false
  };
  let ropeDistance = 0;
  for (let i = 0; i < 1200 && !ball.hasBounced; i++) {
    stepBall(ball, 1 / 120);
    if (ball.reachedBoundary && !ropeDistance) ropeDistance = ball.position.z - BATTER_CREASE_Z;
  }
  assert.equal(ball.boundaryOnFull, true);
  assert.equal(ball.reachedBoundary, true);
  assert.equal(ball.hasBounced, true);
  assert.ok(ball.position.z - BATTER_CREASE_Z > ropeDistance + 5);
});

test('delivery animation advances at the same speed at 30 and 60 fps', () => {
  const at30 = deliveryAnimationStep(1000 / 30, 1) * 30;
  const at60 = deliveryAnimationStep(1000 / 60, 1) * 60;
  assert.ok(Math.abs(at30 - at60) < 1e-9);
  assert.equal(deliveryAnimationStep(500, 1), 3);
});

test('delivery trajectory reaches the bounce point and the batter crease', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0.4, y: 0.06, z: -7.5 };
  const crease = { x: 0.4, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (crease.z - release.z);
  const atBounce = getParabolicFlightPosition(bounceProgress, release, bounce, crease);
  const atCrease = getParabolicFlightPosition(1, release, bounce, crease);
  assert.ok(Math.abs(atBounce.z - bounce.z) < 1e-9);
  assert.ok(Math.abs(atBounce.y - bounce.y) < 1e-9);
  assert.ok(Math.abs(atCrease.x - crease.x) < 1e-9);
  assert.ok(Math.abs(atCrease.y - crease.y) < 1e-9);
  assert.ok(Math.abs(atCrease.z - crease.z) < 1e-9);
});

test('delivery variations affect pace and turn only after pitching', () => {
  assert.ok(deliveryDurationMs('fast') < deliveryDurationMs('slow'));
  assert.ok(deliveryDurationMs('fast', 1) < deliveryDurationMs('fast', 0));
  assert.ok(deliveryDurationMs('offspin', 1) < deliveryDurationMs('offspin', 0));
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (end.z - release.z);
  assert.ok(Math.abs(getDeliveryFlightPosition(bounceProgress, release, bounce, end, 'offspin').x) < 1e-9);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'offspin').x < 0);
  assert.equal(getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 0).x, 0);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 1).x < getDeliveryFlightPosition(1, release, bounce, end, 'offspin', 0.5).x);
  assert.ok(getDeliveryFlightPosition(1, release, bounce, end, 'legspin').x > 0);
  assert.equal(getDeliveryFlightPosition(1, release, bounce, end, 'fast').x, 0);
  const spinner = { ...delivery(0.5, -0.8), type: 'offspin' as const };
  assert.equal(checkExtraBall(spinner).type, 'wide');
  assert.equal(checkExtraBall({ ...spinner, turn: 0 }).isExtra, false);
});

test('pace swing develops in the air and spin turn only after the bounce', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const bounceProgress = (bounce.z - release.z) / (end.z - release.z);
  const left = deliverySwingAtBounce('fast', -1, bounce.z);
  const right = deliverySwingAtBounce('fast', 1, bounce.z);
  assert.ok(left > 0 && right < 0);
  assert.equal(left, -right);
  assert.equal(getDeliveryFlightPosition(0, release, bounce, end, 'fast', 0, 1).x, 0);
  const midway = getDeliveryFlightPosition(bounceProgress / 2, release, bounce, end, 'fast', 0, 1).x;
  const impact = getDeliveryFlightPosition(bounceProgress, release, bounce, end, 'fast', 0, 1).x;
  assert.ok(midway < 0 && midway > impact);
  assert.ok(Math.abs(impact - right) < 1e-9);
  const atCrease = getDeliveryFlightPosition(1, release, bounce, end, 'fast', 0, 1).x;
  assert.ok(atCrease < impact);
  assert.ok(Math.abs(atCrease - deliveryCreaseX({ ...delivery(0.5), swing: 1 })) < 1e-9);
  assert.equal(deliverySwingAtBounce('offspin', 1, bounce.z), 0);
  assert.equal(isSpinDelivery('offspin'), true);
  assert.equal(isSpinDelivery('fast'), false);
  assert.equal(checkExtraBall({ ...delivery(0.5, -0.7), swing: 1 }).type, 'wide');
});

test('pitch marker matches the actual bounce for pace, swing and spin', () => {
  const release = { x: 0.6, y: 1.9, z: 10 };
  for (const ball of [delivery(0.5, -0.2), { ...delivery(0.5, 0.3), swing: -0.8 }, { ...delivery(0.5, -0.3), type: 'legspin' as const, turn: 1 }]) {
    const bounce = { x: ball.aimTarget.x, y: 0.06, z: ball.aimTarget.z };
    const end = { x: ball.aimTarget.x, y: 0.8, z: BATTER_CREASE_Z };
    const progress = (bounce.z - release.z) / (end.z - release.z);
    const actual = getDeliveryFlightPosition(progress, release, bounce, end, ball.type, ball.turn, ball.swing, ball.pace);
    const marker = deliveryPitchPoint(ball);
    assert.ok(Math.abs(actual.x - marker.x) < 1e-9);
    assert.ok(Math.abs(actual.z - marker.z) < 1e-9);
  }
});

test('bowling side and arm change the same path used for visuals and adjudication', () => {
  for (const arm of ['Right', 'Left'] as const) {
    for (const overTheWicket of [true, false]) {
      const ball = { ...delivery(0.5, 0), bowlingArm: arm, overTheWicket, swing: 0.4 };
      const release = { x: deliveryReleaseX(ball), y: 1.9, z: 10 };
      const bounce = { x: ball.aimTarget.x, y: 0.06, z: ball.aimTarget.z };
      const end = { x: deliveryBaseCreaseX(ball), y: 0.8, z: BATTER_CREASE_Z };
      const actual = getDeliveryFlightPosition(1, release, bounce, end, ball.type, ball.turn, ball.swing, ball.pace);
      assert.ok(Math.abs(actual.x - deliveryCreaseX(ball)) < 1e-9);
      assert.equal(Math.sign(release.x), (arm === 'Right' ? 1 : -1) * (overTheWicket ? 1 : -1));
    }
  }
  const over = { ...delivery(0.5, 0.7), bowlingArm: 'Right' as const, overTheWicket: true };
  const around = { ...over, overTheWicket: false };
  assert.notEqual(deliveryCreaseX(over), deliveryCreaseX(around));
  assert.deepEqual(deliveryPitchPoint(over), deliveryPitchPoint(around));
  assert.notEqual(deliveryVelocityAtCrease(over).x, deliveryVelocityAtCrease(around).x);
  assert.notEqual(battingContactZone(over, 0.5), battingContactZone(around, 0.5));
  assert.equal(checkExtraBall(over).isExtra, false);
  assert.equal(checkExtraBall(around).type, 'wide');
});

test('delivery height is continuous at the pitch and rises after impact', () => {
  const release = { x: 0, y: 1.9, z: 10 };
  const bounce = { x: 0, y: 0.06, z: -3.5 };
  const end = { x: 0, y: 0.85, z: BATTER_CREASE_Z };
  const at = (bounce.z - release.z) / (end.z - release.z);
  const before = getDeliveryFlightPosition(at - 0.001, release, bounce, end, 'fast');
  const impact = getDeliveryFlightPosition(at, release, bounce, end, 'fast');
  const after = getDeliveryFlightPosition(at + 0.001, release, bounce, end, 'fast');
  assert.ok(Math.abs(impact.y - bounce.y) < 1e-9);
  assert.ok(before.y > impact.y && after.y > impact.y);
  assert.ok(Math.abs(before.y - after.y) < 0.02);
});

test('delivery type switches between speed and swing or spin controls', () => {
  const originalDocument = globalThis.document;
  const hidden: Record<string, boolean> = {};
  Object.assign(globalThis, { document: { getElementById: (id: string) => ({ classList: { toggle: (_name: string, value: boolean) => { hidden[id] = value; } } }) } });
  try {
    updateBowlingAdjustmentVisibility('fast');
    assert.deepEqual(hidden, { 'bowl-pace-control': false, 'bowl-swing-control': false, 'bowl-turn-control': true });
    updateBowlingAdjustmentVisibility('offspin');
    assert.deepEqual(hidden, { 'bowl-pace-control': false, 'bowl-swing-control': true, 'bowl-turn-control': false });
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('delivery timings correspond to plausible average release-to-crease speeds', () => {
  const speedKmh = (type: 'fast' | 'offspin') => 18.8 / (deliveryDurationMs(type) / 1000) * 3.6;
  assert.ok(speedKmh('fast') >= 100 && speedKmh('fast') <= 150);
  assert.ok(speedKmh('offspin') >= 55 && speedKmh('offspin') <= 90);
});

test('bat contact and wide decisions use the delivered line at the crease', () => {
  const straight = delivery(0.5);
  const swinging = { ...straight, swing: -1 };
  const turning = { ...straight, type: 'offspin' as const, turn: 1 };
  assert.equal(battingContactZone(straight, 0.5), 0.5);
  assert.ok(deliveryCreaseX(swinging) > 0);
  assert.ok(battingContactZone(swinging, 0.5) > 0.5);
  assert.ok(battingContactZone(turning, 0.5) < 0.5);
  assert.ok(battingContactZone(straight, 0) < 0.5);
});

test('delivery visuals and crease-line scoring agree for pace and spin', () => {
  const release = { x: -0.6, y: 1.9, z: 10 };
  const bounce = { x: 0.25, y: 0.06, z: -3.5 };
  const end = { x: bounce.x, y: 0.85, z: BATTER_CREASE_Z };
  for (const choice of [
    { ...delivery(0.5, 0.25), swing: -1 },
    { ...delivery(0.5, 0.25), swing: 1 },
    { ...delivery(0.5, 0.25), type: 'offspin' as const, turn: 0.8 },
    { ...delivery(0.5, 0.25), type: 'legspin' as const, turn: 0.8 }
  ]) {
    const visible = getDeliveryFlightPosition(1, release, bounce, end, choice.type, choice.turn, choice.swing, choice.pace);
    assert.ok(Math.abs(visible.x - deliveryCreaseX(choice)) < 1e-9);
  }
});

test('a yorker reaches the batter lower than a short delivery', () => {
  assert.ok(deliveryArrivalHeight(-8.2) < deliveryArrivalHeight(-2.2));
  assert.ok(deliveryArrivalHeight(-2.2) < deliveryArrivalHeight(0.5));
});

test('boundary scoring uses the rope crossing and bounce, not carry distance alone', () => {
  assert.equal(evaluateFinalOutcome(58, false, true), 6);
  assert.equal(evaluateFinalOutcome(58, true, true), 4);
  assert.equal(evaluateFinalOutcome(70, false, false), 3);
  assert.equal(calculateShotDistance({ position: { x: 0, z: -8.8 } }), 0);
  assert.ok(Math.abs(calculateShotDistance({ position: { x: 3, z: -4.8 } }) - 5) < 1e-9);
});

test('finalizing a six records its runs and biggest hit consistently', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0.5), { direction: 0, type: 'power', timing: 0.5, contactZone: 0.5 });
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(innings.score, 6);
  assert.equal(innings.biggestSix, 58);
  assert.equal(innings.balls[0].runs, 6);
  assert.equal(innings.balls[0].distance, 58);
});

test('the result banner uses the same finalized distance as the score', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bowl');
  game.startMatch();
  const ball = delivery(0.5);
  const outcome = game.recordBall(ball, { direction: 0, type: 'lofted', timing: 0.5, contactZone: 0.5 });
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldPerformance = globalThis.performance;
  let now = oldPerformance.now();
  const timers: Array<() => void> = [];
  let resolveBall: () => void = () => {};
  let title = '';
  Object.assign(globalThis, {
    document: { getElementById: () => null },
    performance: { now: () => now },
    window: { setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; } }
  });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.activeDelivery = ball;
    ui.deliveryGeneration = 1;
    ui.deliveryStarted = false;
    ui.hideResultToast = () => {};
    ui.hideBattingHelper = () => {};
    ui.hideAssistedPrompt = () => {};
    ui.showResultToast = (value: string) => { title = value; };
    ui.updateHUD = () => {};
    ui.setupActiveTurn = () => {};
    ui.gameScene = {
      prepareDeliverySound() {}, setCameraMode() {},
      animateDelivery: (_aim: unknown, _length: unknown, _type: unknown, _arrived: unknown, resolved: () => void) => { resolveBall = resolved; },
      getShotDistance: () => 150,
      shotBoundaryOnFull: true,
      shotReachedBoundary: true
    };
    ui.deliverBall3D();
    resolveBall();
    assert.equal(outcome.distance, 130);
    assert.equal(outcome.runs, 6);
    assert.equal(game.getCurrentInnings().biggestSix, 130);
    assert.equal(title, 'SIX! 130.0m');
    now += 2100;
    timers.shift()!();
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow, performance: oldPerformance });
  }
});

test('bot skill increases across the three difficulty tiers', () => {
  const bots = (['Rookie', 'Medium', 'Hard'] as const).map(createBotPlayer);
  assert.deepEqual(bots.map(bot => bot.stats.bowling.accuracy), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.stats.batting.timing), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.rank), ['Bronze', 'Gold', 'Legend']);
});

test('harder bot batting is more consistent around the arrival time', () => {
  const originalRandom = Math.random;
  const averageDeviation = (tier: 'Rookie' | 'Hard'): number => {
    let seed = 12345;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const batter = createBotPlayer(tier);
    const bowler = createBotPlayer('Medium');
    let total = 0;
    for (let i = 0; i < 500; i++) total += Math.abs(botChooseShot(batter, bowler, delivery(0.5), tier).timing - 0.5);
    return total / 500;
  };
  try {
    const rookie = averageDeviation('Rookie');
    const hard = averageDeviation('Hard');
    assert.ok(rookie > hard);
    assert.ok(rookie < 0.15);
  } finally {
    Math.random = originalRandom;
  }
});

test('recording a bot delivery preserves the line the batter actually saw', () => {
  const game = match();
  game.setTossResult(game.state.player.id, 'bat');
  game.startMatch();
  game.state.player.batterHand = 'LHB';
  const ball = delivery(0.5, 0.7);
  game.recordBall(ball, null);
  assert.equal(ball.aimTarget.x, 0.7);
  assert.equal(game.getCurrentInnings().balls[0].delivery.aimTarget.x, 0.7);
});

test('with equal biggest six and wickets, more sixes beat greater total distance', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null
  });
  first.biggestSix = second.biggestSix = 80;
  first.balls = [hit(80, 6), hit(60, 6)];
  second.balls = [hit(80, 6), hit(59, 4), hit(50, 4)];
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'six_count');
});

test('total distance decides only after the number of sixes is tied', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({ ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs, isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null });
  first.biggestSix = second.biggestSix = 80;
  first.balls = [hit(80, 6), hit(20, 4)];
  second.balls = [hit(80, 6), hit(40, 4)];
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, second.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'total_carry');
});

test('without a six and with equal wickets, runs decide instead of aggregate distance', () => {
  const game = match();
  const [first, second] = game.state.innings;
  const hit = (distance: number, runs: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null
  });
  first.balls = [hit(60, 2)]; first.score = 2;
  second.balls = [hit(20, 4)]; second.score = 4;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, second.batter.id);
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'runs');
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /4 vs 2/);
});

test('without a six, equal wickets and equal runs lead to sudden death', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  game.state.innings[0].balls = [{ ballNumber: 1, delivery: delivery(0.5), shot: null, distance: 30, runs: 0, isWicket: false, wicketReason: '', isFreeHit: false, isExtra: false, extraType: null }];
  (game as any).resolveMatch();
  assert.equal(game.state.tieBreakerActive, true);
});

test('fully tied innings start one-ball sudden death', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  assert.equal(game.state.tieBreakerActive, true);
  assert.equal(game.state.innings.length, 4);
  assert.equal(game.state.currentInningsIndex, 2);
  assert.equal(game.state.status, 'playing');
});

test('sudden death compares legal hits even when an extra came first', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const [first, second] = game.state.innings.slice(2);
  const outcome = (distance: number, isExtra: boolean): BallOutcome => ({
    ballNumber: 1, delivery: delivery(isExtra ? 0 : 0.5), shot: null,
    distance, isWicket: false, wicketReason: '', isFreeHit: false,
    isExtra, extraType: isExtra ? 'wide' : null
  });
  first.balls = [outcome(0, true), outcome(70, false)];
  second.balls = [outcome(50, false)];
  game.state.currentInningsIndex = 3;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /70\.0m vs 50\.0m/);
});

test('sudden-death wicket result explains the dismissal instead of a distance win', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const [first, second] = game.state.innings.slice(2);
  first.wicketsLost = 0;
  second.wicketsLost = 1;
  (game as any).resolveMatch();
  assert.equal(game.state.winnerId, first.batter.id);
  assert.match(game.state.tieBreakDetails?.marginText ?? '', /survived.*dismissed/);
});

test('match summary shows both sudden-death innings and their extras', () => {
  const game = match();
  game.state.currentInningsIndex = 1;
  (game as any).resolveMatch();
  const playerExtra = game.state.innings.slice(2).find(item => item.batter.id === game.state.player.id)!;
  const botExtra = game.state.innings.slice(2).find(item => item.batter.id === game.state.bot.id)!;
  const ball = (isExtra: boolean, distance: number): BallOutcome => ({
    ballNumber: 1, delivery: delivery(0.5), shot: null, distance, runs: isExtra ? undefined : 4,
    isWicket: false, wicketReason: '', isFreeHit: false, isExtra, extraType: isExtra ? 'wide' : null
  });
  playerExtra.balls = [ball(true, 0), ball(false, 48)];
  playerExtra.score = 5;
  botExtra.balls = [ball(false, 25)];
  botExtra.score = 4;
  game.state.status = 'completed';
  const originalDocument = globalThis.document;
  const playerLabel = { innerText: '' };
  const botLabel = { innerText: '' };
  let hidden = true;
  const trackers: Record<string, BallOutcome[]> = {};
  Object.assign(globalThis, { document: { getElementById: (id: string) => {
    if (id === 'summary-sudden-death') return { classList: { toggle: (_name: string, value: boolean) => { hidden = value; } } };
    if (id === 'summary-sudden-player') return playerLabel;
    if (id === 'summary-sudden-bot') return botLabel;
    return null;
  } } });
  try {
    const ui = Object.create(UIManager.prototype) as any;
    ui.controller = game;
    ui.recordedSummary = game.state;
    ui.hideResultToast = () => {};
    ui.keyboardInputManager = { closeHelpModal() {} };
    ui.renderMiniTracker = (id: string, balls: BallOutcome[]) => { trackers[id] = balls; };
    ui.showGameOverScreen();
    assert.equal(hidden, false);
    assert.match(playerLabel.innerText, /5\/0 · 48\.0m/);
    assert.match(botLabel.innerText, /4\/0 · 25\.0m/);
    assert.equal(trackers['summary-sudden-player-tracker'].length, 2);
    assert.equal(trackers['summary-sudden-player-tracker'][0].extraType, 'wide');
    game.state.tieBreakerActive = false;
    ui.showGameOverScreen();
    assert.equal(hidden, true);
  } finally {
    Object.assign(globalThis, { document: originalDocument });
  }
});

test('a tied match completes both sudden-death innings and awards draw progression', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  const parent = { removeChild() {} };
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: parent }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (const legalBalls of [6, 6, 1, 1]) {
      const innings = game.getCurrentInnings();
      for (let i = 0; i < legalBalls; i++) game.recordBall(delivery(0.5), null);
      assert.equal(innings.finished, true);
      game.handleInningsCompletion();
      const advance = timers.shift();
      assert.ok(advance);
      advance();
    }
    assert.equal(game.state.status, 'completed');
    assert.equal(game.state.winnerId, null);
    assert.equal(game.state.tieBreakDetails?.deciderTier, 'draw');
    assert.equal(game.state.progression?.xpGained, 50);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('a finished innings schedules only one transition', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() {} } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    game.handleInningsCompletion();
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(game.state.currentInningsIndex, 1);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('an innings transition waits for gameplay to resume', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() {} } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    setGamePaused(true);
    now += 5000;
    timers.shift()!();
    assert.equal(game.state.currentInningsIndex, 0);
    setGamePaused(false);
    now += 2100;
    timers.shift()!();
    assert.equal(game.state.currentInningsIndex, 1);
  } finally {
    setGamePaused(false);
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});

test('reset invalidates a pending innings transition and removes its overlay', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalPerformance = globalThis.performance;
  let now = originalPerformance.now();
  const timers: Array<() => void> = [];
  let removed = 0;
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: { removeChild() { removed++; } } }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    performance: { now: () => now },
    window: { setTimeout: (callback: () => void) => { timers.push(() => { now += 2100; callback(); }); return timers.length; } }
  });
  try {
    for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
    game.handleInningsCompletion();
    game.reset();
    assert.equal(removed, 1);
    timers[0]();
    assert.equal(game.state.status, 'toss');
    assert.equal(game.state.currentInningsIndex, 0);
    assert.equal(removed, 1);
  } finally {
    Object.assign(globalThis, { document: originalDocument, window: originalWindow, performance: originalPerformance });
  }
});
