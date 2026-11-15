import { createBotPlayer } from './game';
import { botChooseDelivery, botChooseShot } from './bot';
import { resolveMissedDelivery, checkExtraBall, resolveDeliveryExtra, deliveryIncomingVelocityAtTime, battingAssistanceMultiplier, shotFlightQuality, calculateShotTrajectory, calculateShotDistance, evaluateFinalOutcome } from './formula';
import type { DeliveryChoice, DeliveryType, FieldPreset, ShotChoice } from './types';
import { SeededRandom } from './random';
import { stepBall, type BallState } from './ball-physics';
import { advanceFielder, createDefaultFieldLayout, decideAutomatedRuns, FIELDING_MAX_RECOVERY_SECONDS, fielderReachProfileFromRatings, fielderThrowSpeedFromRating, isCatchDismissalAllowed, type RatedFielder } from './fielding';
import { findBatBallContact } from './bat-physics';

export interface BotSimulationResult {
  tier: 'Rookie' | 'Medium' | 'Hard';
  overs: number;
  attempts: number;
  legalBalls: number;
  wides: number;
  noBalls: number;
  wickets: number;
  runs: number;
  dots: number;
  fours: number;
  sixes: number;
  groundStops: number;
  /** Ground stops after the ball had already come to rest. */
  recoveredAfterRest: number;
  /** Stopped shots that exceeded the bounded recovery wait. */
  recoveryTimeouts: number;
  catches: number;
  runOuts: number;
  incompleteOvers: number;
  /** Bat runs scored on no-balls, included in runs and boundary counts. */
  noBallBatRuns: number;
  /** Provisional wides cancelled by bat contact, included in legalBalls. */
  contactedWides: number;
  legalRate: number;
  /** Wickets per legal ball; run-outs on no-balls can make this exceed one. */
  wicketRate: number;
  deliveryShares: Record<DeliveryType, number>;
}

export interface BotSimulationOptions {
  /** Test/control comparison; production simulation includes fielders by default. */
  includeFielding?: boolean;
  fieldPreset?: FieldPreset;
  /** Deterministic delivery and shot fixtures for simulation verification. */
  deliveryFixture?: (attempt: number) => DeliveryChoice;
  shotFixture?: (attempt: number) => ShotChoice;
  /** Override starting fielders for deterministic interception fixtures. */
  fieldersFixture?: readonly RatedFielder[];
  /** Inspect a simulated launch without changing the simulated flight. */
  onShotLaunched?: (hand: 'RHB' | 'LHB', position: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }) => void;
}

