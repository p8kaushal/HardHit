# HardHit 🏏

> **HardHit** is an immersive, physics-driven 3D single-over (6-ball) cricket duel game built on modern web standards with **Babylon.js**, **TypeScript**, and **Vite**.

Play a biggest-six duel against a bot. Each batter faces six legal deliveries; the longest six wins, with wickets and further tie-breaks when needed. If neither batter hits a six and wickets are level, runs decide the winner. Real-player 1v1 is planned but is not yet implemented. See [CRICKET_RULES.md](CRICKET_RULES.md) for the modeled rules and limitations, [TODO.md](TODO.md) for open tasks and [DELIVERY_PLAN.md](DELIVERY_PLAN.md) for the delivery and verification plan.

[PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md) records the measurements, assumptions and open validation work behind the current approximations.

The phased plan is approved for implementation. The current physics and umpiring are approximations, and physical-device validation remains open. Planned AI teammates will field automatically, with performance influenced by field settings and ratings related to the human all-rounder's performance.

Run `npm run test:browser` for headless Chromium lobby-to-gameplay, touch-control and first-delivery checks at 568×240, 667×300 and 1024×768, for both batting and bowling. It starts and stops its own local server and browser; it does not yet test a complete match or physical devices.

Run `npm run test:production` to build the app and run the same browser checks against the built production preview.

Run `npm run test:match` for a longer, seeded browser match: the player bowls first, then lets the bot bowl while batting, and the test checks both scorecards and return to the lobby. `npm run test:match:batting` also swings at batting prompts, `npm run test:match:bat-first` tests the other innings order, `npm run test:match:sixes` exercises lofted shots and verifies the six scorecard (a six is not guaranteed because browser timing varies), and `npm run test:rematch` checks a fresh rematch and toss. These scenarios do not cover all match outcomes or physical devices.

`npm run test:match:sudden` uses a test-only tied-innings fixture to exercise both sudden-death innings and their one-legal-ball scorecards in the browser.

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

Choose **Cricket Playzone** in the lobby to practice without changing match results or player progression. Free movement supports I/J/K/L or the on-screen movement buttons and Space or the Swing button. In batting practice, select the delivery and shot, press Next ball, and swing as the ball arrives. Enable repeat for consecutive deliveries. Camera control is planned for a later stage.

In practice deliveries, use the left panel for delivery settings and the right panel for shot and footwork. Set direction with the selector, W/A/S/D or the touch aim stick; all three share the same aim. Under Display, enable the optional ball-follow camera or show and hide the detailed outcome. Run `npm run test:playzone` for the browser interaction checks.

Choose **Set delivery** to configure the ball yourself; off spin and leg spin expose a spin-strength slider. **Repeat selected delivery** repeats those settings. Choose **Simulated bowler** and a difficulty to face the same bot delivery selection used in matches, with balls bowled continuously. Difficulty changes apply to the next ball.

