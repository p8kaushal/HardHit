import { Player, MatchState, Innings, BallOutcome, DeliveryChoice, ShotChoice, PlayerStats, CameraMode } from './types';
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
      score: 0,
      isNextFreeHit: false,
      finished: false
    };

    const innings2: Innings = {
      batter: playerBatsFirst ? this.state.bot : this.state.player,
      bowler: playerBatsFirst ? this.state.player : this.state.bot,
      balls: [],
      wicketsLost: 0,
      maxWickets: 1,
      biggestSix: 0,
      score: 0,
      isNextFreeHit: false,
      finished: false
    };

    this.state.innings = [innings1, innings2];
  }

  public startMatch(): void {
    this.state.status = 'playing';
    this.state.currentInningsIndex = 0;
    this.updateActiveCameraMode();
  }

  public getActiveCameraMode(): CameraMode {
    if (this.state.status !== 'playing') {
      return 'stadium_wide';
    }
    const innings = this.getCurrentInnings();
    if (!innings) return 'stadium_wide';
    return innings.batter.id === this.state.player.id ? 'batter_eye' : 'bowler_eye';
  }

  public updateActiveCameraMode(): void {
    this.state.cameraMode = this.getActiveCameraMode();
  }

  public getCurrentInnings(): Innings {
    return this.state.innings[this.state.currentInningsIndex];
  }

  public recordBall(delivery: DeliveryChoice, shot: ShotChoice | null): BallOutcome {
    const innings = this.getCurrentInnings();
    
    // Save whether this ball is a Free Hit
    const isFreeHit = innings.isNextFreeHit;
    // Reset next ball's Free Hit state
    innings.isNextFreeHit = false;

    const ballNumber = innings.balls.filter(b => !b.isExtra).length + 1;

    const extra = checkExtraBall(delivery, innings.batter.batterHand || 'RHB');
    
    let isWicket = false;
    let wicketReason = '';
    let distance = 0;

    if (extra.isExtra) {
      innings.score += 1; // +1 run penalty
      innings.isNextFreeHit = true; // next ball is free hit
      
      if (extra.type === 'wide') {
        wicketReason = 'Penalty - Wide ball!';
      } else {
        wicketReason = 'Penalty - No ball! (Free Hit next)';
      }
      distance = 0;
      console.log(`[GAME EVENT] Extra ball penalty: ${extra.type?.toUpperCase()}. Innings score: ${innings.score}. Next is Free Hit.`);
    } else if (shot === null) {
      wicketReason = 'Missed delivery!';
      distance = 0;
      console.log(`[GAME EVENT] Missed delivery. Ball number ${ballNumber}`);
    } else {
      // Regular ball
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

      // Check Free Hit survival rules
      if (isWicket && isFreeHit) {
        isWicket = false;
        wicketReason = `Free Hit Survival! Batter mistimed shot but is not out. Original reason: ${wicketReason}`;
        console.log(`[GAME EVENT] Batter survived a dismissal due to active Free Hit!`);
      }

      if (!isWicket) {
        if (distance >= 70) {
          innings.biggestSix = Math.max(innings.biggestSix, distance);
          innings.score += 6; // Six adds +6 runs
          console.log(`[GAME EVENT] Massive SIX: ${distance}m! Innings score: ${innings.score}`);
        } else {
          // Under MVP, non-six hits are 0 runs, but we track distance
          console.log(`[GAME EVENT] Hit: ${distance}m. Innings score: ${innings.score}`);
        }
      }
    }

    const outcome: BallOutcome = {
      ballNumber,
      delivery,
      shot,
      distance,
      isWicket,
      wicketReason,
      isFreeHit,
      isExtra: extra.isExtra,
      extraType: extra.type
    };

    innings.balls.push(outcome);

    if (isWicket) {
      innings.wicketsLost = innings.maxWickets; // Forfeit remaining balls by maximizing wickets
      innings.finished = true;
      console.log(`[GAME EVENT] WICKET! Batter dismissed: ${wicketReason}. Innings finished.`);
    }

    // Check if innings is finished (6 legal balls or 1 wicket)
    const legalBallsCount = innings.balls.filter(b => !b.isExtra).length;
    const maxBalls = this.state.tieBreakerActive ? 1 : 6;
    if (legalBallsCount >= maxBalls || innings.wicketsLost >= innings.maxWickets) {
      innings.finished = true;
      console.log(`[GAME EVENT] Innings completed. Legal balls: ${legalBallsCount}. Wickets: ${innings.wicketsLost}. Biggest Six: ${innings.biggestSix}m.`);
    }

    this.checkInningsTransitions();
    return outcome;
  }

  private checkInningsTransitions(): void {
    const currentInnings = this.getCurrentInnings();
    if (currentInnings.finished) {
      // If we are at an even index (0, 2, 4), move to the next innings
      if (this.state.currentInningsIndex % 2 === 0) {
        this.state.currentInningsIndex++;
        console.log(`[GAME EVENT] Transitioning to Innings ${this.state.currentInningsIndex + 1}. Swapping roles.`);
        this.updateActiveCameraMode();
      } else {
        // End of the pair, resolve match or tie-break
        this.resolveMatch();
      }
    }
  }

  private resolveMatch(): void {
    const idx = this.state.currentInningsIndex;
    const inn1 = this.state.innings[idx - 1];
    const inn2 = this.state.innings[idx];
    
    console.log(`[GAME EVENT] Resolving match segment. Inn1 biggest six: ${inn1.biggestSix}m. Inn2 biggest six: ${inn2.biggestSix}m.`);

    let winnerId: string | null = null;
    
    if (inn1.biggestSix > inn2.biggestSix) {
      winnerId = inn1.batter.id;
    } else if (inn2.biggestSix > inn1.biggestSix) {
      winnerId = inn2.batter.id;
    } else {
      // Tie-break 1: Fewer wickets lost
      console.log(`[GAME EVENT] Biggest sixes are tied. Applying Tie-break 1 (fewer wickets lost).`);
      if (inn1.wicketsLost < inn2.wicketsLost) {
        winnerId = inn1.batter.id;
      } else if (inn2.wicketsLost < inn1.wicketsLost) {
        winnerId = inn2.batter.id;
      } else {
        // Tie-break 2: Total carry distance (accumulative distance of all hits)
        console.log(`[GAME EVENT] Wickets lost are tied. Applying Tie-break 2 (total carry distance).`);
        const totalDist1 = inn1.balls.reduce((acc, b) => acc + b.distance, 0);
        const totalDist2 = inn2.balls.reduce((acc, b) => acc + b.distance, 0);
        
        if (totalDist1 > totalDist2) {
          winnerId = inn1.batter.id;
        } else if (totalDist2 > totalDist1) {
          winnerId = inn2.batter.id;
        } else {
          // Tie-break 3: Second biggest six
          console.log(`[GAME EVENT] Total carry distances are tied. Applying Tie-break 3 (second biggest six).`);
          const sortedDist1 = inn1.balls.map(b => b.distance).sort((a, b) => b - a);
          const sortedDist2 = inn2.balls.map(b => b.distance).sort((a, b) => b - a);
          const secBiggest1 = sortedDist1[1] || 0;
          const secBiggest2 = sortedDist2[1] || 0;
          
          if (secBiggest1 > secBiggest2) {
            winnerId = inn1.batter.id;
          } else if (secBiggest2 > secBiggest1) {
            winnerId = inn2.batter.id;
          } else {
            // Sudden death
            console.log(`[GAME EVENT] Match completely tied. Activating 1-ball sudden death decider!`);
            this.state.tieBreakerActive = true;
            this.setupSuddenDeath();
          }
        }
      }
    }

    if (!this.state.tieBreakerActive || winnerId) {
      this.state.winnerId = winnerId;
      this.state.status = 'completed';
      this.state.cameraMode = 'stadium_wide';
      console.log(`[GAME EVENT] Match finished. Winner ID: ${winnerId}.`);
      this.applyProgression(winnerId === this.state.player.id);
    }
  }

  private setupSuddenDeath(): void {
    const playerBatsFirst = Math.random() > 0.5;
    
    const inn1: Innings = {
      batter: playerBatsFirst ? this.state.player : this.state.bot,
      bowler: playerBatsFirst ? this.state.bot : this.state.player,
      balls: [],
      wicketsLost: 0,
      maxWickets: 1,
      biggestSix: 0,
      score: 0,
      isNextFreeHit: false,
      finished: false
    };

    const inn2: Innings = {
      batter: playerBatsFirst ? this.state.bot : this.state.player,
      bowler: playerBatsFirst ? this.state.player : this.state.bot,
      balls: [],
      wicketsLost: 0,
      maxWickets: 1,
      biggestSix: 0,
      score: 0,
      isNextFreeHit: false,
      finished: false
    };

    this.state.innings.push(inn1, inn2);
    this.state.currentInningsIndex++;
    this.updateActiveCameraMode();
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
