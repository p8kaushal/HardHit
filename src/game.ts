import { Player, MatchState, Innings, BallOutcome, DeliveryChoice, ShotChoice, PlayerStats } from './types';
import { evaluateWicket, calculateDistance, checkExtraBall } from './formula';

const LOCAL_STORAGE_KEY = 'six_hitting_contest_player';

const DEFAULT_STATS: PlayerStats = {
  batting: { power: 50, timing: 50, placement: 50, technique: 50, stamina: 50 },
  bowling: { pace: 50, swing: 50, spin: 50, accuracy: 50, stamina: 50, variation: 50 }
};

export function getOrCreatePlayer(): Player {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse player from localStorage", e);
    }
  }
  
  const defaultPlayer: Player = {
    id: 'player_1',
    name: 'You (All-Rounder)',
    isBot: false,
    xp: 0,
    rank: 'Bronze',
    stats: DEFAULT_STATS
  };
  
  savePlayer(defaultPlayer);
  return defaultPlayer;
}

export function savePlayer(player: Player): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(player));
}

export function createBotPlayer(difficulty: 'Easy' | 'Medium' | 'Hard'): Player {
  let statsMultiplier = 0.8;
  let botRank: Player['rank'] = 'Bronze';
  
  if (difficulty === 'Medium') {
    statsMultiplier = 1.0;
    botRank = 'Gold';
  } else if (difficulty === 'Hard') {
    statsMultiplier = 1.3;
    botRank = 'Legend';
  }
  
  const botStats: PlayerStats = {
    batting: {
      power: Math.min(100, Math.round(55 * statsMultiplier)),
      timing: Math.min(100, Math.round(50 * statsMultiplier)),
      placement: Math.min(100, Math.round(50 * statsMultiplier)),
      technique: Math.min(100, Math.round(50 * statsMultiplier)),
      stamina: Math.min(100, Math.round(50 * statsMultiplier))
    },
    bowling: {
      pace: Math.min(100, Math.round(55 * statsMultiplier)),
      swing: Math.min(100, Math.round(50 * statsMultiplier)),
      spin: Math.min(100, Math.round(50 * statsMultiplier)),
      accuracy: Math.min(100, Math.round(50 * statsMultiplier)),
      stamina: Math.min(100, Math.round(50 * statsMultiplier)),
      variation: Math.min(100, Math.round(50 * statsMultiplier))
    }
  };

  return {
    id: `bot_${difficulty.toLowerCase()}`,
    name: `Bot (${difficulty})`,
    isBot: true,
    xp: 0,
    rank: botRank,
    stats: botStats
  };
}

export class MatchController {
  public state!: MatchState;
  private botDifficulty: 'Easy' | 'Medium' | 'Hard';

  constructor(botDifficulty: 'Easy' | 'Medium' | 'Hard') {
    this.botDifficulty = botDifficulty;
    this.reset();
  }

  public reset(): void {
    const player = getOrCreatePlayer();
    const bot = createBotPlayer(this.botDifficulty);
    
    this.state = {
      player,
      bot,
      tossWinnerId: '',
      tossChoice: 'bat',
      innings: [],
      currentInningsIndex: 0,
      status: 'toss',
      winnerId: null,
      tieBreakerActive: false,
      cameraMode: 'stadium_wide'
    };
  }

  public setTossResult(winnerId: string, choice: 'bat' | 'bowl'): void {
    this.state.tossWinnerId = winnerId;
    this.state.tossChoice = choice;
    this.state.status = 'match_setup';
    
    // Create the two innings depending on who bats first
    const playerBatsFirst = (winnerId === this.state.player.id && choice === 'bat') || 
                            (winnerId === this.state.bot.id && choice === 'bowl');

    const innings1: Innings = {
      batter: playerBatsFirst ? this.state.player : this.state.bot,
      bowler: playerBatsFirst ? this.state.bot : this.state.player,
      balls: [],
      wicketsLost: 0,
      maxWickets: 1,
      biggestSix: 0,
      finished: false
    };

    const innings2: Innings = {
      batter: playerBatsFirst ? this.state.bot : this.state.player,
      bowler: playerBatsFirst ? this.state.player : this.state.bot,
      balls: [],
      wicketsLost: 0,
      maxWickets: 1,
      biggestSix: 0,
      finished: false
    };

    this.state.innings = [innings1, innings2];
  }

  public startMatch(): void {
    this.state.status = 'playing';
    this.state.currentInningsIndex = 0;
  }

  public getCurrentInnings(): Innings {
    return this.state.innings[this.state.currentInningsIndex];
  }

