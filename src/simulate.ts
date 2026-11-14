import { createBotPlayer } from './game';
import { botChooseDelivery, botChooseShot } from './bot';
import { evaluateWicket, checkExtraBall, resolveMissedDelivery, deliveryContactPoint, deliveryVelocityAtCrease, battingAssistanceMultiplier, shotFlightQuality, calculateShotTrajectory, calculateShotDistance, evaluateFinalOutcome } from './formula';
import type { DeliveryType, FieldPreset } from './types';
import { SeededRandom } from './random';
import { stepBall, type BallState } from './ball-physics';
import { createDefaultFieldLayout, estimateRunsBeforeReturnThrow, FIELDING_MAX_RUNS, FIELDING_SECONDS_PER_RUN, fielderReachProfileFromRatings, fielderThrowSpeedFromRating, findEarliestFieldingEvent, isCatchDismissalAllowed, type RatedFielder } from './fielding';

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
  catches: number;
  incompleteOvers: number;
  legalRate: number;
  wicketRate: number;
  deliveryShares: Record<DeliveryType, number>;
}

export interface BotSimulationOptions {
  /** Test/control comparison; production simulation includes fielders by default. */
  includeFielding?: boolean;
  fieldPreset?: FieldPreset;
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
    let attempts = 0, legalBalls = 0, wides = 0, noBalls = 0, wickets = 0, runs = 0, dots = 0, fours = 0, sixes = 0, groundStops = 0, catches = 0, incompleteOvers = 0;
    let freeHit = false;
    const deliveryCounts: Record<DeliveryType, number> = { fast: 0, medium: 0, slow: 0, offspin: 0, legspin: 0 };

    for (let over = 0; over < overCount; over++) {
      let legalInOver = 0;
      let overAttempts = 0;
      const hand = over % 2 === 0 ? 'RHB' : 'LHB';
      batter.batterHand = hand;
      const fieldingStats = bowler.stats.fielding ?? { agility: 50, reaction: 50, catching: 50, throwing: 50 };
      const fielders: RatedFielder[] = options.includeFielding === false ? [] : createDefaultFieldLayout(hand, options.fieldPreset ?? 'balanced').map(fielder => ({
        name: fielder.name,
        profile: fielderReachProfileFromRatings(fielder.position, fieldingStats.agility, fieldingStats.reaction),
        catching: fieldingStats.catching,
      }));
      while (legalInOver < 6 && overAttempts < 24) {
        overAttempts++;
        attempts++;
        const delivery = botChooseDelivery(bowler, tier, hand, random);
        deliveryCounts[delivery.type]++;
        const extra = checkExtraBall(delivery, hand);
        if (extra.isExtra) {
          if (extra.type === 'wide') wides++;
          else noBalls++;
          runs++;
          freeHit = freeHit || extra.type === 'noball';
          continue;
        }
        const shot = botChooseShot(batter, bowler, delivery, 'Rookie', random);
        const result = evaluateWicket(batter, bowler, delivery, shot);
        let missed = result.missed ?? false;
        let isWicket = result.isWicket;
        if (missed) isWicket = resolveMissedDelivery(delivery, hand, true) !== null;
        if (freeHit) isWicket = false;
        if (isWicket) wickets++;
        else if (!missed) {
          const quality = shotFlightQuality(shot, delivery, battingAssistanceMultiplier(batter, bowler, 'Rookie'));
          const angle = (shot.direction * Math.PI) / 4 - Math.PI / 2;
          const velocity = calculateShotTrajectory(quality, 0.5, 0.5, angle, deliveryVelocityAtCrease(delivery), { x: 0, y: 0, z: 0 }, hand === 'RHB', true, 'Rookie', shot.type, batter.stats.batting.power);
          const contact = deliveryContactPoint(delivery);
          const flight: BallState = {
            position: { x: contact.x, y: contact.y, z: contact.z }, velocity,
            hasBounced: false, reachedBoundary: false, stopped: false,
          };
          const trajectory: Array<{ timeSeconds: number; position: { x: number; y: number; z: number }; hasBounced: boolean; reachedBoundary: boolean }> = [];
          let flightSeconds = 0;
          for (let step = 0; step < 24000 && !flight.stopped && !(flight.reachedBoundary && (!flight.boundaryOnFull || flight.hasBounced)); step++) {
            stepBall(flight, 1 / 120);
            flightSeconds += 1 / 120;
            trajectory.push({ timeSeconds: flightSeconds, position: { ...flight.position }, hasBounced: flight.hasBounced, reachedBoundary: flight.reachedBoundary });
          }
          const distance = calculateShotDistance({ position: flight.position }, { x: contact.x, z: contact.z });
          const fieldingEvent = findEarliestFieldingEvent(trajectory, fielders);
          let shotRuns: number | null = evaluateFinalOutcome(distance, flight.hasBounced, flight.reachedBoundary);
          if (fieldingEvent?.kind === 'catch') {
            catches++;
            if (isCatchDismissalAllowed(false, freeHit)) {
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
            const throwDistance = Math.min(
              Math.hypot(fieldingEvent.fielderPosition.x, fieldingEvent.fielderPosition.z - 10),
              Math.hypot(fieldingEvent.fielderPosition.x, fieldingEvent.fielderPosition.z + 10),
            );
            shotRuns = estimateRunsBeforeReturnThrow(
              fieldingEvent.timeSeconds,
              throwDistance,
              fielderThrowSpeedFromRating(fieldingStats.throwing),
              FIELDING_SECONDS_PER_RUN,
              FIELDING_MAX_RUNS,
            );
          }
          if (shotRuns !== null) {
            runs += shotRuns;
            if (shotRuns === 0) dots++;
            else if (shotRuns === 4) fours++;
            else if (shotRuns === 6) sixes++;
          }
        } else dots++;
        freeHit = false;
        legalBalls++;
        legalInOver++;
      }
      if (legalInOver < 6) incompleteOvers++;
    }
    const typeTotal = Object.values(deliveryCounts).reduce((sum, count) => sum + count, 0);
    return {
      tier, overs: overCount, attempts, legalBalls, wides, noBalls, wickets, runs, dots, fours, sixes, groundStops, catches, incompleteOvers,
      legalRate: attempts ? legalBalls / attempts : 0,
      wicketRate: legalBalls ? wickets / legalBalls : 0,
      deliveryShares: Object.fromEntries(Object.entries(deliveryCounts).map(([type, count]) => [type, typeTotal ? count / typeTotal : 0])) as Record<DeliveryType, number>,
    };
  });
  console.table(results.map(result => ({ ...result, deliveryShares: JSON.stringify(result.deliveryShares) })));
  return results;
}
