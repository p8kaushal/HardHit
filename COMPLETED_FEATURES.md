# Six Hitting Contest - 3D MVP Overview

A mobile-first, cross-device single-over cricket duel built from scratch using **TypeScript**, **Babylon.js**, and modern web standard components. 

---

## 1. Technical Architecture & Component Flow

The game is structured as a decoupled Single-Page Application (SPA):

```
                       ┌───────────────────────────────┐
                       │           HTML HUD            │
                       │ (Toss Screen, Scoreboard, etc)│
                       └───────────────┬───────────────┘
                                       │ Updates HUD overlays
                       ┌───────────────▼───────────────┐
                       │       BabylonJS Engine        │
                       │ (3D Stadium, Pitch, Cameras)  │
                       └───────────────▲───────────────┘
                                       │ Input Gestures (drag/swipe)
                       ┌───────────────┴───────────────┐
                       │      Gesture / Controls       │
                       │  (Aim target, Swipes, Space)  │
                       └───────────────┬───────────────┘
                                       │ Calculates outcome
                       ┌───────────────▼───────────────┐
                       │     Formula / Wicket Engine   │
                       │   (Physics, windows, carry)   │
                       └───────────────────────────────┘
```

---

## 2. Core Features

### 2.1 The 3D Environment & Camera Viewpoints
*   **Procedural Outfield & Pitch**: Procedurally built green grass boundary stadium (65m radius boundary rope), sand-textured pitch strip, and crease markers.
*   **Stumps**: Cylindrical wicket representation with dynamic collision targets.
*   **Cameras**:
    *   `bowler_eye`: Placed high behind the bowler's crease looking down the pitch. Exposes the full landing zone.
    *   `batter_eye` (Stump Cam): Positioned directly behind the batsman. The ball approaches the screen, providing depth cues for reactive swing timing.
    *   `follow_shot`: A dynamic orbital tracking camera that follows the ball's arc toward the boundary.
*   **Procedural Characters**: Includes bowler and batsman models with motion animations (bowler's run-up + arm release, and batsman's swing swing-through).
*   **Motion Trail**: Red leather ball with a visible yellow flight trail for tracking.

### 2.2 Interactive Controls
*   **Bowling Aim**: Pointer events on the canvas allow the player to drag a red target indicator anywhere on the pitch to set the `aimTarget` (X/Z coordinates).
*   **Bowling Release Meter**: Hold and release the Spacebar/touch button to capture accuracy timing. Perfect timing lands at `0.5`.
*   **Batting Swipes**: Swiping on the canvas dynamically captures:
    *   *Aim direction*: Swipe angle maps to 8 target slices on a clock radial dial.
    *   *Shot selection*: Fast, long swipes translate to Lofted/Power shots; slow, short swipes play Defensive/Grounded shots.
*   **Batting Timing**: Resolved dynamically based on the exact frame the swipe was performed relative to the ball reaching the crease.
*   **Keyboard Controls (KeyboardInputManager)**:
    *   *Aim (Both Phases)*: Cycle targets/radial zones using Arrow Keys or WASD. Numpad 1-8 selects direct radial clock directions.
    *   *Bowling Delivery Type*: Select using Keys 1-5 (Fast, Medium, Slow, Off-Spin, Leg-Spin).
    *   *Bowling Release Meter*: Hold Spacebar to start charging, release to pitch.
    *   *Batting Shot Type*: Select using Keys 1-4 (Lofted, Power, Grounded, Defensive).
    *   *Batting Swing*: Press Spacebar to execute swing timing.
    *   *Visual Keyboard Feedback*: Dynamic visual HUD overlay displaying currently selected inputs and key binds (e.g. `[BOWLING CONTROLS] Aim: Good Length`).

