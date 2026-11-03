# Six Hitting Contest — Game & Build Plan

## 0. Status (read this first)
- **Current build**: a 3D single-player prototype against a bot, with batting, bowling, progression and a browser-local leaderboard. It is a work in progress; the original checklist below is a design guide rather than a verified completion report.
- **Direction**: a mobile-first biggest-six contest with a full six legal balls per batter. Real-player 1v1 is planned after the offline game and controls are ready.
- The formula constants below are design starting points; the implementation and playtesting determine the current behavior.

## 1. Concept summary
A mobile-first, cross-device multiplayer cricket game centered on a single duel format: **one over (6 balls), no fielders, no teams.** Two players each get a customizable all-rounder character with independent batting and bowling stats. Toss decides who bats first. Each ball's outcome (six distance, miss, wicket) is computed from batter stat vs bowler stat vs timing vs bat contact zone vs shot choice. Progression is FIFA-style (XP, training, rank tiers). Late-game unlock: player-created franchises (no license needed) and a story/career mode.

## 2. Design pillars
1. **Skill over randomness** — every ball's outcome must feel earned, not rolled. Stats set the *range*, player input decides the *result within that range*.
2. **10-second decisions, 60-second matches** — core loop must be finishable in a coffee-break.
3. **Full manual control, both innings** — this is the actual differentiator from Stick Cricket. Never auto-resolve a ball.
4. **One input model, many devices** — same underlying gesture (drag/aim + timed release) maps to touch, mouse, and keyboard/gamepad.
5. **Cosmetic and legal safety by design** — franchises, kits, logos, player likenesses are all original IP from day one, not reskinned real teams.

## 3. Core match structure
- **Toss**: coin-flip UI, winner picks bat or bowl first.
- **1 over = 6 legal balls.** No-balls/wides can exist as bowling mistakes (extra ball, free hit) to keep bowling meaningful rather than just "aim for six."
- **Innings 1**: Player A bowls to Player B (or vs AI ghost if async). Player B bats.
- **Innings 2**: Roles swap, same 6-ball structure.
- **Win condition (locked): Biggest single six, with wickets as risk/tie-break.**
  - **Primary metric**: the single largest six hit across a player's innings wins the match.
  - **Full-over innings**: each batter receives six legal deliveries. A dismissal counts as a wicket but does not forfeit the remaining deliveries.
  - **Bowler's win condition**: suppress the batter's biggest six through line, length, variation and release execution. Wickets remain a tie-break factor.
  - **Tie-break ladder**: biggest six, then fewer wickets. If neither batter hits a six and wickets are level, higher runs win; equal runs go to sudden death. When the biggest six is tied, compare the second-biggest six, then total distance, then sudden death.
  - This also gives you a natural highlight-reel share moment ("360m six!") and a clean leaderboard sort key (biggest six, wickets as secondary sort).

