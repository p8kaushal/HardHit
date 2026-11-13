# HardHit feature inventory and testing guide

Feature-level source audit and fresh automated verification on November 12, 2026. Baseline: `928a389` on `feature/camera-batting`. The pre-existing `.gitignore` change is excluded. Automated browser checks use headless Chromium with emulated viewports, not physical devices. Passing tests do not establish cricket realism or camera accuracy.

**Current-state note, November 13:** this is the historical audit at `928a389`, not a new audit of later commits. Subsequent calibration, camera geometry, reference tooling and bat segmentation research are recorded in `plan.md` and `CAMERA_BATTING.md`. The audit document and `.gitignore` change were committed in `0a74dc8`. The latest full unit run recorded in the plan passed 134 tests; individual later increments have their own verification and limitations. The strict six-producing match and real-device camera fidelity remain open.

## Implemented features

| Area | Built behavior | How to try it |
| --- | --- | --- |
| Offline contest | Human versus Rookie/Medium/Hard bot; toss, both innings, six legal balls each, biggest-six result, tie-breaks, sudden death, summary, rematch and lobby | Start a match; finish batting and bowling; inspect both scorecards and result; rematch |
| Batting | Four shot types, eight directions, front/back foot, stance movement before release, timing feedback and difficulty assistance | Select shots 1–4, Q/E footwork, W/A/S/D or arrows for aim, I/J/K/L for stance; press Space as the ball arrives |
| Bowling | Fast/medium/slow/off-spin/leg-spin, line/length target, pace/swing/spin, over/around wicket and both arms | Hold/release Space or bowling button; change type with 1–5; compare aim marker and ball |
| Decisions | Wides, sampled front-foot no-balls, free-hit chains, simplified bowled/LBW, rope/bounce boundary scoring | Use practice to explore deliveries; run unit cases for precise extras/wicket combinations |
| Ball simulation | Shared authored incoming trajectory, bounce and movement, contact timing/reach, fixed-step outgoing flight, drag, friction and boundary crossing | Compare pace/spin and grounded/lofted shots; use follow-ball and outcomes in practice |
| Character | Skinned humanoid with articulated fallback, handedness, shot animations, directional pose retargeting | Compare RHB/LHB and shot previews; camera steps below |
| Batting playzone | Free movement and unlimited deliveries; configurable or simulated bowler; repeat delivery; strength, direction, footwork and feedback | Lobby → Cricket Playzone → free movement or batting practice |
| Bowling practice | Unlimited deliveries at configurable bot batter; pitch map/3D aim, type/pace/spin/side settings, bot hand/style/difficulty | Cricket Playzone → Bowling practice; configure, hold/release bowl |
| Presentation | Batting/bowling views, optional practice ball-follow and detailed outcomes, responsive controls, shortcut help, sound and mute preference | Toggle Display controls; press H; check mute and reload |
| Progression | Local player profile, XP/rank/statistics and browser leaderboard; practice isolation and duplicate-summary guard | Finish a match, inspect profile/leaderboard, reload; compare practice sessions |
| Interruption handling | Pause-aware game clock; held input cancellation; delivery generations and stale callback protection; rotation/focus safeguards | Rotate or background during a bowling hold and delivery; resume and check score/control state |
| Camera capture | Explicit camera start/stop, permission/error feedback, cleanup on exit/mode/page hide | Camera setup → Start camera; stop, switch to bowling, hide tab or leave practice |
| Pose preview | Local worker/model, mirrored overlay, framing feedback, rate/round-trip/rejection statistics | Start pose tracking with one full-body person visible |
| Camera body movement | Immediate and five-second calibration with a visible torso, approximate limbs/head/torso/turns, visual offsets, optional apparent-size depth, X-ray confidence, brief-loss hold and stale/multi-pose rejection | Use delayed calibration upright facing camera; show the full body for leg tracking; move limbs/turn/bend; toggle X-ray/mirror/depth |
| Hand diagnostics | Opt-in two-wrist motion event, image direction, relative speed/intensity samples, estimated timing against practice delivery | Enable Preview two-hand movement; hold still to Ready, move hands together and stop; record gentler/stronger samples |
| Reference tools | Recorded pose replay, local body landmark annotation and scoring, local four-point bat annotation with occlusion, endpoint prediction scorer | See commands below and CAMERA_BATTING.md |
| Bat-hand geometry | Pure confidence/distance association primitive with synthetic tests | `src/bat-hand-association.ts`; no in-game control is connected |

## Not complete or not physically validated

