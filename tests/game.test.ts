import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotPlayer, MatchController } from '../src/game';
import { BATTER_CREASE_Z, calculateShotDistance, calculateShotTrajectory, checkExtraBall, deliveryAnimationStep, evaluateFinalOutcome, frameIndependentDamping, getParabolicFlightPosition } from '../src/formula';
import type { BallOutcome, DeliveryChoice } from '../src/types';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value)
} });

const delivery = (timing: number, x = 0): DeliveryChoice => ({
  aimTarget: { x, z: -3.5 }, line: 'middle', length: 'good', type: 'fast', releaseTiming: timing
});

function match(): MatchController {
  storage.clear();
  const controller = new MatchController('Medium');
  controller.setTossResult(controller.state.player.id, 'bowl');
  controller.startMatch();
  return controller;
}

test('release timing and line distinguish legal balls, wides and no-balls', () => {
  assert.deepEqual(checkExtraBall(delivery(0.5)), { isExtra: false, type: null });
  assert.equal(checkExtraBall(delivery(0)).type, 'wide');
  assert.equal(checkExtraBall(delivery(1)).type, 'noball');
  assert.equal(checkExtraBall(delivery(0.5, 1)).type, 'wide');
});

test('extras do not consume a legal ball and only no-balls start a free hit', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0), null);
  assert.equal(innings.ballsBowled, 0);
  assert.equal(innings.score, 1);
  assert.equal(innings.isNextFreeHit, false);
  game.recordBall(delivery(1), null);
  assert.equal(innings.isNextFreeHit, true);
  game.recordBall(delivery(0), null);
  assert.equal(innings.isNextFreeHit, true);
  const legal = game.recordBall(delivery(0.5), null);
  assert.equal(legal.isFreeHit, true);
  assert.equal(innings.isNextFreeHit, false);
  assert.equal(innings.ballsBowled, 1);
  assert.equal(innings.score, 3);
});

test('six legal deliveries finish the innings without counting extras', () => {
  const game = match();
  const innings = game.getCurrentInnings();
  game.recordBall(delivery(0), null);
  for (let i = 0; i < 6; i++) game.recordBall(delivery(0.5), null);
  assert.equal(innings.ballsBowled, 6);
  assert.equal(innings.balls.length, 7);
  assert.equal(innings.finished, true);
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

test('ball drag produces the same damping over time at 30 and 60 fps', () => {
  const at30 = frameIndependentDamping(0.985, 1 / 30) ** 30;
  const at60 = frameIndependentDamping(0.985, 1 / 60) ** 60;
  assert.ok(Math.abs(at30 - at60) < 1e-12);
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
  game.recordBall(delivery(0.5), null);
  innings.balls[0].shot = { direction: 0, type: 'power', timing: 0.5, contactZone: 0.5 };
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(game.finalizeBallOutcome(58, false, true), 6);
  assert.equal(innings.score, 6);
  assert.equal(innings.biggestSix, 58);
  assert.equal(innings.balls[0].runs, 6);
  assert.equal(innings.balls[0].distance, 58);
});

test('bot skill increases across the three difficulty tiers', () => {
  const bots = (['Rookie', 'Medium', 'Hard'] as const).map(createBotPlayer);
  assert.deepEqual(bots.map(bot => bot.stats.bowling.accuracy), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.stats.batting.timing), [35, 50, 65]);
  assert.deepEqual(bots.map(bot => bot.rank), ['Bronze', 'Gold', 'Legend']);
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

test('tie breaks compare second sixes before total carry and exclude fours', () => {
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
  assert.equal(game.state.tieBreakDetails?.deciderTier, 'second_biggest_six');
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

test('a tied match completes both sudden-death innings and awards draw progression', () => {
  const game = match();
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const timers: Array<() => void> = [];
  const parent = { removeChild() {} };
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ style: {}, parentNode: parent }),
      getElementById: () => null,
      body: { appendChild() {} }
    },
    setTimeout: (callback: () => void) => { timers.push(callback); return 0; }
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
    Object.assign(globalThis, { document: originalDocument, setTimeout: originalSetTimeout });
  }
});
