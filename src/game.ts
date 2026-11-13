import { Player, MatchState, Innings, BallOutcome, DeliveryChoice, ShotChoice, PlayerStats, CameraMode, TieBreakDetails } from './types';
import { battingAssistanceMultiplier, evaluateWicket, resolveMissedDelivery, calculateDistance, checkExtraBall, deliveryContactPoint, deliveryReleaseX, calculateEffectiveWindow, calculateContactQuality, getContactQualityTier, evaluateFinalOutcome } from './formula';
import { clearGameTimeout, gameNow, setGameTimeout } from './game-clock';
import { SeededRandom } from './random';

const LOCAL_STORAGE_KEY = 'six_hitting_contest_player';

export function inningsBallLimit(tieBreakerActive: boolean): number {
  return tieBreakerActive ? 1 : 6;
}

/** Contact has been recorded, but the outgoing flight has not yet scored. */
export function isPendingShotOutcome(outcome: BallOutcome | undefined): boolean {
  return !!outcome && outcome.runs === undefined && !!outcome.shot && !outcome.missed && !outcome.isWicket && outcome.extraType !== 'wide';
}

export const globalAutoAssistConfig: { 
  isRookie: boolean, 
  currentDelivery: DeliveryChoice | null, 
  batterHand: 'RHB' | 'LHB', 
  deliveryStartTime?: number,
  delta_t?: number,
  ballZ?: number,
  isDeliveryActive?: boolean,
  isBallInPlay?: boolean,
  hasBounced?: boolean,
  isRunUpActive?: boolean,
  runUpStartTime?: number,
  bowlerArm?: 'Right' | 'Left',
  removeTrajectoryObserver?: () => void;
  resetSceneForInnings?: () => void;
} = {
  isRookie: false,
  currentDelivery: null,
  batterHand: 'RHB',
  isDeliveryActive: false,
  isBallInPlay: false,
  hasBounced: false,
  isRunUpActive: false
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
    if (globalAutoAssistConfig.ballZ <= -14.0 && globalAutoAssistConfig.ballZ >= -18.5) {
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

let sessionPlayer: Player | null = null;

function defaultPlayer(): Player {
  return {
    id: 'player_1', name: 'You (All-Rounder)', isBot: false, xp: 0, rank: 'Bronze',
    stats: { batting: { ...DEFAULT_STATS.batting }, bowling: { ...DEFAULT_STATS.bowling } }
  };
}

function normalizePlayer(value: unknown): Player {
  const player = defaultPlayer();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return player;
  const data = value as Record<string, unknown>;
  if (typeof data.id === 'string' && data.id) player.id = data.id;
  if (typeof data.name === 'string' && data.name) player.name = data.name;
  if (typeof data.xp === 'number' && Number.isFinite(data.xp)) player.xp = Math.max(0, data.xp);
  if (data.rank === 'Bronze' || data.rank === 'Silver' || data.rank === 'Gold' || data.rank === 'Elite' || data.rank === 'Legend') player.rank = data.rank;
  if (data.batterHand === 'RHB' || data.batterHand === 'LHB') player.batterHand = data.batterHand;
  if (data.bowlingArm === 'Right' || data.bowlingArm === 'Left') player.bowlingArm = data.bowlingArm;
  const stats = data.stats && typeof data.stats === 'object' ? data.stats as Record<string, unknown> : {};
  for (const group of ['batting', 'bowling'] as const) {
    const source = stats[group] && typeof stats[group] === 'object' ? stats[group] as Record<string, unknown> : {};
    const target = player.stats[group] as unknown as Record<string, number>;
    for (const key of Object.keys(target)) {
      const stat = source[key];
      if (typeof stat === 'number' && Number.isFinite(stat)) target[key] = Math.max(0, Math.min(100, stat));
    }
  }
  return player;
}

export function getOrCreatePlayer(): Player {
  let data: string | null;
  try {
    data = localStorage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    return sessionPlayer ?? (sessionPlayer = defaultPlayer());
  }
  if (data) {
    try {
      return normalizePlayer(JSON.parse(data));
    } catch {
      // Do not overwrite unreadable data merely by opening the lobby.
      return sessionPlayer ?? (sessionPlayer = defaultPlayer());
    }
  }

  const player = defaultPlayer();
  savePlayer(player);
  return player;
}

export function savePlayer(player: Player): void {
  sessionPlayer = player;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(player));
  } catch {
    // Continue with the current session if browser storage is unavailable.
  }
}

