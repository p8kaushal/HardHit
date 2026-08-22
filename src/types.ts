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

export interface PlayerStats {
  batting: BatterStats;
  bowling: BowlerStats;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  xp: number;
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Elite' | 'Legend';
  stats: PlayerStats;
}

export type LineType = 'off' | 'middle' | 'leg';
export type LengthType = 'bouncer' | 'short' | 'good' | 'full' | 'yorker';
export type DeliveryType = 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin';

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
}

export type ShotType = 'defensive' | 'grounded' | 'lofted' | 'power';

export interface ShotChoice {
  direction: number;    // 0 to 7 (clock angle)
  type: ShotType;
  timing: number;       // 0.0 to 1.0 (0.5 is perfect)
  contactZone: number;  // 0.0 to 1.0 (0.5 is perfect sweet spot)
}

export interface BallOutcome {
  ballNumber: number;
  delivery: DeliveryChoice;
  shot: ShotChoice | null;
  distance: number;
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
  wicketsLost: number;
  maxWickets: number; // MVP always 1
  biggestSix: number;
  score: number;       // total runs (including +1 for extra balls)
  isNextFreeHit: boolean;
  finished: boolean;
}

export type CameraMode = 'bowler_eye' | 'batter_eye' | 'follow_shot' | 'stadium_wide';

export interface MatchState {
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
}

export interface InputIntent {
  aimX: number;          // For bowling: horizontal line coordinate (-1.5 to 1.5)
  aimZ: number;          // For bowling: length coordinate (4.0 to 19.5)
  aimDirection: number;  // For batting: radial direction (0 to 7)
  deliveryType: DeliveryType;
  shotType: ShotType;
  releaseTiming: number;
  swingTiming: number;
}

