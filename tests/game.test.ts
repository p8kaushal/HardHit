import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotPlayer, MatchController } from '../src/game';
import { calculateShotDistance, calculateShotTrajectory, checkExtraBall, evaluateFinalOutcome } from '../src/formula';
import type { DeliveryChoice } from '../src/types';

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