- Actual bat detection, reliable handle/toe/face/depth measurement and two-hand rig constraints are absent. The character's bat is hidden during pose tracking.
- Camera input does not select or execute shots in practice or matches. Hand-motion diagnostics do not establish bat speed, physical power, contact timing or field direction.
- Body fidelity, side-on/occluded movement, neutral posture, real device frame rate and capture-to-display latency require live review. Replays checking rig/model agreement are not independent ground truth.
- Evaluated generic/cricket detectors and local keypoint/tracking prototypes were inadequate. Experimental weights and footage remain outside the repo; none is a selected runtime detector.
- Contact is timing/reach based; spatial bat/ball collision is absent. Wicket/LBW, non-boundary runs, distance caps and pitch calibration remain simplified.
- Real-player multiplayer, authoritative server, full AI fielding/running/team progression, deployment/CI/monitoring and physical phone/tablet acceptance remain planned.
- The production build reports large chunks (Babylon and vision runtime). This audit does not measure mobile loading, memory or thermals.

## Start the application

```sh
npm install
npm run dev
```

Open the printed localhost URL. Camera capture requires localhost or HTTPS and browser camera permission. Use landscape orientation on phones/tablets. The install command is reproduction guidance; a fresh dependency install is not claimed in this audit.

## Manual acceptance checklist

1. Match: choose each difficulty, complete both innings, inspect legal ball counts/extras/summary, return to lobby and rematch. Reload and check profile/leaderboard persistence.
2. Batting: compare all four shots and directions, early/perfect/late feedback, Q/E footwork, and pre-release stance lock. Check keyboard and on-screen controls.
3. Bowling: compare all five types, over/around wicket, arm/hand symmetry and pace/spin settings. Hold and release at different meter positions.
4. Practice: use all three modes, repeat/simulated bowler, pitch map/3D aim, bot hand/style, follow-ball and outcome options. Confirm practice does not alter match progression.
5. Interruptions: background/return, change orientation while holding bowl, cancel pointer, and leave/rematch during flight. Confirm no extra recorded ball, stuck action or duplicated result.
6. Camera: start/stop and deny permission; verify useful errors and cleanup. Start pose tracking with only you visible and the whole body framed. Use Calibrate in 5 seconds, step back and stand upright facing the camera.
7. Movement: inspect neutral posture/facing, left/right turns, bending, arms/knees/feet, head turns, mirror/depth and X-ray confidence. Briefly cover a limb/torso; test recovery. Bring another person into view and verify reset/recalibration.
8. Hand preview: enable it, hold both hands still until Ready, move together and stop. Test gentle/strong samples and a practice delivery timing comparison. Confirm no shot or score is registered automatically.
9. Exit camera practice, switch to bowling, and hide the page; confirm the camera indicator turns off. Test on real desktop, Android and iOS devices separately.

## Automated commands and scope

| Command | Scope |
| --- | --- |
| `npm test` | Game/rule/physics/input/pose/hand/reference unit cases |
| `npm run build` | TypeScript checks and production bundling |
| `npm run test:browser` | Development lobby/gameplay controls and first delivery across three emulated landscape sizes |
| `node scripts/browser-smoke.mjs --preview` | Same smoke on existing production build |
| `npm run test:playzone` | Batting playzone interactions and isolation |
| `npm run test:bowling-playzone` | Bowling practice controls, delivery and isolation |
| `npm run test:camera-preview` | Simulated camera/worker lifecycle and synthetic pose/hand checks |
| `npm run test:match:batting` | Seeded full match with bowling first and registered batting swings |
| `npm run test:match:bat-first` | Seeded full match in reverse innings order |
| `npm run test:match:sudden` | Forced tied-innings fixture and sudden-death flow |
| `npm run test:rematch` | Seeded match and fresh rematch/toss |
| `npm run test:match:sixes` | Lofted-shot scenario; a six is timing-dependent and is not guaranteed |

Run browser commands sequentially; each manages its local browser/server. Browser tools may require permission to bind a local server in a sandbox.

For real pose inference on a local person-image fixture, set `HARDHIT_POSE_FIXTURE=/absolute/path/person.jpg` when running the camera script. Without it, the blank-camera case is tested.

For recorded motion:

```sh
HARDHIT_POSE_REPLAY=/path/to/unmirrored-cropped.webm node scripts/browser-pose-replay.mjs
HARDHIT_POSE_REPLAY=/path/to/clip.webm HARDHIT_POSE_REFERENCE=/path/to/manual.json npm run test:pose-reference
npm run score:bat-reference -- /path/to/reference.json /path/to/predictions.json 10
```

Open `scripts/bat-annotator.html` through the development server to annotate a local clip. Mark occluded points explicitly; do not invent coordinates. See CAMERA_BATTING.md for schemas, timing limitations and research evidence.

## Code-review findings