### 2.3 Physics & Wicket Risk Formulas
Default parameters ensure balanced risk-reward gameplay (Default Stats = 50):
*   **Wicket Risk model**:
    *   `effective_risk = shot_risk * ball_threat * (1 - technique_resistance)`
    *   `safe_window_ms = 180 * (1 - effective_risk)`
    *   If the swing timing deviation from perfect (`0.5`) exceeds the safe window, a Wicket is triggered (Clean Bowled, LBW, Caught, or Edged).
*   **Hit Distance model**:
    *   `distance = (base_distance * timing_modifier * contact_modifier) - bowling_resistance`
    *   *Miscue rule*: Power/Lofted shots carrying under 12 meters are resolved as caught in the infield.
*   **Extra Balls**: Bowling release timings `< 0.08` or `> 0.92` result in Wides or No-balls (awarding a Free Hit).

### 2.4 Opponent & Progression
*   **Bot Tiers & Dynamic Stat Scaling (`src/bot.ts`)**:
    *   *Aim Targeting & Variance*: Targets the pitch using Gaussian distribution. Aim variance decreases as the Bowler's Accuracy stat increases (`aim_variance = 0.65 - (Accuracy / 100) * 0.55`).
    *   *Timing & Contact Zone Variance*: Calculated dynamically from stats (`timingStdDev = 0.15 - (Timing / 100) * 0.13`), ensuring bots with higher stats execute cleaner timing.
*   **Rank Progression**: Experience points (XP) accumulated from wins/losses, unlocking Bronze, Silver, Gold, Elite, and Legend rank badges.
*   **Leaderboard**: Local Storage scores recording player personal bests.
*   **Formula Verification Helper (`src/formula.ts`)**: Exposes `verifyFormulas()` which runs isolated test executions of hit carrying distances and wicket risks, logging diagnostics in the console on start.
*   **Rules & Over Loop Enforcement (`src/game.ts`)**:
    *   *Single Wicket Forfeiture*: Strictly capped at 1 wicket. On dismissal, the innings ends instantly and remaining balls are forfeited.
    *   *Extra Balls*: Timing `<0.08` or `>0.92` issues a Wide/No-ball. Adds +1 penalty run to opponent, does not increment legal balls, and sets `isFreeHit = true` for the next delivery.
    *   *Free Hit Immunity*: On a Free Hit, all bowler-induced dismissals (wickets) are negated (batter is declared Not Out).
    *   *Full Tie-Break Hierarchy*: Automatically evaluates tie-break parameters in sequence: (1) biggest carry six, (2) fewest wickets lost, (3) higher total carry distance, (4) second-biggest six, and (5) sudden-death decider.
    *   *Console State Log Tracking*: Logs explicit transition tags (e.g. `[GAME EVENT]`) during match phases to ensure zero soft-locks and transparent debugging.

---

## 3. Project File Guide

- [package.json](file:///Users/parthkaushal/dev/proj/HardHit/package.json) - Node dependencies (adds `babylonjs` and `vite`).
- [index.html](file:///Users/parthkaushal/dev/proj/HardHit/index.html) - Main semantic layout, overlay HUDs, and the canvas.
- [src/types.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/types.ts) - Data types, 3D vectors, and CameraModes.
- [src/formula.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/formula.ts) - Carry distance, wicket risk, and extra ball calculators.
- [src/bot.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/bot.ts) - Bot AI bowler targeting and batsman reaction.
- [src/scene.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/scene.ts) - BabylonJS initialization, models, cameras, trails, and animations.
- [src/ui.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/ui.ts) - Swipes, release meters, mouse drags, and DOM updates.
- [src/game.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/game.ts) - Toss logic, innings transitions, XP rewards, and tie-breakers.
- [src/main.ts](file:///Users/parthkaushal/dev/proj/HardHit/src/main.ts) - Application bootstrap.
- [src/styles.css](file:///Users/parthkaushal/dev/proj/HardHit/src/styles.css) - Mobile-friendly styling for badges, grids, and aim dial.

---

## 4. How to Run

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3.  Open [http://localhost:3000](http://localhost:3000) in your browser.