export function createBotPlayer(difficulty: 'Rookie' | 'Medium' | 'Hard'): Player {
  let statsMultiplier = 0.7; // Rookie: approximately 35
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
  public readonly botDifficulty: 'Rookie' | 'Medium' | 'Hard';
  public readonly random: () => number;
  public readonly randomSeed?: number;
  private transitionPending = false;
  private transitionGeneration = 0;
  private transitionOverlay: HTMLElement | null = null;
  private transitionTimer: number | null = null;
  private transitionCallbacks: Array<() => void> = [];

  constructor(botDifficulty: 'Rookie' | 'Medium' | 'Hard', randomOrSeed: (() => number) | number = Math.random) {
    this.botDifficulty = botDifficulty;
    this.randomSeed = typeof randomOrSeed === 'number' ? randomOrSeed >>> 0 : undefined;
    this.random = typeof randomOrSeed === 'number' ? new SeededRandom(this.randomSeed!).next : randomOrSeed;
    globalAutoAssistConfig.isRookie = botDifficulty === 'Rookie';
    // A controller must start with valid state even if another scene still has
    // a ball in play. The active-match reset guard applies only to reset().
    this.state = this.createInitialMatchState(getOrCreatePlayer(), createBotPlayer(botDifficulty));
  }

  public reset(): void {
    if (globalAutoAssistConfig.isBallInPlay) return;
    this.transitionGeneration++;
    this.transitionPending = false;
    this.transitionCallbacks = [];
    if (this.transitionTimer !== null) clearGameTimeout(this.transitionTimer);
    this.transitionTimer = null;
    this.transitionOverlay?.parentNode?.removeChild(this.transitionOverlay);
    this.transitionOverlay = null;
    const player = getOrCreatePlayer();
    const bot = createBotPlayer(this.botDifficulty);
    this.state = this.createInitialMatchState(player, bot);
  }

  private createInitialMatchState(player: Player, bot: Player): MatchState {
    return {
      ...(this.randomSeed === undefined ? {} : { randomSeed: this.randomSeed }),
      events: [],
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
      maxWickets: 6,
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
      maxWickets: 6,
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
    globalAutoAssistConfig.deliveryStartTime = gameNow();
    const innings = this.getCurrentInnings();
    globalAutoAssistConfig.bowlerArm = innings.bowler.bowlingArm || 'Right';
  }

  public recordBall(inputDelivery: DeliveryChoice, inputShot: ShotChoice | null): BallOutcome {
    const innings = this.getCurrentInnings();
    if (this.state.status !== 'playing' || !innings || innings.finished) {
      throw new Error('Cannot record a delivery after the innings has finished');
    }
    // A completed ball must not change when controls prepare the next delivery.
    const delivery: DeliveryChoice = {
      ...inputDelivery,
      aimTarget: { ...inputDelivery.aimTarget },
      ...(inputDelivery.batterPosition ? { batterPosition: { ...inputDelivery.batterPosition } } : {})
    };
    const shot: ShotChoice | null = inputShot ? { ...inputShot } : null;
    
    // Save whether this ball is a Free Hit
    const isFreeHit = innings.isNextFreeHit;
    // Reset next ball's Free Hit state
    innings.isNextFreeHit = false;

    // Reset bounce state for the new delivery
    globalAutoAssistConfig.hasBounced = false;

    const ballNumber = innings.ballsBowled + 1;

    let extra = checkExtraBall(delivery, innings.batter.batterHand || 'RHB');
    
    let isWicket = false;
    let wicketReason = '';
    let distance = 0;
    let missed = shot === null;

    const assistMultiplier = battingAssistanceMultiplier(innings.batter, innings.bowler, this.botDifficulty);

    const wicketResult = shot ? evaluateWicket(innings.batter, innings.bowler, delivery, shot, assistMultiplier) : null;
    if (wicketResult) missed = wicketResult.missed ?? false;
    const relativeLine = deliveryContactPoint(delivery).x - (delivery.batterPosition?.x ?? 0);
    if (shot && Math.abs(relativeLine) > 1.25) missed = true;
    // A ball contacted by the bat is not a wide, provided it is within reach.
    if (extra.type === 'wide' && shot && !missed && Math.abs(relativeLine) <= 1.25) {
      extra = { isExtra: false, type: null };
    }
    if (extra.type === 'wide') missed = true;

    if (extra.isExtra) {
      innings.score += 1; // +1 run penalty
      innings.isNextFreeHit = isFreeHit || extra.type === 'noball';
      
      if (extra.type === 'wide') {
        wicketReason = 'Penalty - Wide ball!';
      } else {
        wicketReason = 'Front-foot no-ball! (Free hit next)';
      }
      distance = 0;
      console.log(`[GAME EVENT] Extra ball penalty: ${extra.type?.toUpperCase()}. Innings score: ${innings.score}.`);
    }
    if (!extra.isExtra && shot === null) {
      const dismissal = isFreeHit ? null : resolveMissedDelivery(delivery, innings.batter.batterHand || 'RHB', false);
      isWicket = dismissal !== null;
      wicketReason = dismissal === 'lbw' ? 'LBW' : dismissal === 'bowled' ? 'Bowled' : 'Missed delivery!';
      distance = 0;
      console.log(`[GAME EVENT] Missed delivery. Ball number ${ballNumber}`);
    } else if (shot && wicketResult && extra.type !== 'wide') {
      isWicket = wicketResult.isWicket;
      wicketReason = extra.type === 'noball' ? 'Front-foot no-ball! (Free hit next)' : wicketResult.reason;
      
      if (!isWicket && !missed) {
        const distResult = calculateDistance(innings.batter, innings.bowler, delivery, shot, wicketResult.safeWindowMs, wicketResult.isEdgeFallback, assistMultiplier);
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
      missed,
      distance,
      isWicket,
      wicketReason,
      isFreeHit,
      isExtra: extra.isExtra,
      extraType: extra.type
    };

    innings.balls.push(outcome);
    const pendingFlight = !!shot && !missed && !isWicket && extra.type !== 'wide';
    this.state.events.push({
      sequence: this.state.events.length,
      type: 'delivery',
      inningsIndex: this.state.currentInningsIndex,
      ballNumber,
      batterId: innings.batter.id,
      bowlerId: innings.bowler.id,
      delivery: { ...delivery, aimTarget: { ...delivery.aimTarget }, ...(delivery.batterPosition ? { batterPosition: { ...delivery.batterPosition } } : {}) },
      shot: shot ? { ...shot } : null,
      missed,
      isWicket,
      wicketReason,
      isFreeHit,
      isExtra: extra.isExtra,
      extraType: extra.type,
      distance,
      ...(!pendingFlight ? { ...(outcome.runs === undefined ? {} : { runs: outcome.runs }), resolved: true } : { resolved: false }),
    });

    if (!extra.isExtra) {
      innings.ballsBowled += 1;
    }

    if (isWicket) {
      innings.wicketsLost += 1;
      console.log(`[GAME EVENT] WICKET! Batter dismissed: ${wicketReason}.`);
    }

    // A regular contest always gives each batter six legal deliveries.
    const maxBalls = inningsBallLimit(this.state.tieBreakerActive);
    if (innings.ballsBowled >= maxBalls) {
      innings.finished = true;
      console.log(`[GAME EVENT] Innings completed. Legal balls: ${innings.ballsBowled}. Wickets: ${innings.wicketsLost}. Biggest Six: ${innings.biggestSix}m.`);
    }

    return outcome;
  }

  public finalizeBallOutcome(rawDistance: number, hasBounced: boolean, reachedBoundary?: boolean): number {
    try {
      let distance = rawDistance;
      if (isNaN(distance) || !isFinite(distance) || distance < 0) {
        distance = 0.0;
      }
      const innings = this.getCurrentInnings();
      const lastBall = innings.balls[innings.balls.length - 1];
      if (!lastBall || !lastBall.shot || lastBall.missed || lastBall.isWicket || lastBall.extraType === 'wide') return 0;
      if (lastBall.runs !== undefined) return lastBall.runs;
      
      // Evaluate outcome using formula
      const runs = evaluateFinalOutcome(distance, hasBounced, reachedBoundary);
      
      innings.score += runs;
      if (runs === 6) {
        innings.biggestSix = Math.max(innings.biggestSix, distance);
      }
      
      lastBall.distance = distance;
      lastBall.runs = runs;
      const event = [...this.state.events].reverse().find(item => item.inningsIndex === this.state.currentInningsIndex && item.ballNumber === lastBall.ballNumber);
      if (event && !event.resolved) {
        event.distance = distance;
        event.runs = runs;
        event.resolved = true;
        event.flight = { hasBounced, ...(reachedBoundary === undefined ? {} : { reachedBoundary }) };
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
    if (currentInnings.finished && !this.transitionPending && !isPendingShotOutcome(currentInnings.balls[currentInnings.balls.length - 1])) {
      this.transitionPending = true;
      globalAutoAssistConfig.isBallInPlay = false;
      globalAutoAssistConfig.isDeliveryActive = false;
      
      if (globalAutoAssistConfig.resetSceneForInnings) {
        globalAutoAssistConfig.resetSceneForInnings();
      }

      // Overlay
      const overlay = document.createElement('div');
      this.transitionOverlay = overlay;
      const generation = this.transitionGeneration;
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
      overlay.innerText = 'INNINGS OVER';
      document.body.appendChild(overlay);

      // Ensure all UI panels from the batting phase are cleanly hidden/unmounted.
      const controlBatting = document.getElementById('control-batting');
      if (controlBatting) {
        controlBatting.classList.add('hidden', 'panel-hidden');
      }
      const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
      if (controlBowling) {
        controlBowling.classList.add('hidden', 'panel-hidden');
      }

      this.transitionTimer = setGameTimeout(() => {
        if (generation !== this.transitionGeneration) return;
        this.transitionTimer = null;
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        this.transitionOverlay = null;
        this.transitionPending = false;
        
        // If we are at an even index (0, 2, 4), move to the next innings
        if (this.state.currentInningsIndex % 2 === 0) {
          this.state.currentInningsIndex++;
          console.log(`[GAME EVENT] Transitioning to Innings ${this.state.currentInningsIndex + 1}. Swapping roles.`);
          this.updateActiveCameraMode();
        } else {
          // End of the pair, resolve match or tie-break
          this.resolveMatch();
        }
        const callbacks = this.transitionCallbacks;
        this.transitionCallbacks = [];
        callbacks.forEach(callback => callback());
      }, 2000);
    }
  }

  /** Run after the current innings transition has actually updated match state. */
  public afterInningsTransition(callback: () => void): void {
    const innings = this.getCurrentInnings();
    if (this.transitionPending || (innings.finished && isPendingShotOutcome(innings.balls[innings.balls.length - 1]))) this.transitionCallbacks.push(callback);
    else callback();
  }

  private resolveMatch(applyProgression = true): void {
    const isSuddenDeath = this.state.tieBreakerActive && this.state.innings.length >= 4;
    
    // If sudden death, compare sudden death innings (indexes 2 & 3), else standard innings (indexes 0 & 1)
    const inn1 = isSuddenDeath ? this.state.innings[2] : this.state.innings[0];
    const inn2 = isSuddenDeath ? this.state.innings[3] : this.state.innings[1];
    
    console.log(`[GAME EVENT] Resolving match segment. Inn1 (${inn1.batter.name}) biggest six: ${inn1.biggestSix}m. Inn2 (${inn2.batter.name}) biggest six: ${inn2.biggestSix}m.`);

    let winnerId: string | null = null;
    let tieBreakDetails: TieBreakDetails | undefined;

    if (isSuddenDeath) {
      const dist1 = inn1.balls.find(ball => !ball.isExtra)?.distance || 0;
      const dist2 = inn2.balls.find(ball => !ball.isExtra)?.distance || 0;
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
        const winDist = winnerInn.balls.find(ball => !ball.isExtra)?.distance || 0;
        const loseDist = loserInn.balls.find(ball => !ball.isExtra)?.distance || 0;
        const decidedByWicket = winnerInn.wicketsLost !== loserInn.wicketsLost;
        tieBreakDetails = {
          deciderTier: 'sudden_death',
          tierLabel: '1-Ball Sudden Death Decider',
          description: 'Decided in Sudden Death Extra Delivery',
          marginText: decidedByWicket
            ? `${winnerInn.batter.name} survived; ${loserInn.batter.name} was dismissed.`
            : `Won on sudden-death distance: ${winDist.toFixed(1)}m vs ${loseDist.toFixed(1)}m`
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
      if (inn1.biggestSix !== inn2.biggestSix) {
        winnerId = inn1.biggestSix > inn2.biggestSix ? inn1.batter.id : inn2.batter.id;
        const winSix = Math.max(inn1.biggestSix, inn2.biggestSix);
        const loseSix = Math.min(inn1.biggestSix, inn2.biggestSix);
        tieBreakDetails = {
          deciderTier: 'biggest_six',
          tierLabel: 'Single Biggest Six',
          description: 'Decided via Primary Objective: Single Biggest Six Distance',
          marginText: winSix.toFixed(1) === loseSix.toFixed(1)
            ? `Both sixes display ${winSix.toFixed(1)}m; the winner's unrounded distance was greater.`
            : `Won via Single Biggest Six: ${winSix.toFixed(1)}m vs ${loseSix.toFixed(1)}m`
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
        } else if (inn1.biggestSix === 0 && inn2.biggestSix === 0) {
          if (inn1.score === inn2.score) {
            this.state.tieBreakerActive = true;
            this.setupSuddenDeath();
            return;
          }
          winnerId = inn1.score > inn2.score ? inn1.batter.id : inn2.batter.id;
          tieBreakDetails = {
            deciderTier: 'runs',
            tierLabel: 'Runs Scored Decider',
            description: 'Neither batter hit a six; wickets were level',
            marginText: `Won on runs: ${Math.max(inn1.score, inn2.score)} vs ${Math.min(inn1.score, inn2.score)}`
          };
        } else {
          const sixes1 = inn1.balls.filter(ball => ball.runs === 6).length;
          const sixes2 = inn2.balls.filter(ball => ball.runs === 6).length;
          const total1 = inn1.balls.reduce((sum, ball) => sum + ball.distance, 0);
          const total2 = inn2.balls.reduce((sum, ball) => sum + ball.distance, 0);

          if (sixes1 !== sixes2) {
            winnerId = sixes1 > sixes2 ? inn1.batter.id : inn2.batter.id;
            tieBreakDetails = {
              deciderTier: 'six_count',
              tierLabel: 'Sixes Hit Decider',
              description: 'Biggest six and wickets were level; more sixes win',
              marginText: `Won on sixes: ${Math.max(sixes1, sixes2)} vs ${Math.min(sixes1, sixes2)}`
            };
          } else if (Math.abs(total1 - total2) > 0.01) {
            winnerId = total1 > total2 ? inn1.batter.id : inn2.batter.id;
            tieBreakDetails = {
              deciderTier: 'total_carry',
              tierLabel: 'Total Carry Distance Decider',
              description: 'Decided by the combined distance of all hits',
              marginText: `Won via Total Carry Distance: ${Math.max(total1, total2).toFixed(1)}m vs ${Math.min(total1, total2).toFixed(1)}m`
            };
          } else {
            this.state.tieBreakerActive = true;
            this.setupSuddenDeath();
            return;
          }
        }
      }
    }

    this.state.winnerId = winnerId;
    this.state.tieBreakDetails = tieBreakDetails;
    this.state.status = 'completed';
    this.state.cameraMode = 'stadium_wide';
    console.log(`[GAME EVENT] Match finished. Winner ID: ${winnerId}. Decider: ${tieBreakDetails?.marginText}`);
    if (applyProgression) this.applyProgression(winnerId === this.state.player.id);
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
    const sixesHit = playerInnings.reduce((acc, inn) => acc + inn.balls.filter(b => b.runs === 6).length, 0);
    
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

    // Attribute gains follow the strongest measurable batting/bowling result.
    const statInc = playerWon ? 2 : 1;
    const stats = player.stats;
    const bowlingEvents = this.state.events.filter(event => event.bowlerId === player.id);
    const boundaries = playerInnings.reduce((sum, innings) => sum + innings.balls.filter(ball => ball.runs === 4 || ball.runs === 6).length, 0);
    const scoringShots = playerInnings.reduce((sum, innings) => sum + innings.balls.filter(ball => !!ball.shot && (ball.runs ?? 0) > 0).length, 0);
    const successfulContacts = playerInnings.reduce((sum, innings) => sum + innings.balls.filter(ball => !!ball.shot && !ball.missed && !ball.isWicket).length, 0);
    const bowlingWickets = this.state.innings.filter(innings => innings.bowler.id === player.id).reduce((sum, innings) => sum + innings.wicketsLost, 0);
    const deliveryVariety = new Set(bowlingEvents.map(event => event.delivery.type)).size;
    const choices = [
      { name: 'Power', score: boundaries * 2, reason: `${boundaries} boundary hit${boundaries === 1 ? '' : 's'}`, apply: () => stats.batting.power = Math.min(100, stats.batting.power + statInc) },
      { name: 'Timing', score: scoringShots, reason: `${scoringShots} scoring shot${scoringShots === 1 ? '' : 's'}`, apply: () => stats.batting.timing = Math.min(100, stats.batting.timing + statInc) },
      { name: 'Technique', score: successfulContacts, reason: `${successfulContacts} successful contact${successfulContacts === 1 ? '' : 's'}`, apply: () => stats.batting.technique = Math.min(100, stats.batting.technique + statInc) },
      { name: 'Accuracy', score: bowlingWickets * 3, reason: `${bowlingWickets} wicket${bowlingWickets === 1 ? '' : 's'} while bowling`, apply: () => stats.bowling.accuracy = Math.min(100, stats.bowling.accuracy + statInc) },
      { name: 'Variation', score: deliveryVariety, reason: `${deliveryVariety} delivery type${deliveryVariety === 1 ? '' : 's'} used`, apply: () => stats.bowling.variation = Math.min(100, stats.bowling.variation + statInc) }
    ];
    const eligible = choices.filter(choice => {
      if (choice.score <= 0) return false;
      if (choice.name === 'Power') return stats.batting.power < 100;
      if (choice.name === 'Timing') return stats.batting.timing < 100;
      if (choice.name === 'Technique') return stats.batting.technique < 100;
      if (choice.name === 'Accuracy') return stats.bowling.accuracy < 100;
      return stats.bowling.variation < 100;
    });
    eligible.sort((a, b) => b.score - a.score);
    const choice = eligible[0];
    const newVal = choice?.apply();

    this.state.progression = {
      xpGained: totalXPGained,
      baseXP,
      sixBonusXP,
      sixesCount: sixesHit,
      ...(choice && newVal !== undefined ? { statUpgraded: {
        statName: choice.name,
        increase: statInc,
        newValue: newVal,
        reason: choice.reason
      } } : {})
    };

    savePlayer(player);
  }
}

  export function initBattingDelivery(isBotBowler: boolean, ball: any, onRelease: () => void = () => {}): () => void {
    if (isBotBowler) {
      globalAutoAssistConfig.isRunUpActive = true;
      globalAutoAssistConfig.runUpStartTime = gameNow();
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
  
      const timer = setGameTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
        globalAutoAssistConfig.isRunUpActive = false;
        startBotDelivery(ball);
        onRelease();
      }, 1200);
      return () => {
        clearGameTimeout(timer);
        indicator.remove();
        globalAutoAssistConfig.isRunUpActive = false;
      };
    }
    return () => {};
  }

  export function startBotDelivery(ball: any): void {
    if (ball) {
      ball.isVisible = true;
      if (typeof ball.setEnabled === 'function') ball.setEnabled(true);
      const startX = deliveryReleaseX(globalAutoAssistConfig.currentDelivery || { bowlingArm: globalAutoAssistConfig.bowlerArm });
      if (ball.position) {
        ball.position.set(startX, 1.9, 10.0);
      }
      globalAutoAssistConfig.isDeliveryActive = true;
      globalAutoAssistConfig.deliveryStartTime = gameNow();
      globalAutoAssistConfig.hasBounced = false;
    }
  }