/** Synthetic seeded bot scoring simulation using the production shot-flight physics. */
export function runBotSimulation(
  overCount = 500,
  specificTier?: BotSimulationResult['tier'],
  seed = 12345,
  options: BotSimulationOptions = {},
): BotSimulationResult[] {
  if (!Number.isInteger(overCount) || overCount <= 0) throw new Error('overCount must be a positive integer');
  const tiers: BotSimulationResult['tier'][] = specificTier ? [specificTier] : ['Rookie', 'Medium', 'Hard'];
  const results = tiers.map((tier, tierIndex): BotSimulationResult => {
    const random = new SeededRandom((seed + tierIndex * 0x9e3779b9) >>> 0).next;
    const bowler = createBotPlayer(tier);
    const batter = createBotPlayer('Rookie');
    let attempts = 0, legalBalls = 0, wides = 0, noBalls = 0, wickets = 0, runs = 0, dots = 0, fours = 0, sixes = 0, groundStops = 0, catches = 0, runOuts = 0, incompleteOvers = 0, noBallBatRuns = 0, contactedWides = 0, recoveredAfterRest = 0, recoveryTimeouts = 0;
    let freeHit = false;
    const deliveryCounts: Record<DeliveryType, number> = { fast: 0, medium: 0, slow: 0, offspin: 0, legspin: 0 };

    for (let over = 0; over < overCount; over++) {
      let legalInOver = 0;
      let overAttempts = 0;
      const hand = over % 2 === 0 ? 'RHB' : 'LHB';
      batter.batterHand = hand;
      const fieldingStats = bowler.stats.fielding ?? { agility: 50, reaction: 50, catching: 50, throwing: 50 };
      const fielders: readonly RatedFielder[] = options.includeFielding === false ? [] : options.fieldersFixture ?? createDefaultFieldLayout(hand, options.fieldPreset ?? 'balanced').map(fielder => ({
        name: fielder.name,
        profile: fielderReachProfileFromRatings(fielder.position, fieldingStats.agility, fieldingStats.reaction),
        catching: fieldingStats.catching,
      }));
      while (legalInOver < 6 && overAttempts < 24) {
        overAttempts++;
        attempts++;
        const delivery = options.deliveryFixture?.(attempts) ?? botChooseDelivery(bowler, tier, hand, random);
        deliveryCounts[delivery.type]++;
        const shot = options.shotFixture?.(attempts) ?? botChooseShot(batter, bowler, delivery, 'Rookie', random);
        const batContact = findBatBallContact(delivery, shot, hand, 0, 'swept-blade-v4');
        const missed = !batContact;
        const provisionalExtra = checkExtraBall(delivery, hand);
        const extra = resolveDeliveryExtra(delivery, hand, !missed);
        if (provisionalExtra.type === 'wide' && !extra.isExtra) contactedWides++;
        const protectedDelivery = freeHit || extra.type === 'noball';
        if (extra.isExtra) {
          if (extra.type === 'wide') wides++;
          else noBalls++;
          runs++;
          freeHit = freeHit || extra.type === 'noball';
          if (extra.type === 'wide') continue;
        }
        const dismissal = missed ? resolveMissedDelivery(delivery, hand, true) : null;
        const isWicket = dismissal !== null && !protectedDelivery;
        if (isWicket) wickets++;
        else if (batContact) {
          const quality = shotFlightQuality(shot, delivery, battingAssistanceMultiplier(batter, bowler, 'Rookie'));
          const angle = (shot.direction * Math.PI) / 4 - Math.PI / 2;
          const velocity = calculateShotTrajectory(quality, 0.5, 0.5, angle, deliveryIncomingVelocityAtTime(delivery, batContact.timeSeconds), { x: 0, y: 0, z: 0 }, hand === 'RHB', true, 'Rookie', shot.type, batter.stats.batting.power);
          const contact = batContact.ballPosition;
          options.onShotLaunched?.(hand, { ...contact }, { ...velocity });
          const flight: BallState = {
            position: { x: contact.x, y: contact.y, z: contact.z }, velocity,
            hasBounced: false, reachedBoundary: false, stopped: false,
          };
          const fielderPositions = fielders.map(fielder => ({ ...fielder.profile.position }));
          let canRecover = false;
          let fieldingEvent: { kind: 'catch' | 'ground_stop'; timeSeconds: number; position: { x: number; y: number; z: number }; fielderPosition: { x: number; z: number } } | null = null;
          let flightSeconds = 0;
          let restStartedAt: number | null = null;
          for (let step = 0; step < 24000; step++) {
            if (!flight.stopped) stepBall(flight, 1 / 120);
            flightSeconds += 1 / 120;
            if (flight.stopped && restStartedAt === null) restStartedAt = flightSeconds;
            if (!flight.reachedBoundary) {
              const sample = { timeSeconds: flightSeconds, position: flight.position, hasBounced: flight.hasBounced, reachedBoundary: false };
              for (const [index, fielder] of fielders.entries()) {
                const next = advanceFielder(fielderPositions[index], fielder.profile, fielder.catching, sample, 1 / 120);
                fielderPositions[index] = next.position;
                if (next.kind) {
                  fieldingEvent = { kind: next.kind, timeSeconds: flightSeconds, position: { ...flight.position }, fielderPosition: next.position };
                  break;
                }
              }
            }
            canRecover = fielders.some((fielder, index) => fielder.profile.speedMetersPerSecond > 0 ||
              Math.hypot(fielderPositions[index].x - flight.position.x, fielderPositions[index].z - flight.position.z) <= fielder.profile.reachRadiusMeters);
            if (fieldingEvent || (flight.stopped && (!canRecover || (restStartedAt !== null && flightSeconds - restStartedAt >= FIELDING_MAX_RECOVERY_SECONDS))) ||
                (flight.reachedBoundary && (!flight.boundaryOnFull || flight.hasBounced))) break;
          }
          const distance = calculateShotDistance({ position: flight.position }, { x: contact.x, z: contact.z });
          // The simulator advances full-boundary shots through their landing
          // to measure carry, so preserve the earlier rope-crossing event.
          let shotRuns: number | null = evaluateFinalOutcome(distance, flight.hasBounced, flight.reachedBoundary, flight.boundaryOnFull);
          if (fieldingEvent?.kind === 'catch') {
            catches++;
            if (isCatchDismissalAllowed(extra.type === 'noball', protectedDelivery)) {
              wickets++;
              shotRuns = null;
            } else {
              shotRuns = evaluateFinalOutcome(
                calculateShotDistance({ position: fieldingEvent.position }, { x: contact.x, z: contact.z }),
                false,
                false,
              );
            }
          } else if (fieldingEvent?.kind === 'ground_stop') {
            groundStops++;
            if (restStartedAt !== null && fieldingEvent.timeSeconds > restStartedAt + 1e-10) recoveredAfterRest++;
            const runDecision = decideAutomatedRuns(
              fieldingEvent.timeSeconds,
              fieldingEvent.fielderPosition,
              fielderThrowSpeedFromRating(fieldingStats.throwing),
            );
            shotRuns = runDecision.runs;
            if (runDecision.runOut) {
              wickets++;
              runOuts++;
            }
          }
          if (!fieldingEvent && canRecover && restStartedAt !== null && flightSeconds - restStartedAt >= FIELDING_MAX_RECOVERY_SECONDS) recoveryTimeouts++;
          if (shotRuns !== null) {
            runs += shotRuns;
            if (extra.type === 'noball') noBallBatRuns += shotRuns;
            if (shotRuns === 0 && !extra.isExtra) dots++;
            else if (shotRuns === 4) fours++;
            else if (shotRuns === 6) sixes++;
          }
        } else if (!extra.isExtra) dots++;
        if (!extra.isExtra) {
          freeHit = false;
          legalBalls++;
          legalInOver++;
        }
      }
      if (legalInOver < 6) incompleteOvers++;
    }
    const typeTotal = Object.values(deliveryCounts).reduce((sum, count) => sum + count, 0);
    return {
      tier, overs: overCount, attempts, legalBalls, wides, noBalls, wickets, runs, dots, fours, sixes, groundStops, recoveredAfterRest, recoveryTimeouts, catches, runOuts, incompleteOvers, noBallBatRuns, contactedWides,
      legalRate: attempts ? legalBalls / attempts : 0,
      wicketRate: legalBalls ? wickets / legalBalls : 0,
      deliveryShares: Object.fromEntries(Object.entries(deliveryCounts).map(([type, count]) => [type, typeTotal ? count / typeTotal : 0])) as Record<DeliveryType, number>,
    };
  });
  console.table(results.map(result => ({ ...result, deliveryShares: JSON.stringify(result.deliveryShares) })));
  return results;
}
