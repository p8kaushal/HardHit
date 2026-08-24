import { createBotPlayer } from './game';
import { botChooseDelivery, botChooseShot } from './bot';
import { evaluateWicket, checkExtraBall, calculateDeliveryVelocity, calculateProjectedCreaseX } from './formula';

export function runBotSimulation(matchCount: number = 500, specificTier?: 'Rookie' | 'Medium' | 'Hard', _mode: 'bowling' | 'batting' | 'full' = 'full') {
  const tiersToRun: ('Rookie' | 'Medium' | 'Hard')[] = specificTier ? [specificTier] : ['Rookie', 'Medium', 'Hard'];
  const results = [];

  for (const bowlTier of tiersToRun) {
    let totalDeliveriesFaced = 0;
    let totalWides = 0;
    let totalLegalDeliveries = 0;
    let maxCreaseX = 0;

    for (let m = 0; m < matchCount; m++) {
      const bowler = createBotPlayer(bowlTier);
      const batter = createBotPlayer('Rookie'); // Bat tier doesn't matter much for bowling QA
      batter.batterHand = m < matchCount / 2 ? 'RHB' : 'LHB'; // Split RHB/LHB

      let ballsBowled = 0;
      let wicketsLost = 0;

      while (ballsBowled < 6 && wicketsLost < 1) {
        const delivery = botChooseDelivery(bowler, bowlTier);
        
        if (bowler.isBot) {
          const stanceMultiplier = batter.batterHand === 'LHB' ? -1 : 1;
          delivery.aimTarget.x *= stanceMultiplier;
          
          let limit = 0.65; // Rookie
          if (bowlTier === 'Medium') limit = 0.42;
          else if (bowlTier === 'Hard') limit = 0.20;
          
          let X_target_crease = delivery.aimTarget.x;
          X_target_crease = Math.max(-limit, Math.min(limit, X_target_crease));
          
          const X_release = delivery.overTheWicket !== false ? -0.6 : 0.6;
          const t_flight = 0.6;
          const Ax_swing = 0;
          const X_spin = 0;
          
          const Vx = calculateDeliveryVelocity(X_release, X_target_crease, t_flight, Ax_swing, X_spin);
          const X_projected_crease = calculateProjectedCreaseX(X_release, Vx, t_flight, Ax_swing, X_spin);
          
          delivery.aimTarget.x = X_projected_crease;
        }

        const absX = Math.abs(delivery.aimTarget.x);
        if (absX > maxCreaseX) {
          maxCreaseX = absX;
        }

        const extra = checkExtraBall(delivery, batter.batterHand || 'RHB');
        
        if (extra.isExtra) {
          if (extra.type === 'wide') {
            totalWides++;
          }
          // Assuming wide/no-ball doesn't count towards ballsBowled in an over
          continue; 
        }
        
        totalLegalDeliveries++;
        totalDeliveriesFaced++;
        
        const shot = botChooseShot(batter, bowler, delivery, 'Rookie');
        const wicketResult = evaluateWicket(batter, bowler, delivery, shot);
        
        if (wicketResult.isWicket) {
          wicketsLost++;
        }
        
        ballsBowled++;
      }
    }

    const totalBalls = totalDeliveriesFaced + totalWides;
    const legalRate = totalBalls > 0 ? ((totalLegalDeliveries / totalBalls) * 100).toFixed(2) + '%' : '0%';
    const widesRate = totalBalls > 0 ? ((totalWides / totalBalls) * 100).toFixed(2) + '%' : '0%';

    results.push({
      "Tier": bowlTier,
      "Total Overs": matchCount,
      "Legal Balls %": legalRate,
      "Wide %": widesRate,
      "Max Crease X Offset": maxCreaseX.toFixed(3)
    });
  }

  console.table(results);
}