  public recordBall(delivery: DeliveryChoice, shot: ShotChoice | null): BallOutcome {
    const innings = this.getCurrentInnings();
    const ballNumber = innings.balls.filter(b => {
      const extra = checkExtraBall(b.delivery);
      return !extra.isExtra; // Count only legal balls
    }).length + 1;

    // Check extra ball
    const extra = checkExtraBall(delivery);
    
    let isWicket = false;
    let wicketReason = '';
    let distance = 0;

    if (extra.isExtra) {
      if (extra.type === 'wide') {
        wicketReason = 'Penalty - Wide ball!';
      } else {
        wicketReason = 'Penalty - No ball! (Free Hit next)';
      }
      distance = 0;
    } else if (shot === null) {
      // Batter did not play a shot / missed completely
      isWicket = false;
      wicketReason = 'Missed delivery!';
      distance = 0;
    } else {
      // Regular delivery
      const wicketResult = evaluateWicket(innings.batter, innings.bowler, delivery, shot);
      isWicket = wicketResult.isWicket;
      wicketReason = wicketResult.reason;
      
      if (!isWicket) {
        const distResult = calculateDistance(innings.batter, innings.bowler, delivery, shot, wicketResult.safeWindowMs);
        distance = distResult.distance;
        if (distResult.isMiscueWicket) {
          isWicket = true;
          wicketReason = distResult.miscueReason;
          distance = 0;
        }
      }
    }

    const outcome: BallOutcome = {
      ballNumber,
      delivery,
      shot,
      distance,
      isWicket,
      wicketReason
    };

    innings.balls.push(outcome);

    if (isWicket) {
      innings.wicketsLost += 1;
      innings.finished = true;
    }

    if (distance >= 70) {
      innings.biggestSix = Math.max(innings.biggestSix, distance);
    }

    // Check if innings is finished (6 legal balls or 1 wicket)
    const legalBallsCount = innings.balls.filter(b => !checkExtraBall(b.delivery).isExtra).length;
    if (legalBallsCount >= 6 || innings.wicketsLost >= innings.maxWickets) {
      innings.finished = true;
    }

    this.checkInningsTransitions();
    return outcome;
  }

  private checkInningsTransitions(): void {
    const currentInnings = this.getCurrentInnings();
    if (currentInnings.finished) {
      if (this.state.currentInningsIndex === 0) {
        // Go to second innings
        this.state.currentInningsIndex = 1;
      } else {
        // End of match
        this.resolveMatch();
      }
    }
  }

  private resolveMatch(): void {
    const inn1 = this.state.innings[0];
    const inn2 = this.state.innings[1];
    
    // Determine winner based on primary metric: highest single six
    let winnerId: string | null = null;
    
    if (inn1.biggestSix > inn2.biggestSix) {
      winnerId = inn1.batter.id;
    } else if (inn2.biggestSix > inn1.biggestSix) {
      winnerId = inn2.batter.id;
    } else {
      // Tie-break 1: Fewer wickets lost
      if (inn1.wicketsLost < inn2.wicketsLost) {
        winnerId = inn1.batter.id;
      } else if (inn2.wicketsLost < inn1.wicketsLost) {
        winnerId = inn2.batter.id;
      } else {
        // Tie-break 2: Second biggest hit / Total distance
        const totalDist1 = inn1.balls.reduce((acc, b) => acc + b.distance, 0);
        const totalDist2 = inn2.balls.reduce((acc, b) => acc + b.distance, 0);
        
        if (totalDist1 > totalDist2) {
          winnerId = inn1.batter.id;
        } else if (totalDist2 > totalDist1) {
          winnerId = inn2.batter.id;
        } else {
          // Tie-break 3: Sudden Death required
          this.state.tieBreakerActive = true;
          // Keep state playing or superover
        }
      }
    }

    if (!this.state.tieBreakerActive) {
      this.state.winnerId = winnerId;
      this.state.status = 'completed';
      this.applyProgression(winnerId === this.state.player.id);
    }
  }

  private applyProgression(playerWon: boolean): void {
    const player = this.state.player;
    const xpGained = playerWon ? 100 : 30;
    player.xp += xpGained;

    // Progression Tier limits
    if (player.xp >= 1000) player.rank = 'Legend';
    else if (player.xp >= 600) player.rank = 'Elite';
    else if (player.xp >= 300) player.rank = 'Gold';
    else if (player.xp >= 100) player.rank = 'Silver';

    // Increment stats slightly on win or match play
    const statInc = playerWon ? 2 : 1;
    
    // Distribute stats
    const stats = player.stats;
    const list = [
      () => stats.batting.power = Math.min(100, stats.batting.power + statInc),
      () => stats.batting.timing = Math.min(100, stats.batting.timing + statInc),
      () => stats.batting.technique = Math.min(100, stats.batting.technique + statInc),
      () => stats.bowling.accuracy = Math.min(100, stats.bowling.accuracy + statInc),
      () => stats.bowling.variation = Math.min(100, stats.bowling.variation + statInc)
    ];
    // Randomly upgrade one stat
    const randomUpgrade = list[Math.floor(Math.random() * list.length)];
    randomUpgrade();

    savePlayer(player);
  }
}
