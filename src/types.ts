export interface BatterStats {
  power: number;      // 0 - 100
  timing: number;     // 0 - 100
  placement: number;  // 0 - 100
  technique: number;  // 0 - 100
  stamina: number;    // 0 - 100
}

export interface BowlerStats {
  pace: number;       // 0 - 100
  swing: number;      // 0 - 100
  spin: number;       // 0 - 100
  accuracy: number;   // 0 - 100
  stamina: number;    // 0 - 100
  variation: number;  // 0 - 100
}

export interface FieldingStats {
  agility: number;    // 0 - 100
  reaction: number;   // 0 - 100
  catching: number;   // 0 - 100
  throwing: number;   // 0 - 100
}

export interface PlayerStats {
  batting: BatterStats;
  bowling: BowlerStats;
  /** Optional for compatibility with profiles saved before fielding ratings existed. */
  fielding?: FieldingStats;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  xp: number;
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Elite' | 'Legend';
  stats: PlayerStats;
  batterHand?: 'RHB' | 'LHB';
  bowlingArm?: 'Right' | 'Left';
}

export type LineType = 'off' | 'middle' | 'leg';
export type LengthType = 'bouncer' | 'short' | 'good' | 'full' | 'yorker';
export type DeliveryType = 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin';
export type FieldPreset = 'attacking' | 'balanced' | 'deep';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface DeliveryChoice {
  aimTarget: { x: number; z: number }; // X: line (-1.5 to 1.5), Z: length (3 to 18 meters from bowling crease)
  line: LineType;
  length: LengthType;
  type: DeliveryType;
  releaseTiming: number; // 0.0 to 1.0 (0.5 is perfect)
  pace?: number;         // 0.0 to 1.0 (0.5 is the delivery type's standard pace)
  turn?: number;         // 0.0 to 1.0 (spin strength; ignored for pace deliveries)
  swing?: number;        // -1 to 1, left/right from the bowler's view
  overTheWicket?: boolean;
  bowlingArm?: 'Right' | 'Left';
  frontFootHeel?: number; // metres from the popping crease; non-negative is over the line
  batterPosition?: { x: number; z: number }; // metres from the starting stance at release
}

export type ShotType = 'defensive' | 'grounded' | 'lofted' | 'power';

export interface ShotChoice {
  direction: number;    // 0 to 7 (clock angle)
  type: ShotType;
  timing: number;       // 0.0 to 1.0 (0.5 is perfect)
  contactZone: number;
  footwork?: 'front_foot' | 'back_foot';  // 0.0 to 1.0 (0.5 is perfect sweet spot)
}

export interface BallOutcome {
  ballNumber: number;
  delivery: DeliveryChoice;
  shot: ShotChoice | null;
  missed?: boolean; // A shot was attempted, but did not contact the ball.
  distance: number;
  runs?: number; // Set when a hit has finished travelling.
  isWicket: boolean;
  wicketReason: string;
  isFreeHit: boolean;
  isExtra: boolean;
  extraType: 'wide' | 'noball' | null;
  ballTrajectory?: Vector3D[]; // Precomputed 3D path for rendering
}

export interface Innings {
  batter: Player;
  bowler: Player;
  balls: BallOutcome[];
  ballsBowled: number;
  wicketsLost: number;
  maxWickets: number; // Maximum dismissals in this innings (six, or one in sudden death)
  biggestSix: number;
  score: number;       // total runs (including +1 for extra balls)
  isNextFreeHit: boolean;
  finished: boolean;
}

export type CameraMode = 'bowler_eye' | 'batter_eye' | 'follow_shot' | 'shot_result' | 'stadium_wide';

export interface TieBreakDetails {
  deciderTier: 'biggest_six' | 'wickets' | 'runs' | 'six_count' | 'total_carry' | 'second_biggest_six' | 'sudden_death' | 'draw';
  tierLabel: string;
  description: string;
  marginText: string;
}

export interface MatchProgression {
  xpGained: number;
  baseXP: number;
  sixBonusXP: number;
  sixesCount: number;
  statUpgraded?: {
    statName: string;
    increase: number;
    newValue: number;
    reason: string;
  };
}

export interface MatchState {
  randomSeed?: number;
  events: MatchEvent[];
  player: Player;
  bot: Player;
  tossWinnerId: string;
  tossChoice: 'bat' | 'bowl';
  innings: Innings[];
  currentInningsIndex: number;
  status: 'toss' | 'match_setup' | 'playing' | 'completed';
  winnerId: string | null;
  tieBreakerActive: boolean;
  cameraMode: CameraMode;
  tieBreakDetails?: TieBreakDetails;
  progression?: MatchProgression;
}

export interface MatchEvent {
  sequence: number;
  type: 'delivery';
  inningsIndex: number;
  ballNumber: number;
  batterId: string;
  bowlerId: string;
  delivery: DeliveryChoice;
  shot: ShotChoice | null;
  missed: boolean;
  isWicket: boolean;
  wicketReason: string;
  isFreeHit: boolean;
  isExtra: boolean;
  extraType: 'wide' | 'noball' | null;
  distance: number;
  runs?: number;
  resolved: boolean;
  flight?: { hasBounced: boolean; reachedBoundary?: boolean };
  caughtBy?: string;
  fieldedRuns?: number;
  fieldPreset?: FieldPreset;
}

export interface InputIntent {
  aimX: number;          // For bowling: horizontal line coordinate (-1.5 to 1.5)
  aimZ: number;          // For bowling: length coordinate (4.0 to 19.5)
  aimDirection: number;  // For batting: radial direction (0 to 7)
  deliveryType: DeliveryType;
  shotType: ShotType;
  releaseTiming: number;
  swingTiming: number;
  footwork?: 'front_foot' | 'back_foot';
}

