import type { BallOutcome, DeliveryChoice, Player, ShotChoice } from './types';
import { battingAssistanceMultiplier, evaluateWicket, resolveMissedDelivery, calculateDistance, checkExtraBall, deliveryContactPoint, evaluateFinalOutcome } from './formula';

export interface BattingDeliveryInput {
  delivery: DeliveryChoice;
  shot: ShotChoice | null;
  batter: Player;
  bowler: Player;
  difficulty: 'Rookie' | 'Medium' | 'Hard';
  ballNumber: number;
  isFreeHit: boolean;
}

/** Resolve a delivery without modifying match state or the supplied inputs. */
export function resolveBattingDelivery(input: BattingDeliveryInput): { outcome: BallOutcome; nextFreeHit: boolean } {
  const isFreeHit = input.isFreeHit;
  let nextFreeHit = false;
  // A completed ball must not change when controls prepare the next delivery.
  const delivery: DeliveryChoice = {
    ...input.delivery,
    aimTarget: { ...input.delivery.aimTarget },
    ...(input.delivery.batterPosition ? { batterPosition: { ...input.delivery.batterPosition } } : {})
  };
  const shot: ShotChoice | null = input.shot ? { ...input.shot } : null;

  let extra = checkExtraBall(delivery, input.batter.batterHand || 'RHB');

  let isWicket = false;
  let wicketReason = '';
  let distance = 0;
  let missed = shot === null;

  const assistMultiplier = battingAssistanceMultiplier(input.batter, input.bowler, input.difficulty);

  const wicketResult = shot ? evaluateWicket(input.batter, input.bowler, delivery, shot, assistMultiplier) : null;
  if (wicketResult) missed = wicketResult.missed ?? false;
  const relativeLine = deliveryContactPoint(delivery).x - (delivery.batterPosition?.x ?? 0);
  if (shot && Math.abs(relativeLine) > 1.25) missed = true;
  // A ball contacted by the bat is not a wide, provided it is within reach.
  if (extra.type === 'wide' && shot && !missed && Math.abs(relativeLine) <= 1.25) {
    extra = { isExtra: false, type: null };
  }
  if (extra.type === 'wide') missed = true;

  if (extra.isExtra) {
    nextFreeHit = isFreeHit || extra.type === 'noball';

    if (extra.type === 'wide') {
      wicketReason = 'Penalty - Wide ball!';
    } else {
      wicketReason = 'Front-foot no-ball! (Free hit next)';
    }
    distance = 0;
  }
  if (!extra.isExtra && shot === null) {
    const dismissal = isFreeHit ? null : resolveMissedDelivery(delivery, input.batter.batterHand || 'RHB', false);
    isWicket = dismissal !== null;
    wicketReason = dismissal === 'lbw' ? 'LBW' : dismissal === 'bowled' ? 'Bowled' : 'Missed delivery!';
    distance = 0;
  } else if (shot && wicketResult && extra.type !== 'wide') {
    isWicket = wicketResult.isWicket;
    wicketReason = extra.type === 'noball' ? 'Front-foot no-ball! (Free hit next)' : wicketResult.reason;

    if (!isWicket && !missed) {
      const distResult = calculateDistance(input.batter, input.bowler, delivery, shot, wicketResult.safeWindowMs, wicketResult.isEdgeFallback, assistMultiplier);
      distance = distResult.distance;
      if (distResult.isMiscueWicket) {
        isWicket = true;
        wicketReason = distResult.miscueReason;
        distance = 0;
      }
    }

    // Check Free Hit survival rules
    if (isWicket && (isFreeHit || extra.type === 'noball')) {
      isWicket = false;
      wicketReason = `Free Hit Survival! Batter mistimed shot but is not out. Original reason: ${wicketReason}`;
    }

  }

  const outcome: BallOutcome = {
    ballNumber: input.ballNumber,
    delivery,
    shot,
    missed,
    distance,
    isWicket,
    wicketReason,
    isFreeHit,
    isExtra: extra.isExtra,
    extraType: extra.type
  };

  return { outcome, nextFreeHit };
}

/** Resolve a successful shot's distance and runs without modifying an innings. */
export function resolveShotFlight(rawDistance: number, hasBounced: boolean, reachedBoundary?: boolean): { distance: number; runs: number } {
  const distance = Number.isFinite(rawDistance) && rawDistance >= 0 ? Math.min(rawDistance, 130) : 0;
  return { distance, runs: evaluateFinalOutcome(distance, hasBounced, reachedBoundary) };
}