1. **Bat annotation duplicate-frame export: fixed after the audit.** Saving a frame again now replaces the earlier annotation and keeps frames ordered. A browser regression saved frames 0 and 5, replaced frame 0, and validated the exported reference. Variable-frame-rate accuracy remains open.
2. **The lofted match command can pass with zero sixes.** The harness checks consistency unless explicitly invoked with `--require-six`. A passing ordinary lofted scenario is not evidence that an actual six occurred.
3. **Full-match tests are seeded samples.** They do not cover every difficulty, dismissal, tie-break, free-hit chain or interruption. Unit tests supply additional modeled cases; physical gameplay remains unmeasured.
4. **Camera tests use simulated media and synthetic poses.** They verify lifecycle and implemented transformations, not actual full-body/bat fidelity or end-to-end latency.

## Current audit results

- Unit tests: 132 passed, 0 failed.
- Production build: passed; large-chunk warning remains.
- Development and production smoke: passed at 568×240, 667×300 and 1024×768 for batting and bowling controls/first deliveries.
- Batting playzone and bowling practice browser regressions: passed.
- Development simulated-camera lifecycle/pose/hand regression: passed.
- Full interactive matches in both innings orders: passed, including scorecards and lobby return.
- Forced sudden death: passed, one legal delivery per player in the extra innings.
- Rematch: passed, including fresh toss/gameplay entry.
- Production real person-image pose fixture: passed using the actual worker/model.
- Recorded full-body replay from 12 s: passed; 69 processed frames included 25 single-person and 44 ambiguous frames; 1,290 confident rendered/model direction comparisons had zero mismatches and practice remained 0 runs/0 wickets/0 balls. These comparisons are model/rig consistency, not physical ground truth.
- Annotated-pose synthetic smoke: 3/3 points compared and passed the intentionally loose 1,000-pixel tolerance; the 0.000001-pixel negative fixture correctly failed with 3/3 outside tolerance.
- Bat prediction scoring CLI: synthetic one-frame/four-point exact-match smoke passed.
- Bat annotator: 120 fps adjacent-frame/export browser check passed; duplicate-frame export defect reproduced.
- **Strict six match: failed.** `node scripts/browser-match.mjs --bat-first --swing --loft --require-six` completed the match but scored zero sixes and exited 1. The audit therefore does not confirm an actual six through the browser match flow. Unit coverage and normal full-match passes do not override this failed gate.
- Fresh install, real camera/device fidelity, spatial collision realism and multiplayer are not verified by these checks.

## Code map

- `src/main.ts`, `src/ui.ts`, `index.html`, `src/styles.css`: screens, toss/lobby/profile/summary, match controls and responsive presentation.
- `src/game.ts`, `src/types.ts`, `src/leaderboard.ts`: match lifecycle, result/progression, typed choices/outcomes and local persistence.
- `src/formula.ts`, `src/ball-physics.ts`, `src/batting-resolution.ts`, `src/batting-timing.ts`, `src/batter-position.ts`: modeled deliveries, contact/scoring, flight, timing assistance and stance.
- `src/scene.ts`, `src/batter-rig.ts`, `src/camera-director.ts`, `src/sound.ts`: 3D scene/character, shot cameras and sound.
- `src/input.ts`, `src/touch-controls.ts`, `src/bowling-controls.ts`, `src/game-clock.ts`: keyboard/touch controls, parameter visibility and pause-aware timing.
- `src/playzone.ts`, `src/bot.ts`, `src/simulate.ts`: practice/session isolation, bot choices and development simulation.
- `src/camera-preview.ts`, `src/pose-preview.ts`, `src/pose-worker.ts`, `src/pose-retarget.ts`, `src/pose-performance.ts`: camera ownership, pose inference, retargeting, lifecycle and performance feedback.
- `src/hand-motion.ts`, `src/hand-motion-timing.ts`, `src/hand-motion-intensity.ts`, `src/bat-hand-association.ts`: experimental diagnostics and unconnected bat/hand geometry.
- `scripts/`, `tests/`: browser regressions, unit tests, reference annotation/scoring/replay tools. No lint command is configured.
- `public/models/NOTICE.txt`, `public/models/pose/NOTICE.txt`, `public/audio/`: asset attribution and local model/audio resources.
- `CRICKET_RULES.md`, `PHYSICS_CALIBRATION.md`, `CAMERA_BATTING.md`, `DELIVERY_PLAN.md`, `TODO.md`: modeled rules, evidence, assumptions and unfinished acceptance gates.

## Audit limits

This is an implementation/feature inventory, source review of the principal game, simulation, persistence, camera and tooling paths, and execution of the automated scenarios listed above. It is not an exhaustive proof of every branch or a security/penetration audit. Browser tests use seeded randomness and emulation. Sound quality, real touch/multi-finger behavior, iOS/Android permissions/thermals, actual camera posture/latency, and physics calibration require human/device testing. No product source was changed during this audit; this guide records the existing behavior and findings.
