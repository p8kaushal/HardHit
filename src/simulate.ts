import { createBotPlayer } from './game';
import { botChooseDelivery, botChooseShot } from './bot';
import { evaluateWicket, calculateDistance, checkExtraBall, SIX_THRESHOLD } from './formula';

export function runBotSimulation(matchCount = 500) {
  const tiers: ('Easy' | 'Medium' | 'Hard')[] = ['Easy', 'Medium', 'Hard'];
  const results = [];

  for (const batTier of tiers) {
    for (const bowlTier of tiers) {
      let totalRuns = 0;
      let totalWickets = 0;
      let totalSixes = 0;
      let totalContacts = 0;
      let totalDeliveriesFaced = 0;
      let totalWides = 0;
      let totalLegalDeliveries = 0;
      let totalStumpHits = 0;

      for (let m = 0; m < matchCount; m++) {
        const bowler = createBotPlayer(bowlTier);
        const batter = createBotPlayer(batTier);

        let ballsBowled = 0;
        let wicketsLost = 0;
        let isNextFreeHit = false;

        while (ballsBowled < 6 && wicketsLost < 1) {
          const delivery = botChooseDelivery(bowler, bowlTier);
          
          if (bowler.isBot) {
            let limit = 0.70;
            if (bowlTier === 'Medium') limit = 0.45;
            else if (bowlTier === 'Hard') limit = 0.25;
            delivery.aimTarget.x = Math.max(-limit, Math.min(limit, delivery.aimTarget.x));
          }

          if (Math.abs(delivery.aimTarget.x) <= 0.2) {
            totalStumpHits++;
          }

          const extra = checkExtraBall(delivery, batter.batterHand || 'RHB');
          
          if (extra.isExtra) {
            totalRuns += 1;
            isNextFreeHit = true;
            if (extra.type === 'wide') {
              totalWides++;
            }
            continue; 
          }
          
          totalLegalDeliveries++;
          const shot = botChooseShot(batter, bowler, delivery, batTier);
          const wicketResult = evaluateWicket(batter, bowler, delivery, shot);
          let isWicket = wicketResult.isWicket;
          let wicketReason = wicketResult.reason;
          let distance = 0;
          
          if (!isWicket) {
            const distResult = calculateDistance(batter, bowler, delivery, shot, wicketResult.safeWindowMs);
            distance = distResult.distance;
            if (distResult.isMiscueWicket) {
              isWicket = true;
              wicketReason = distResult.miscueReason;
              distance = 0;
            }
          }

          if (isWicket && isNextFreeHit) {
            isWicket = false;
            wicketReason = `Free Hit Survival! Original reason: ${wicketReason}`;
          }
          
          isNextFreeHit = false;
          totalDeliveriesFaced++;

          if (!isWicket || wicketReason.includes('Caught') || wicketReason.includes('Edged')) {
            totalContacts++;
          }

          if (isWicket) {
            wicketsLost++;
            totalWickets++;
          } else {
            if (distance >= SIX_THRESHOLD) {
              totalRuns += 6;
              totalSixes++;
            }
          }
          
          ballsBowled++;
        }
      }

      const contactRate = totalDeliveriesFaced > 0 ? ((totalContacts / totalDeliveriesFaced) * 100).toFixed(2) + '%' : '0%';
      const boundaryRate = totalDeliveriesFaced > 0 ? ((totalSixes / totalDeliveriesFaced) * 100).toFixed(2) + '%' : '0%';
      const wicketRate = totalDeliveriesFaced > 0 ? ((totalWickets / totalDeliveriesFaced) * 100).toFixed(2) + '%' : '0%';
      const avgRunsPerOver = (totalRuns / matchCount).toFixed(2);

      const totalBalls = totalDeliveriesFaced + totalWides;
      const legalRate = totalBalls > 0 ? ((totalLegalDeliveries / totalBalls) * 100).toFixed(2) + '%' : '0%';
      const widesRate = totalBalls > 0 ? ((totalWides / totalBalls) * 100).toFixed(2) + '%' : '0%';
      const stumpAccuracy = totalBalls > 0 ? ((totalStumpHits / totalBalls) * 100).toFixed(2) + '%' : '0%';

      results.push({
        "Bat Tier": batTier,
        "Bowl Tier": bowlTier,
        "Matches": matchCount,
        "Contact %": contactRate,
        "Six %": boundaryRate,
        "Wide %": widesRate,
        "Avg Runs/Over": avgRunsPerOver,
        "Wicket %": wicketRate,
        "Legal %": legalRate,
        "Stump %": stumpAccuracy
      });
    }
  }

  console.table(results);
}
