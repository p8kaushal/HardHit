# HardHit 🏏

> **HardHit** is an immersive, physics-driven 3D single-over (6-ball) cricket duel game built on modern web standards with **Babylon.js**, **TypeScript**, and **Vite**.

Play a biggest-six duel against a bot. Each batter faces six legal deliveries; the longest six wins, with wickets and further tie-breaks when needed. If neither batter hits a six and wickets are level, runs decide the winner. Real-player 1v1 is planned but is not yet implemented. See [CRICKET_RULES.md](CRICKET_RULES.md) for the modeled rules and limitations, [TODO.md](TODO.md) for open tasks and [DELIVERY_PLAN.md](DELIVERY_PLAN.md) for the delivery and verification plan.

The phased plan is approved for implementation. The current physics and umpiring are approximations, and physical-device validation remains open. Planned AI teammates will field automatically, with performance influenced by field settings and ratings related to the human all-rounder's performance.

Run `npm run test:browser` for headless Chromium lobby-to-gameplay, touch-control and first-delivery checks at 568×240, 667×300 and 1024×768, for both batting and bowling. It starts and stops its own local server and browser; it does not yet test a complete match or physical devices.

Run `npm run test:production` to build the app and run the same browser checks against the built production preview.

Run `npm run test:match` for a longer, seeded browser match: the player bowls first, then lets the bot bowl while batting, and the test checks both scorecards and return to the lobby. `npm run test:match:batting` also swings at batting prompts, `npm run test:match:bat-first` tests the other innings order, `npm run test:match:sixes` exercises lofted shots and verifies the six scorecard (a six is not guaranteed because browser timing varies), and `npm run test:rematch` checks a fresh rematch and toss. These scenarios do not cover all match outcomes or physical devices.

---

## 🎮 Key Features

- **3D Pitch**: A simple Babylon.js scene with boundary rope, crease markings, and camera angles for batting and bowling.
- **Ball Trajectory**: An approximated delivery path and fixed-step shot simulation with bounce, drag and turf friction.
- **Delivery Variations**:
  - `Fast` (Raw pace)
  - `Medium` and `Slow Ball`
  - `Off Spin` and `Leg Spin`
- **Dynamic Batting Archetypes**:
  - `Defensive Block` (Safely deaden dangerous deliveries)
  - `Ground Drive` (High control, safe boundary chasing through the gaps)
  - `Lofted / Power Shot` (Risk-reward high-exit-angle stroke for maximums)
- **Precision Timing & Placement**: Swing timing paired with directional shot placement controls.
- **Shot Timing Feedback**: After a player swings, a compact meter shows early, perfect or late timing and the offset on the game's timing scale.
- **Ball Flight and Boundary Scoring**: Watch the ball travel across the field; a shot that clears the boundary before bouncing scores six.
- **Ball Size**: Physics uses a 3.6 cm ball radius. The on-screen ball is enlarged for visibility on small screens.
- **Batter Position**: Before release, use the movement buttons or I/J/K/L to step forward, left, back or right. The stance locks during the delivery and affects contact timing and reach.
- **Bowling Side**: Select over or around the wicket before bowling. The selected side changes the release position and incoming angle.
- **Front-foot No-balls**: A simplified front-foot landing is sampled from bowler accuracy and pace separately from release timing. A no-ball reports the estimated overstep; the foot animation and calibration are still planned.
- **AI Difficulty Tiers**: Challenge Rookie, Medium and Hard bots.
- **Match State & Rules Engine**: Six legal balls per innings, biggest-six scoring, tie-breaks and a one-ball sudden death, plus a personal leaderboard stored in the browser.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Language** | [TypeScript](https://www.typescriptlang.org/) (ES Modules) |
| **3D Engine** | [Babylon.js](https://www.babylonjs.com/) 6.x |
| **Build Tooling & Bundler** | [Vite](https://vitejs.dev/) 5.x |
| **UI & Styling** | Modern CSS3 (Responsive HUD overlays, side docks, modal systems) |
| **Testing & Automation** | [Puppeteer](https://pptr.dev/) |

---

## 🕹️ Controls

| Action | Key / Control |
|---|---|
| **Aim / Placement** | `W`, `A`, `S`, `D` or `Arrow Keys` (Adjust pitch target marker or shot angle) |
| **Bowling Delivery Selection** | `1`–`5` (Fast, Medium, Slow Ball, Off Spin, Leg Spin) |
| **Batting Shot Selection** | `1`–`4` (Lofted, Power, Grounded, Defensive) |
| **Batting Footwork** | `Q` for front foot, `E` for back foot |
| **Action Execution** | `Spacebar` (Stop bowling release point meter / Trigger bat swing timing) |
| **Shortcuts Modal** | Press `H` or click the HUD shortcuts button |

On a phone, drag the left batting stick to aim, choose front or back foot, and tap a shot button with your other thumb as the ball arrives. The timing meter shows your actual swing timing: early means swing later next time, and late means swing earlier. Rookie and Medium difficulty make timing more forgiving when calculating the result. Front foot suits fuller balls; back foot suits short balls. Aim bowling deliveries on the pitch or the compact pitch map, choose a delivery type, adjust speed and swing for pace or turn for spin, then hold and release the delivery button in the green timing zone. Swing directions are shown from the bowler's view; releasing early or late also moves the bounce point away from the target.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed locally:
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` (v9+) or `pnpm` / `yarn`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/p8kaushal/HardHit.git
   cd HardHit
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:3000` (or the port displayed in your terminal).

---

## 📦 Available Scripts

- `npm run dev` &mdash; Starts the Vite local development server with hot module replacement (HMR).
- `npm run build` &mdash; Runs TypeScript compiler checks (`tsc`) and builds the production bundle into `/dist`.
- `npm test` &mdash; Runs the automated match-rule checks.
- `npm run preview` &mdash; Locally previews the generated production build.

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

Sound effects have their own licences and credits in [public/audio/CREDITS.txt](public/audio/CREDITS.txt).
