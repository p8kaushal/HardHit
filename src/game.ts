import { Player, MatchState, Innings, BallOutcome, DeliveryChoice, ShotChoice, PlayerStats, CameraMode, TieBreakDetails } from './types';
import { evaluateWicket, calculateDistance, checkExtraBall, SIX_THRESHOLD, calculateDeliveryVelocity, calculateProjectedCreaseX, calculateEffectiveWindow, calculateContactQuality, getContactQualityTier, evaluateFinalOutcome } from './formula';
import { activeInputManager } from './input';

const LOCAL_STORAGE_KEY = 'six_hitting_contest_player';

export const globalAutoAssistConfig: { 
  isRookie: boolean, 
  currentDelivery: DeliveryChoice | null, 
  batterHand: 'RHB' | 'LHB', 
  bufferedTiming?: number | null,
  deliveryStartTime?: number,
  delta_t?: number,
  ballZ?: number,
  isDeliveryActive?: boolean,
  isBallInPlay?: boolean,
  hasBounced?: boolean,
  removeTrajectoryObserver?: () => void;
  resetSceneForInnings?: () => void;
} = {
  isRookie: false,
  currentDelivery: null,
  batterHand: 'RHB',
  bufferedTiming: null,
  isDeliveryActive: false,
  isBallInPlay: false,
  hasBounced: false
};

export function resolveShot(delta_t: number, botTier: string, shotType: string, deliveryLength: string): { contact: boolean, Q: number, tier: string } {
  const delta_t_window = calculateEffectiveWindow(botTier, shotType, deliveryLength);
  const Q = calculateContactQuality(delta_t, delta_t_window);
  const tier = getContactQualityTier(Q);
  
  let contact = false;
  if (Q >= 0.40) {
    contact = true;
  }
  
  // Spatial Crease Hard Fallback
  if (globalAutoAssistConfig.isRookie && globalAutoAssistConfig.ballZ !== undefined) {
    if (globalAutoAssistConfig.ballZ >= 6.0 && globalAutoAssistConfig.ballZ <= 9.4) {
      contact = true;
    }
  }

  if (contact) {
    globalAutoAssistConfig.isDeliveryActive = false;
    globalAutoAssistConfig.isBallInPlay = true;
  }

  return { contact, Q, tier };
}


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

