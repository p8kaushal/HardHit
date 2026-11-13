import { createBotPlayer } from './game';
import { botChooseDelivery, botChooseShot } from './bot';
import { evaluateWicket, checkExtraBall } from './formula';
import type { DeliveryType } from './types';
import { SeededRandom } from './random';

export interface BotSimulationResult {
  tier: 'Rookie' | 'Medium' | 'Hard';
  overs: number;
  attempts: number;
  legalBalls: number;
  wides: number;
  noBalls: number;
  wickets: number;
  incompleteOvers: number;
  legalRate: number;
  wicketRate: number;
  deliveryShares: Record<DeliveryType, number>;
}

/** Synthetic bot-over distribution check; it is not a real-match calibration. */
export function runBotSimulation(
  overCount = 500,
  specificTier?: BotSimulationResult['tier'],
  seed = 12345,
): BotSimulationResult[] {
  if (!Number.isInteger(overCount) || overCount <= 0) throw new Error('overCount must be a positive integer');
  const tiers: BotSimulationResult['tier'][] = specificTier ? [specificTier] : ['Rookie', 'Medium', 'Hard'];
  const results = tiers.map((tier, tierIndex): BotSimulationResult => {
    const random = new SeededRandom((seed + tierIndex * 0x9e3779b9) >>> 0).next;
    const bowler = createBotPlayer(tier);
    const batter = createBotPlayer('Rookie');
    let attempts = 0, legalBalls = 0, wides = 0, noBalls = 0, wickets = 0, incompleteOvers = 0;
    const deliveryCounts: Record<DeliveryType, number> = { fast: 0, medium: 0, slow: 0, offspin: 0, legspin: 0 };

    for (let over = 0; over < overCount; over++) {
      let legalInOver = 0;
      let overAttempts = 0;
      const hand = over % 2 === 0 ? 'RHB' : 'LHB';
      batter.batterHand = hand;
      while (legalInOver < 6 && overAttempts < 24) {
        overAttempts++;
        attempts++;
        const delivery = botChooseDelivery(bowler, tier, hand, random);
        deliveryCounts[delivery.type]++;
        const extra = checkExtraBall(delivery, hand);
        if (extra.isExtra) {
          if (extra.type === 'wide') wides++;
          else noBalls++;
          continue;
        }
        const shot = botChooseShot(batter, bowler, delivery, 'Rookie', random);
        const result = evaluateWicket(batter, bowler, delivery, shot);
        if (result.isWicket) wickets++;
        legalBalls++;
        legalInOver++;
      }
      if (legalInOver < 6) incompleteOvers++;
    }
    const typeTotal = Object.values(deliveryCounts).reduce((sum, count) => sum + count, 0);
    return {
      tier, overs: overCount, attempts, legalBalls, wides, noBalls, wickets, incompleteOvers,
      legalRate: attempts ? legalBalls / attempts : 0,
      wicketRate: legalBalls ? wickets / legalBalls : 0,
      deliveryShares: Object.fromEntries(Object.entries(deliveryCounts).map(([type, count]) => [type, typeTotal ? count / typeTotal : 0])) as Record<DeliveryType, number>,
    };
  });
  console.table(results.map(result => ({ ...result, deliveryShares: JSON.stringify(result.deliveryShares) })));
  return results;
}