In free movement or batting practice, expand **Camera setup** and select **Start camera** to preview the device camera. Allow browser permission and stand back until your full body is visible. Select **Start pose tracking** to see landmarks and framing feedback; **Enlarge preview** makes the image bigger. Hold a comfortable stance and select **Calibrate movement**: this saves that stance as the reference for experimental character movement. Try the mirror option if needed, then recalibrate. A short interruption holds the last pose briefly; prolonged tracking loss, changing modes or stopping the camera resets calibration. Stop the camera using the same control; leaving practice, switching to bowling, or hiding the page also stops it. The preview requires HTTPS or localhost. This uses approximate body and depth estimates; it does not track the bat or play shots. Google documents on-device processing and possible MediaPipe Tasks performance metrics in its [privacy notice](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision#privacy-notice). Run `npm run test:camera-preview` for simulated-camera checks; real-camera movement and device performance remain unverified.

The character also moves visually when you move sideways or crouch relative to your calibrated position. **Approximate forward/back movement** optionally estimates distance from your apparent size; it can drift as you turn or bend. These visual movements do not change the batter's gameplay position. Keep your hips, knees and feet in view for leg tracking; the status message indicates when they are not clear. Tracked limb directions drive the character's arms and legs; a limb that stays out of view eases toward neutral. Body and joint movement remain approximations and do not yet capture every movement or the bat.

To calibrate without leaning over the computer, select **Calibrate in 5 seconds**, step back, and stand upright facing the camera. At the end of the countdown the camera must have a recent view of your head, shoulders, hips, ankles and feet. Select the button again to cancel. This helps capture the intended reference but does not guarantee posture accuracy.

While tracking, camera setup shows accepted pose results per second and average worker round-trip time over the last five seconds, plus session counts for delayed and interrupted results. A result without a detected person still counts as processed. Round-trip time runs from frame submission through image preparation and worker response; it excludes camera exposure and display delay, so it is not end-to-end input latency. Results over 500 ms old are rejected. Measurements stay in memory and reset when tracking stops.

Keep other people outside the camera view. The tracker now checks for up to two poses; when it detects more than one person it clears the landmarks, resets character movement and cancels pending calibration or hand-motion samples. Return to a single-person view and calibrate again. This checks detected ambiguity, not identity: it can miss another person or fail to recognize a person replacing the player. Processing a second pose can increase inference cost; real-device performance remains unmeasured.

During pose tracking the character's bat is hidden. Stand upright and face the camera when calibrating: this establishes the reference for body direction and back bend. Shoulder depth is used to estimate turns, torso movement drives the spine and chest, and visible ear landmarks can contribute a separate approximate head turn. The skinned character also estimates hand and foot direction from wrist-to-index and ankle-to-toe landmarks; this is not finger tracking. The single-camera estimate can be inaccurate or ambiguous when side-on, facing away, or obscured. Enable **Show character joints (X-ray)** to see the character's joints and bone links through its body: green marks a visible corresponding camera landmark, while amber means uncertain or not currently tracked. The bat returns when tracking stops; tracking a physical bat is future work.

For an experimental movement check, enable **Preview two-hand movement** while pose tracking is active. Keep both hands close together and still until it says **Ready**, then move them together and stop. It reports movement duration, peak hand speed relative to your apparent torso length, and the direction of the furthest movement in the mirrored camera image. That direction is not a cricket-field shot direction. During a practice delivery it can also compare the estimated hand-speed peak with the modeled ball-contact time. This is not bat-contact timing: it does not detect a bat or register a shot, and its thresholds and latency have not been calibrated against real swings. Tracking loss or changing practice mode resets the preview.

Optionally, use **Record gentler** and **Record stronger** to compare later detected hand movements with those two samples. Start each sample with your hands still; even the gentler one must be fast enough for the preview to detect. The stronger sample must be clearly faster. The displayed percentage is a bounded relative hand-motion comparison, not bat speed or shot power. Samples stay in memory while tracking continues, survive a switch between batting modes, and are cleared when tracking or the preview stops.

For local regression testing with recorded movement, provide a pre-cropped, unmirrored camera-view WebM: `HARDHIT_POSE_REPLAY=/path/to/clip.webm node scripts/browser-pose-replay.mjs`. Optionally set `HARDHIT_POSE_REPLAY_SEEK` to a time in seconds where shoulders and hips are visible for calibration. The check feeds the clip to the real pose worker, checks rendered joints, confident limb directions against pose-model targets, and practice isolation, then prints aggregate results; it does not add the recording to the repository. Agreement with pose-model targets is not proof of real-world accuracy. A screen recording of an already-overlaid preview is not ground truth for tracking accuracy.

Replay results include checks per limb segment, including segments with zero coverage. To require coverage, set `HARDHIT_POSE_REPLAY_REQUIRE` to comma-separated segment names, for example `leftAnkle,rightAnkle`; each requires at least 20 confident rendered samples. These samples can include multiple renders of the same camera frame and do not establish movement accuracy.

For an independent image-point check, supply a local clip and manually annotated reference JSON to `npm run test:pose-reference`. See [CAMERA_BATTING.md](CAMERA_BATTING.md) for the schema, evidence limits and remaining camera-batting stages. The check rejects missing/uncertain annotations and errors over the explicitly supplied pixel tolerance; it does not validate 3D motion or a physical bat.

Choose **Bowling practice** to bowl at a bot batter. Aim using the line and length selectors or the pitch map on the left, or tap and drag the 3D pitch. Set delivery type, pace, swing or spin and bowling side on the right. Expand **Bot batter** to choose its shot style, difficulty and batting hand, or **Display** for camera and outcome options. Hold Space or the bowling button and release when the meter reaches the green zone. Practice continues beyond an over and does not update your match record or leaderboard. Run `npm run test:bowling-playzone` for the browser checks.

The batter uses a low-poly skinned humanoid with an articulated skeleton. The CC0 source and attribution details are in [public/models/NOTICE.txt](public/models/NOTICE.txt). Two-hand bat constraints are not implemented yet.

| Action | Key / Control |
|---|---|
| **Aim / Placement** | `W`, `A`, `S`, `D` or `Arrow Keys` (Adjust pitch target marker or shot angle) |
| **Bowling Delivery Selection** | `1`–`5` (Fast, Medium, Slow Ball, Off Spin, Leg Spin) |
| **Batting Shot Selection** | `1`–`4` (Lofted, Power, Grounded, Defensive) |
| **Batting Footwork** | `Q` for front foot, `E` for back foot |
| **Action Execution** | `Spacebar` (hold/release bowling meter or trigger a bat swing); focused action buttons also accept `Enter` |
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