## 4. Bowling system
**Inputs (per ball):**
- Line: off / middle / leg (drag or lane select)
- Length: yorker / full / good-length / short / bouncer (vertical drag or power-hold)
- Pace or spin type: pace bowlers choose speed (slow/medium/fast); spin bowlers choose turn direction + amount
- Release timing: a timing bar/gesture the bowler must execute well (mirrors the batter's timing mechanic so bowling feels equally skill-based)

**Bowler stat block** (rank-up via training, FIFA-style):
- Pace, Swing/Seam, Spin, Accuracy, Stamina (affects late-over consistency), Variation (yorker/slower-ball execution)

**Output fed to hit-resolution formula**: effective difficulty = f(line/length choice vs batter's known weak zones, bowler Accuracy stat, how well bowler executed their own release-timing gesture).

## 5. Batting system
**Inputs (per ball):**
- Stance/aim direction (drag to aim shot zone, e.g. 8 directions on a clock face)
- Shot type: lofted / grounded / power / defensive (affects six probability vs risk of miscue)
- Timing: a timing gesture (tap/hold-release) synced to ball arrival — early/perfect/late, same primitive across devices
- Contact quality is derived from timing and the delivery's line; it is not a separate bat-face control.

**Batter stat block:**
- Power, Timing (widens the "perfect" window), Placement (shot accuracy toward aimed direction), Technique (reduces miscue chance vs good bowling), Stamina

## 6. Mathematical Formulas & Defaults
**Hit-distance formula:**
```
base_distance = Power_stat * shot_type_multiplier
timing_modifier = f(timing_accuracy)      // perfect > early/late, steep falloff
contact_modifier = f(bat_zone_hit)         // sweet spot = 1.0, edge = 0.3–0.6
bowling_resistance = f(bowler_Accuracy, line/length difficulty, bowler_Variation)
distance = base_distance * timing_modifier * contact_modifier - bowling_resistance
if distance < miscue_threshold -> WICKET: count the dismissal and continue the over
```

**MVP default constants:**
```
shot_type_multiplier: Defensive=0, Grounded=0.3, Lofted=0.85, Power Swing=1.1
timing_modifier:      perfect=1.0, good=0.8, early/late=0.5, poor=0.2
                       timing window (ms) = 150 + (Timing_stat * 2)   // wider window = more forgiving
contact_modifier:     sweet spot=1.0, good=0.7, edge=0.4
delivery_difficulty:  Yorker=0.8, Full=0.5, Good=0.4, Short=0.3, Bouncer=0.6  (line off/middle/leg = flat modifier, not a difficulty axis at MVP)
bowling_resistance    = ((Accuracy_stat + Variation_stat) / 2 / 100) * delivery_difficulty * 30   // scaled to meters
base_distance         = Power_stat * shot_type_multiplier    // Power 50, Power Swing → base_distance = 55
```

**Dismissal (wicket) risk model:**
```
shot_risk:    Defensive=0.02, Grounded=0.1, Lofted=0.35, Power Swing=0.6
ball_threat = (Accuracy_stat/100)*0.5 + (Variation_stat/100)*0.3 + delivery_difficulty   // delivery_difficulty from table, 0-1 scale
technique_resist = Technique_stat / 100
effective_risk    = shot_risk * ball_threat * (1 - technique_resist)
safe_window_ms    = 180 * (1 - effective_risk)   // base 180ms window, narrows as risk rises
-> WICKET if the player's timing deviation from perfect exceeds safe_window_ms / 2
```

## 7. Progression & meta (FIFA-inspired)
- **XP & Rank tiers** (Bronze → Silver → Gold → Elite → Legend) from match results.
- **Training mini-games**: separate small skill-games that convert performance into stat point allocation.
- **Stat caps & specialization**: player chooses to lean batting-heavy, bowling-heavy, or balanced.
- **Bot ladder as the pre-multiplayer competitive layer**: a tiered bot opponent that every player faces; each run's biggest six + wicket result posts to a global/friends leaderboard.

## 8. Scene, camera & control redesign (3D)
The original flat top-down 2D view + menu-button controls is deprecated and replaced with a lightweight 3D scene and gesture-based controls.

### 8.1 Scene
- Single simple 3D stadium: grass outfield, a properly textured/marked cricket pitch strip, low-poly stands, simple crowd (billboard sprites), floodlights, skybox.
- Two characters: bowler and batter, simple rigged low-poly models with a handful of key animations (run-up + release, stance + swing, idle, dismissal reaction).
- No fielders modeled.

### 8.2 Camera
- **Bowling phase**: camera positioned high behind the bowler's arm, looking down the pitch toward the batter ("bowler's-eye" angle).
- **Batting phase**: camera switches to a **batter's-eye / stump-cam** angle behind the batter, looking down the pitch toward the bowler.
- **On contact**: quick cut to a tracking shot following the ball's arc toward the boundary; slow-motion on six/wicket moments.

### 8.3 Ball visibility
- Full 3D ball with a visible trail/motion-blur effect in flight.
- Bounce point clearly visualized on the pitch during the bowling phase.

### 8.4 Bowling controls
- **Aim step**: drag a target marker onto a small pitch map (line + length in single gesture).
- **Type step**: pace/spin variation picker.
- **Delivery execution**: moving-marker timing meter player taps/releases to deliver the ball.

### 8.5 Batting controls
- **Aim + shot type combined**: 8-zone radial swipe dial (short swipe = grounded/defensive, long swipe = lofted/power).
- **Timing**: swipe-when-it-arrives input with a briefly highlighted "sweet spot" window.

### 8.6 HUD layout
- Score/state bar shrinks to slim corner overlays.
- Controls render as semi-transparent overlays anchored to the bottom.

### 8.7 Device control mapping
- **Touch**: drag-to-aim / swipe-to-hit, tap/hold-release on timing meters.
- **Mouse**: click-drag for aim, click/release for timing.
- **Keyboard**: arrow keys cycle aim zones, spacebar hold-release for timing.

## 9. Recommended tech stack
- **Client**: Babylon.js (3D layer) + HTML/CSS (UI layer overlay).
- **Netcode**: turn-based-over-websocket (discrete ball exchanges).
- **Backend**: Node.js/TypeScript service.
- **Persistence**: Postgres + Redis.

## 10. MVP scope
- **Single-player vs bot**, 1 over, toss, full bat+bowl control both innings.
- Simple 3D stadium/pitch scene with bowler's-eye/batter's-eye cameras, visible ball trail, slow-mo.
- Gesture-based bowling controls & batting controls with keyboard/mouse fallback.
- Biggest-single-six win condition with wickets as a tie-break and a full over per batter.
- 2–3 bot difficulty tiers.
- Global leaderboard (mock/local).

## 11. Future depth systems
- **Pitch as a variable**: flat, green, dry, dead.
- **Directional boundary size**: per-ground boundary map keyed by shot direction.

## 12. MVP defaults
- **Leaderboard scope**: global only, all-time, sorted by biggest six then fewest wickets lost.
- **Bot difficulty**: selectable dropdown (Easy / Medium / Hard). Easy ≈ 35, Medium ≈ 50, Hard ≈ 65.
- **Default control scheme**: swipe/drag gestures as default on touch.
- **Performance budget**: 60fps desktop, 30fps minimum mobile.

## 13. Antigravity model usage guide
- Gemini 3 Flash / latest Flash: default, boilerplate, repetitive structured work, unit tests.
- Gemini 3.1 Pro (Low): implementing full feature once design is spec'd.
- Gemini 3.1 Pro (High): formula/risk-window tuning, architecture-level decisions.

## 14. MVP build checklist (ordered, literal)
1. **New project scaffold** — TypeScript + Babylon.js client, separate HTML/CSS overlay layer for HUD.
2. **Static stadium + pitch scene** — low-poly stadium, textured pitch strip, skybox, floodlights, billboard crowd.
3. **Bowler & batter placeholder characters** — simple rigged models at the crease with idle animation.
4. **Camera system** — bowler's-eye and batter's-eye cameras with hard cut.
5. **Ball object + flight path** — parabolic path, visible trail, marked bounce point, placeholder line/length/pace.
6. **Bowling controls** — pitch-map drag-to-aim, type picker, timing-meter release gesture.
7. **Hit-resolution formula** — implement formulas from GDD Sections 5-6.
8. **Batting controls** — swipe-to-aim-and-shot-type, timing window, keyboard/mouse fallback.
9. **Contact + result animation** — bat-ball collision, ball flight arc tracking camera, slow-mo.
10. **HUD** — slim corner score/state overlay, bottom gesture-control overlays, brief result toast.
11. **Full over loop** — toss, 6 legal balls per batter, innings swap, win-condition + tie-break.
12. **Bot opponent** — bot bowling/batting decisions using GDD presets.
13. **Leaderboard** — score submission + read-only global leaderboard.
14. **Basic progression** — XP-to-rank tied to performance.
15. **Device input pass** — verify mouse/keyboard fallback controls.