export function createBotPlayer(difficulty: 'Rookie' | 'Medium' | 'Hard'): Player {
  let statsMultiplier = 1.85; // Rookie
  let botRank: Player['rank'] = 'Bronze';
  
  if (difficulty === 'Medium') {
    statsMultiplier = 1.95; 
    botRank = 'Gold';
  } else if (difficulty === 'Hard') {
    statsMultiplier = 2.1; 
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
  private botDifficulty: 'Rookie' | 'Medium' | 'Hard';

  constructor(botDifficulty: 'Rookie' | 'Medium' | 'Hard') {
    this.botDifficulty = botDifficulty;
    globalAutoAssistConfig.isRookie = botDifficulty === 'Rookie';
    this.reset();
  }

  public reset(): void {
    if (globalAutoAssistConfig.isBallInPlay) return;
    const player = getOrCreatePlayer();
    const bot = createBotPlayer(this.botDifficulty);
    this.state = this.createInitialMatchState(player, bot);
  }

  public nextBall(): void {
    if (globalAutoAssistConfig.isBallInPlay) return;
  }

  public resetPositions(): void {
    if (globalAutoAssistConfig.isBallInPlay) return;
  }

  private createInitialMatchState(player: Player, bot: Player): MatchState {
    return {
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
      ballsBowled: 0,
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
      ballsBowled: 0,
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
    if (globalAutoAssistConfig.isBallInPlay) return;
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

  public setCameraMode(mode: CameraMode): void {
    this.state.cameraMode = mode;
  }

  public getCurrentInnings(): Innings {
    return this.state.innings[this.state.currentInningsIndex];
  }

  public recordDeliveryStart(): void {
    globalAutoAssistConfig.deliveryStartTime = performance.now();
  }

  public recordBall(delivery: DeliveryChoice, shot: ShotChoice | null): BallOutcome {
    const innings = this.getCurrentInnings();
    
    // Save whether this ball is a Free Hit
    const isFreeHit = innings.isNextFreeHit;
    // Reset next ball's Free Hit state
    innings.isNextFreeHit = false;

    // Reset bounce state for the new delivery
    globalAutoAssistConfig.hasBounced = false;

    const ballNumber = innings.ballsBowled + 1;

    if (innings.bowler.isBot) {
      const stanceMultiplier = innings.batter.batterHand === 'LHB' ? -1 : 1;
      
      // 1. Batter Stance Normalization
      delivery.aimTarget.x *= stanceMultiplier;

      // 2. Absolute Center-Clamped Crease Arrival
      let limit = 0.65; // Easy/Rookie
      if (innings.bowler.id === 'bot_medium') limit = 0.42;
      else if (innings.bowler.id === 'bot_hard') limit = 0.20;
      
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

    const extra = checkExtraBall(delivery, innings.batter.batterHand || 'RHB');
    
    let isWicket = false;
    let wicketReason = '';
    let distance = 0;

    let assistMultiplier = 0;
    if (!innings.batter.isBot && innings.bowler.isBot) {
      if (this.botDifficulty === 'Rookie') assistMultiplier = 0.80;
      else if (this.botDifficulty === 'Medium') assistMultiplier = 0.40;
      else if (this.botDifficulty === 'Hard') assistMultiplier = 0.00;

      // --- One-Button Auto-Assist for Rookie ---
      if (this.botDifficulty === 'Rookie' && shot) {
        const length = delivery.aimTarget.z;
        const line = delivery.aimTarget.x;
        const hand = innings.batter.batterHand || 'RHB';
        
        let autoFootwork: 'front_foot' | 'back_foot' = 'front_foot';
        let autoDirection = 0;
        
        if (length < 11.0) { // short/bouncer
          autoFootwork = 'back_foot';
          autoDirection = hand === 'RHB' ? (line < 0 ? 3 : 5) : (line > 0 ? 3 : 5);
        } else { // good/full/yorker
          autoFootwork = 'front_foot';
          autoDirection = hand === 'RHB' ? (line < -0.3 ? 1 : (line > 0.3 ? 7 : 0)) : (line > 0.3 ? 1 : (line < -0.3 ? 7 : 0));
        }

        shot.direction = autoDirection;
        shot.footwork = autoFootwork;
        
        if (activeInputManager && activeInputManager.intent) {
          activeInputManager.intent.aimDirection = autoDirection;
          activeInputManager.intent.footwork = autoFootwork;
        }

        // Apply buffered timing from scene Spacebar press
        if (globalAutoAssistConfig.bufferedTiming !== null && globalAutoAssistConfig.bufferedTiming !== undefined) {
          shot.timing = globalAutoAssistConfig.bufferedTiming;
          globalAutoAssistConfig.bufferedTiming = null;
        }
      }
    }

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
      const wicketResult = evaluateWicket(innings.batter, innings.bowler, delivery, shot, assistMultiplier);
      isWicket = wicketResult.isWicket;
      wicketReason = wicketResult.reason;

      // 4. Bounding Box Bypass & Contact Guarantee
      if (globalAutoAssistConfig.delta_t !== undefined) {
        
        let botTier = 'Medium';
        if (innings.bowler.id.includes('rookie')) botTier = 'Rookie';
        if (innings.bowler.id.includes('hard')) botTier = 'Hard';
        
        const resolution = resolveShot(globalAutoAssistConfig.delta_t, botTier, shot.type, delivery.length);

        if (resolution.contact) {
          isWicket = false;
          wicketReason = '';
          wicketResult.isEdgeFallback = false;
        }
        globalAutoAssistConfig.delta_t = undefined; // Reset
      }
      
      if (!isWicket) {
        const distResult = calculateDistance(innings.batter, innings.bowler, delivery, shot, wicketResult.safeWindowMs, wicketResult.isEdgeFallback, assistMultiplier);
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
        // Runs are now dynamically resolved after ball motion finishes
        console.log(`[GAME EVENT] Ball hit into the field. Pending physical resolution for runs.`);
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

    if (!extra.isExtra) {
      innings.ballsBowled += 1;
    }

    if (isWicket) {
      innings.wicketsLost = innings.maxWickets; // Forfeit remaining balls by maximizing wickets
      innings.finished = true;
      console.log(`[GAME EVENT] WICKET! Batter dismissed: ${wicketReason}. Innings finished.`);
    }

    // Check if innings is finished (6 legal balls or 1 wicket)
    const maxBalls = this.state.tieBreakerActive ? 1 : 6;
    if (innings.ballsBowled >= maxBalls || innings.wicketsLost >= innings.maxWickets) {
      innings.finished = true;
      console.log(`[GAME EVENT] Innings completed. Legal balls: ${innings.ballsBowled}. Wickets: ${innings.wicketsLost}. Biggest Six: ${innings.biggestSix}m.`);
    }

    // In case of wicket or extra, we can transition immediately, but we will rely on ui.ts delayed reset.
    // So we can still evaluate it here. But we will remove checkInningsTransitions from here for hits.
    if (isWicket || distance === 0) {
      this.handleInningsCompletion();
    }
    return outcome;
  }

  public finalizeBallOutcome(rawDistance: number, hasBounced: boolean): number {
    try {
      let distance = rawDistance;
      if (isNaN(distance) || !isFinite(distance) || distance < 0) {
        distance = 0.0;
      }
      distance = Math.min(distance, 130.0);

      const innings = this.getCurrentInnings();
      
      // Evaluate outcome using formula
      const runs = evaluateFinalOutcome(distance, hasBounced);
      
      innings.score += runs;
      if (runs === 6) {
        innings.biggestSix = Math.max(innings.biggestSix, distance);
      }
      
      const lastBall = innings.balls[innings.balls.length - 1];
      if (lastBall) {
        lastBall.distance = distance;
      }
      
      console.log(`[GAME EVENT] Dynamic resolution: ${distance.toFixed(1)}m, bounced: ${hasBounced} => ${runs} runs. Score: ${innings.score}`);
      this.handleInningsCompletion();
      return runs;
    } catch (e) {
      console.error("[BALL TRACKING CRASH GUARD]", e);
      return 0;
    }
  }

  public handleInningsCompletion(): void {
    const currentInnings = this.getCurrentInnings();
    if (currentInnings.finished) {
      if (globalAutoAssistConfig.removeTrajectoryObserver) {
        globalAutoAssistConfig.removeTrajectoryObserver();
      }
      globalAutoAssistConfig.isBallInPlay = false;
      globalAutoAssistConfig.isDeliveryActive = false;
      
      if (globalAutoAssistConfig.resetSceneForInnings) {
        globalAutoAssistConfig.resetSceneForInnings();
      }

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = 'innings-transition-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      overlay.style.color = 'white';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.fontSize = '3rem';
      overlay.style.fontWeight = 'bold';
      overlay.style.zIndex = '9999';
      overlay.innerText = 'INNINGS OVER - PREPARING TO BOWL';
      document.body.appendChild(overlay);

      // Restore bowling panel controls immediately
      const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
      if (controlBowling) {
        controlBowling.classList.remove('hidden', 'panel-hidden');
      }

      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        
        // If we are at an even index (0, 2, 4), move to the next innings
        if (this.state.currentInningsIndex % 2 === 0) {
          this.state.currentInningsIndex++;
          console.log(`[GAME EVENT] Transitioning to Innings ${this.state.currentInningsIndex + 1}. Swapping roles.`);
          this.updateActiveCameraMode();
        } else {
          // End of the pair, resolve match or tie-break
          this.resolveMatch();
        }
      }, 2000);
    }
  }

  private resolveMatch(): void {
    const isSuddenDeath = this.state.tieBreakerActive && this.state.innings.length >= 4;
    
    // If sudden death, compare sudden death innings (indexes 2 & 3), else standard innings (indexes 0 & 1)
    const inn1 = isSuddenDeath ? this.state.innings[2] : this.state.innings[0];
    const inn2 = isSuddenDeath ? this.state.innings[3] : this.state.innings[1];
    
    console.log(`[GAME EVENT] Resolving match segment. Inn1 (${inn1.batter.name}) biggest six: ${inn1.biggestSix}m. Inn2 (${inn2.batter.name}) biggest six: ${inn2.biggestSix}m.`);

    let winnerId: string | null = null;
    let tieBreakDetails: TieBreakDetails | undefined;

    if (isSuddenDeath) {
      const dist1 = inn1.balls[0]?.distance || 0;
      const dist2 = inn2.balls[0]?.distance || 0;
      const wicket1 = inn1.wicketsLost > 0;
      const wicket2 = inn2.wicketsLost > 0;

      if (!wicket1 && wicket2) {
        winnerId = inn1.batter.id;
      } else if (!wicket2 && wicket1) {
        winnerId = inn2.batter.id;
      } else if (dist1 > dist2) {
        winnerId = inn1.batter.id;
      } else if (dist2 > dist1) {
        winnerId = inn2.batter.id;
      } else {
        winnerId = null; // Absolute draw
      }

      const winnerInn = winnerId === inn1.batter.id ? inn1 : (winnerId === inn2.batter.id ? inn2 : null);
      const loserInn = winnerId === inn1.batter.id ? inn2 : (winnerId === inn2.batter.id ? inn1 : null);

      if (winnerInn && loserInn) {
        const winDist = winnerInn.balls[0]?.distance || 0;
        const loseDist = loserInn.balls[0]?.distance || 0;
        tieBreakDetails = {
          deciderTier: 'sudden_death',
          tierLabel: '1-Ball Sudden Death Decider',
          description: 'Decided in Sudden Death Extra Delivery',
          marginText: `Won via Sudden Death Decider: ${winDist.toFixed(1)}m vs ${loseDist.toFixed(1)}m`
        };
      } else {
        tieBreakDetails = {
          deciderTier: 'draw',
          tierLabel: 'Sudden Death Draw',
          description: 'Scores and hit distances level after Sudden Death decider',
          marginText: 'Draw: All tie-break ladder metrics equal'
        };
      }
    } else {
      // Standard match evaluation
      if (Math.abs(inn1.biggestSix - inn2.biggestSix) > 0.01) {
        winnerId = inn1.biggestSix > inn2.biggestSix ? inn1.batter.id : inn2.batter.id;
        const winSix = Math.max(inn1.biggestSix, inn2.biggestSix);
        const loseSix = Math.min(inn1.biggestSix, inn2.biggestSix);
        tieBreakDetails = {
          deciderTier: 'biggest_six',
          tierLabel: 'Single Biggest Six',
          description: 'Decided via Primary Objective: Single Biggest Six Distance',
          marginText: `Won via Single Biggest Six: ${winSix.toFixed(1)}m vs ${loseSix.toFixed(1)}m`
        };
      } else {
        // Tie-break Tier 1: Fewer wickets lost
        console.log(`[GAME EVENT] Biggest sixes are tied (${inn1.biggestSix.toFixed(1)}m). Applying Tie-break Tier 1 (fewer wickets lost).`);
        if (inn1.wicketsLost !== inn2.wicketsLost) {
          winnerId = inn1.wicketsLost < inn2.wicketsLost ? inn1.batter.id : inn2.batter.id;
          const winWickets = Math.min(inn1.wicketsLost, inn2.wicketsLost);
          const loseWickets = Math.max(inn1.wicketsLost, inn2.wicketsLost);
          tieBreakDetails = {
            deciderTier: 'wickets',
            tierLabel: 'Fewer Wickets Lost Decider',
            description: 'Decided via Tie-Break Ladder Tier 1 (Wicket Preservation)',
            marginText: `Won via Fewer Wickets Lost: ${winWickets} vs ${loseWickets} wickets lost`
          };
        } else {
          // Tie-break Tier 2: Total carry distance
          console.log(`[GAME EVENT] Wickets lost are tied. Applying Tie-break Tier 2 (total carry distance).`);
          const totalDist1 = inn1.balls.reduce((acc, b) => acc + b.distance, 0);
          const totalDist2 = inn2.balls.reduce((acc, b) => acc + b.distance, 0);
          
          if (Math.abs(totalDist1 - totalDist2) > 0.01) {
            winnerId = totalDist1 > totalDist2 ? inn1.batter.id : inn2.batter.id;
            const winDist = Math.max(totalDist1, totalDist2);
            const loseDist = Math.min(totalDist1, totalDist2);
            tieBreakDetails = {
              deciderTier: 'total_carry',
              tierLabel: 'Total Carry Distance Decider',
              description: 'Decided via Tie-Break Ladder Tier 2 (Aggregate Distance of All Hits)',
              marginText: `Won via Total Carry Distance: ${winDist.toFixed(1)}m vs ${loseDist.toFixed(1)}m`
            };
          } else {
            // Tie-break Tier 3: Second biggest six
            console.log(`[GAME EVENT] Total carry distances are tied. Applying Tie-break Tier 3 (second biggest six).`);
            const sortedDist1 = inn1.balls.map(b => b.distance).sort((a, b) => b - a);
            const sortedDist2 = inn2.balls.map(b => b.distance).sort((a, b) => b - a);
            const secBiggest1 = sortedDist1[1] || 0;
            const secBiggest2 = sortedDist2[1] || 0;
            
            if (Math.abs(secBiggest1 - secBiggest2) > 0.01) {
              winnerId = secBiggest1 > secBiggest2 ? inn1.batter.id : inn2.batter.id;
              const winSec = Math.max(secBiggest1, secBiggest2);
              const loseSec = Math.min(secBiggest1, secBiggest2);
              tieBreakDetails = {
                deciderTier: 'second_biggest_six',
                tierLabel: '2nd Biggest Six Decider',
                description: 'Decided via Tie-Break Ladder Tier 3 (Second Furthest Hit)',
                marginText: `Won via 2nd Biggest Six: ${winSec.toFixed(1)}m vs ${loseSec.toFixed(1)}m`
              };
            } else {
              // Trigger 1-ball Sudden Death Decider
              console.log(`[GAME EVENT] Match completely tied across all tiers. Activating 1-ball sudden death decider!`);
              this.state.tieBreakerActive = true;
              this.setupSuddenDeath();
              return;
            }
          }
        }
      }
    }

    this.state.winnerId = winnerId;
    this.state.tieBreakDetails = tieBreakDetails;
    this.state.status = 'completed';
    this.state.cameraMode = 'stadium_wide';
    console.log(`[GAME EVENT] Match finished. Winner ID: ${winnerId}. Decider: ${tieBreakDetails?.marginText}`);
    this.applyProgression(winnerId === this.state.player.id);
  }

  private setupSuddenDeath(): void {
    const playerBatsFirst = Math.random() > 0.5;
    
    const inn1: Innings = {
      batter: playerBatsFirst ? this.state.player : this.state.bot,
      bowler: playerBatsFirst ? this.state.bot : this.state.player,
      balls: [],
      ballsBowled: 0,
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
      ballsBowled: 0,
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
    
    // Calculate player's total sixes across all batting innings
    const playerInnings = this.state.innings.filter(i => i.batter.id === player.id);
    const sixesHit = playerInnings.reduce((acc, inn) => acc + inn.balls.filter(b => b.distance >= SIX_THRESHOLD).length, 0);
    
    const isTie = this.state.winnerId === null;
    const baseXP = playerWon ? 100 : (isTie ? 50 : 30);
    const sixBonusXP = sixesHit * 10;
    const totalXPGained = baseXP + sixBonusXP;
    
    player.xp += totalXPGained;

    // Progression Tier limits
    if (player.xp >= 1000) player.rank = 'Legend';
    else if (player.xp >= 600) player.rank = 'Elite';
    else if (player.xp >= 300) player.rank = 'Gold';
    else if (player.xp >= 100) player.rank = 'Silver';

    // Increment stats slightly on win or match play
    const statInc = playerWon ? 2 : 1;
    const stats = player.stats;
    
    const upgradeOptions: { name: string; apply: () => number }[] = [
      { name: 'Power', apply: () => stats.batting.power = Math.min(100, stats.batting.power + statInc) },
      { name: 'Timing', apply: () => stats.batting.timing = Math.min(100, stats.batting.timing + statInc) },
      { name: 'Technique', apply: () => stats.batting.technique = Math.min(100, stats.batting.technique + statInc) },
      { name: 'Accuracy', apply: () => stats.bowling.accuracy = Math.min(100, stats.bowling.accuracy + statInc) },
      { name: 'Variation', apply: () => stats.bowling.variation = Math.min(100, stats.bowling.variation + statInc) }
    ];
    
    const choice = upgradeOptions[Math.floor(Math.random() * upgradeOptions.length)];
    const newVal = choice.apply();

    this.state.progression = {
      xpGained: totalXPGained,
      baseXP,
      sixBonusXP,
      sixesCount: sixesHit,
      statUpgraded: {
        statName: choice.name,
        increase: statInc,
        newValue: newVal
      }
    };

    savePlayer(player);
  }
}

  export function initBattingDelivery(isBotBowler: boolean, ball: any): void {
    if (isBotBowler) {
      const indicator = document.createElement('div');
      indicator.id = 'bowler-runup-indicator';
      indicator.style.position = 'absolute';
      indicator.style.top = '10%';
      indicator.style.left = '50%';
      indicator.style.transform = 'translateX(-50%)';
      indicator.style.fontSize = '2rem';
      indicator.style.color = 'white';
      indicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
      indicator.style.padding = '10px';
      indicator.style.zIndex = '9999';
      indicator.innerText = 'Bowler Running In...';
      document.body.appendChild(indicator);
  
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
        startBotDelivery(ball);
      }, 1200);
    }
  }

  export function startBotDelivery(ball: any): void {
    if (ball) {
      ball.isVisible = true;
      if (typeof ball.setEnabled === 'function') ball.setEnabled(true);
      if (ball.position) {
        ball.position.set(0.0, 1.8, 16.5);
      }
      globalAutoAssistConfig.isDeliveryActive = true;
      globalAutoAssistConfig.deliveryStartTime = performance.now();
      globalAutoAssistConfig.hasBounced = false;
    }
  }
