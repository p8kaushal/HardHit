# HardHit 🏏

> **HardHit** is an immersive, physics-driven 3D single-over (6-ball) cricket duel game built on modern web standards with **Babylon.js**, **TypeScript**, and **Vite**.

Face off against intelligent AI bot tiers in a high-stakes, rapid-fire cricket encounter. Test your batting reflexes against swinging deliveries or hit your spots with the ball using precise timing, bowling variations, and strategic field play.

---

## 🎮 Key Features

- **Realistic 3D Stadium & Pitch**: Fully interactive 3D cricket arena rendered using Babylon.js with boundary ropes, pitch crease markings, and dynamic camera angles.
- **Physics-Driven Ball Trajectory**: Two-phase delivery simulation featuring trajectory aerodynamics, pitch bounce, friction drag, and realistic ball exit speeds.
- **Delivery Variations**:
  - `Fast` (Raw pace)
  - `In-swinger` (Curving in toward the stumps)
  - `Out-swinger` (Drifting away outside off)
  - `Off-cutter` (Sharp finger spin)
  - `Leg-cutter` (Sudden grip and turn)
- **Dynamic Batting Archetypes**:
  - `Defensive Block` (Safely deaden dangerous deliveries)
  - `Ground Drive` (High control, safe boundary chasing through the gaps)
  - `Lofted / Power Shot` (Risk-reward high-exit-angle stroke for maximums)
  - `Sweep / Cut` (Directional cross-bat strokes targeting square boundaries)
- **Precision Timing & Placement**: Real-time swing timing windows (Early, Perfect, Late, Missed) paired with directional shot placement controls.
- **Fielding AI & Stumps Physics**: Fielders track ball movement, calculate interception paths, and return throws to dislodge bails.
- **AI Difficulty Tiers**: Challenge **Rookie**, **Pro**, and **Master** AI bots with specialized bowling accuracy, shot selection algorithms, and aggression metrics.
- **Match State & Rules Engine**: Authentic 1-over cricket match lifecycle with 1-wicket forfeit rules, a 4-tier tie-break system (wickets lost &rarr; boundary count &rarr; dot balls bowled &rarr; spin), and persistent LocalStorage leaderboard tracking.

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
| **Bowling Delivery Selection** | `1`–`5` (`1`: Fast, `2`: In-swinger, `3`: Out-swinger, `4`: Off-cutter, `5`: Leg-cutter) |
| **Batting Shot Selection** | `1`–`4` (`1`: Defensive, `2`: Ground Drive, `3`: Lofted/Power, `4`: Sweep/Cut) |
| **Action Execution** | `Spacebar` (Stop bowling release point meter / Trigger bat swing timing) |
| **Shortcuts Modal** | Press `?` or click the HUD shortcuts button |

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
   Open your browser and navigate to `http://localhost:5173` (or the port displayed in your terminal).

---

## 📦 Available Scripts

- `npm run dev` &mdash; Starts the Vite local development server with hot module replacement (HMR).
- `npm run build` &mdash; Runs TypeScript compiler checks (`tsc`) and builds the production bundle into `/dist`.
- `npm run preview` &mdash; Locally previews the generated production build.

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
