# Gameplay to-do

## Recover from brief torso occlusion

- [x] Hold the last calibrated pose briefly when a required torso landmark disappears, and visibly mark tracking as uncertain.
- [x] Resume automatically when tracking returns; reset safely after prolonged loss or other interruptions.
- [x] Verify loss, recovery, X-ray confidence, lifecycle and practice isolation, then commit the stage.
- [ ] Validate the hold duration and recovery feel with a live camera.

## Consistent landmark coordinates during partial tracking

- [x] Calculate each body angle in one coordinate space when 3D landmarks are incomplete or invalid.
- [x] Verify partial depth loss, mirrored poses and recovery, then commit the tested change.
- [ ] Validate transitions between 2D and 3D estimates on live camera footage; the coordinate systems can still disagree.

## Recorded replay coverage

- [x] Report direction checks and mismatches separately for every limb segment, including zero-coverage segments.
- [x] Allow an explicit replay coverage requirement and verify both passing and failing coverage checks.

## Recorded-motion limb alignment checks

- [x] Measure rendered limb directions against confident pose-model targets throughout the local replay, including hand and foot endpoints when visible.
- [x] Verify repeated playback, non-finite handling, cleanup and practice isolation; report coverage without treating pose-model output as ground truth.
- [ ] Repeat with independently annotated full-body footage; the current recorded preview contains no usable foot frames.

## Camera movement: hands, feet and X-ray confidence

- [x] Extend the skinned character's movement replication to approximate hand and foot direction using visible pose landmarks; hold briefly and safely fall back when those landmarks are missing.
- [x] Make the X-ray distinguish model joints backed by visible camera landmarks from uncertain ones, with a clear legend and fallback behavior.
- [x] Verify mirrored hands and feet, occlusion and recovery, X-ray accuracy and ordinary practice/match behavior with simulated and available recorded input.
- [x] Document limitations and keep physical-bat/shot inference separate until validated.
- [ ] Validate hand/foot orientations and occlusion transitions on live cameras with the whole body visible; detailed fingers and palm roll are not tracked.

## Recorded camera-motion replay

- [x] Add an explicit local replay check for a user-supplied, pre-cropped camera clip without adding recordings or pose data to the repository.
- [x] Exercise the real pose worker, calibrated rig and X-ray over changing video frames; verify finite output, camera cleanup and practice isolation.
- [x] Record the replay scope and limitations, including that a screen-recorded preview is not a ground-truth motion fixture.
- [ ] Validate against independently annotated full-body camera footage when available, including feet, side-on movement and timing.

## Camera movement: independent head turning

- [x] Estimate head turn relative to the shoulders when both ear landmarks are usable, with mirrored mapping and safe fallback on occlusion.
- [x] Verify head-only turns, whole-body turns, mirroring, landmark loss and rendered rig response without claiming eye or gaze tracking.
- [ ] Validate head-turn direction and stability with real camera motion; side-on ears and gaze remain uncertain.

## Hand-motion intensity calibration preview

- [x] Add an opt-in, session-only calibration using explicitly recorded gentler and stronger hand movements.
- [x] Show a bounded relative intensity for later movements without treating it as bat speed, shot power or gameplay input.
- [x] Verify invalid samples, retries, resets, mode changes and scoring isolation with unit and browser tests; document real-camera limitations.
- [ ] Validate repeatability, thresholds and perceived intensity with real recorded movements and devices before considering any use for gameplay.

## Hand-motion direction preview

- [x] Report the approximate hand-motion direction in the mirrored camera image, clearly separate from a cricket shot direction.
- [x] Detect a movement that follows through and returns, while retaining timing, confidence checks and score isolation.
- [x] Verify mirrored direction, returning motion, false starts, lifecycle and practice regressions; document real-camera limitations.
- [ ] Validate camera-view direction and false positives against real swings before considering any mapping to cricket-field shot direction.

## Practice hand-motion timing preview

- [x] Compare a timestamped hand-speed peak to the modeled contact time for the same practice delivery, without recording a shot or changing scores.
- [x] Invalidate stale frames and movement across pause, mode changes, cancellation and subsequent deliveries; label the estimate and its limitations.
- [x] Test early/late comparisons, capture-to-game clock mapping, pauses, stale events and practice isolation with unit and browser checks.
- [ ] Measure real camera/frame latency and validate timing against independently observed swings and contact before using it for gameplay.

## Experimental hand-motion preview

- [x] Add an opt-in practice preview for fast two-hand movement using timestamped pose frames, with stationary arming and safe reset on tracking loss.
- [x] Show measured movement duration and relative peak speed without registering shots, changing scores or claiming to detect the bat.
- [x] Verify stillness, synthetic movement, false starts, dropped frames, lifecycle and practice isolation; document the live-camera limitations.
- [ ] Validate and calibrate detection thresholds, false positives, delay and movement quality against real recorded swings and different camera placements before using the result for gameplay.

## Correct limb retargeting from second recording

- [x] Correct the mismatch between tracked limb directions and the model's pre-bent bind pose, without relying on unseen leg landmarks.
- [x] Use the joint X-ray and simulated tracked poses to verify the actual character's arm and leg directions and lifecycle.
- [x] Document the framing and live-camera limitations shown in the recording.
- [ ] Check real-camera fidelity, mirrored direction, foot contact and movement quality with the user; the recording does not show the full legs.

## Camera turning, posture and joint X-ray

- [x] Improve continuous left/right body turning and reproduce changes in back bend from the tracked torso.
- [x] Add an optional in-game X-ray showing the character's actual joints and bones, including fallback and cleanup.
- [x] Exercise the X-ray view while verifying turn direction, bending, mirror behavior and tracking lifecycle; document live-camera limitations.
- [ ] Verify turn accuracy, upright calibration and bending with the user's live camera; single-camera depth and occlusion remain approximate.

## Fix camera-facing alignment from recording

- [x] Reproduce the reported facing error with a frame from the recording and correct the visible character's bowler-facing alignment.
- [x] Verify the settled model alignment and turn behavior, including the recorded frame; document remaining live-camera limits.
- [ ] Confirm the correction with the user's live camera; full-body framing and realistic posture remain open.

## Camera-facing body orientation

- [x] Hide the character's bat during camera-driven movement and restore it when tracking ends.
- [x] Map camera-facing body orientation to the bowler end, estimate turns from tracked shoulders, and keep scoring positions unchanged.
- [x] Verify facing, mirror behavior, missing landmarks and bat lifecycle with simulated landmarks; document the limits of single-camera orientation.
- [ ] Verify and refine facing and turn direction with the user's live camera, including side-on and turned-away poses.

## Camera tracking responsiveness and depth

- [x] Reduce brief single-limb tracking dropouts and improve movement response without letting stale joints remain indefinitely.
- [x] Add an optional, bounded visual approximation for moving toward or away from the camera; keep gameplay position unchanged.
- [x] Verify depth, limb dropout recovery and practice lifecycle with simulated input; document live-camera limits.
- [ ] Review responsiveness, depth drift and left/right movement on the user's live camera.

## Camera whole-body movement revision

- [x] Improve leg and body response, use the working mirrored mapping by default, and explain framing and tracking state.
- [x] Verify leg bends, movement, occlusion and resets in unit and browser tests; distinguish visible motion from match physics.
- [ ] Review movement fidelity with the user's live camera.

## Improve camera movement and calibration

- [x] Make calibration feedback clear and available in both batting practice modes, including incomplete framing.
- [x] Expand retargeting to use 3D pose estimates and tolerate individual occluded joints, while keeping manual shot scoring and safe fallback.
- [x] Verify calibration, synthetic body movement, occlusion and practice lifecycle; document real-camera limitations.
- [ ] Verify and refine actual movement fidelity with the user's camera. Full body translation, precise rotations, hands, bat tracking and shot inference remain unimplemented.

## Camera batting — stage 8 calibrated pose preview

- [x] Add an accessible larger camera preview option.
- [x] Add opt-in, calibrated landmark-to-rig movement in free movement, with confidence handling, mirror control and a safe reset; keep shot decisions unchanged.
- [x] Verify calibration, motion, loss of tracking and cleanup with automated fixtures; document limitations and testing instructions.
- [ ] Review the movement with a live camera, including side-on stances, occlusion, handedness, latency and movement quality; refine 3D retargeting and bat constraints separately.

## Pose tracker startup failure

- [x] Add diagnostics for worker startup and inference errors; exercise startup and recovery in browser tests.
- [ ] Investigate the original startup failure if it recurs. The user reports tracking now works, but the original cause was not identified.

## Desktop portrait play

- [x] Restrict the landscape prompt and orientation pause to devices with a coarse primary pointer; keep background-tab pausing for all devices.
- [x] Verify portrait desktop play and portrait-to-landscape touch behavior in the browser; physical devices remain untested.

## Camera batting — stage 7 pose tracking preview

- [x] Integrate MediaPipe Pose Landmarker Lite and a landmark overlay for the opt-in camera preview.
- [x] Run inference in a worker, handle camera/model lifecycle and disclose the dependency's documented metrics behavior.
- [x] Verify model initialization, blank-frame and person-image detection, lifecycle, failure paths and practice regressions with simulated video.
- [x] Present stage 7 for review and obtain approval before starting the next implementation stage.
- [ ] Validate pose tracking, performance, permissions and framing on real cameras and physical devices when available; the user currently cannot test.
- [x] Update the README's camera section to describe the pose preview and its limitations.

## Camera batting — stage 6 camera setup

- [x] Add opt-in camera preview to batting practice with clear permission and device errors.
- [x] Stop camera tracks on exit, bowling mode, hidden page and stale permission requests.
- [x] Verify lifecycle and regressions; document manual testing and present this stage for review.

## Next stage: bot delivery contact alignment

- [x] Align the rendered bowling delivery and bot swing trigger with the modeled batter contact point.
- [x] Verify pace and spin, low-frame-rate triggering, practice and match behavior; document limitations and testing.

## Bowling practice layout and regression audit

- [x] Split bowling setup across both sides, with accessible collapsible secondary settings and no scrolling for essential controls at tested landscape sizes.
- [x] Run the configured unit, production, practice and match checks; record remaining limitations and manual testing instructions.

## Bowling playzone

- [x] Add bowling practice with delivery controls and configurable bot batting style, difficulty and handedness.
- [x] Reuse match bowling timing, ball flight and batting decisions without changing match progression.
- [x] Verify bowling, bot configuration, cancellation and responsive controls; document how to test.

## Practice spin and simulated bowling

- [x] Add a visible spin-strength control for manual spin deliveries.
- [x] Add a separate simulated bowler with difficulty, while keeping manual auto bowl a repeat of the chosen delivery.
- [x] Verify mode switching, delivery parameters, difficulty and practice controls.

## Practice shot selection styling

- [x] Show the selected practice shot consistently across touch, keyboard and the selector, using the game's batting palette.
- [x] Verify selection feedback in desktop and touch practice.

## Practice controls and direction

- [x] Split practice delivery and batting controls across both sides of the pitch.
- [x] Synchronize direction selection across touch, keyboard and menus, and verify the resulting ball flight.
- [x] Exercise practice controls and responsive layouts; document testing.

## Playzone orientation and usability

- [x] Correct batter facing and make shot type, direction and footwork visible in free practice.
- [x] Redesign free and delivery practice controls for desktop and landscape touch.
- [x] Verify character orientation, shot variations, controls, delivery flow and layouts.

## Camera batting — stage 1 baseline

- [x] Trace and document the current match, pause, delivery, scoring and innings lifecycles and future integration points.
- [x] Run unit tests, production build, browser smoke and existing match checks; record results and limitations in `plan.md`.
- [x] Present the baseline for review before starting the next stage.

## Camera batting — stage 2 shared batting behavior

- [x] Extract reusable delivery and shot adjudication without match-state mutation.
- [x] Keep score, innings and flight finalization behavior compatible with existing matches.
- [x] Test isolated resolution and match compatibility; run the build and relevant browser checks.
- [x] Document how to test this stage and present it for review.

## Camera batting — stage 3 articulated batter

- [x] Build a procedural joint hierarchy with fixed limb segments, constrained pose controls and a bat attached to the hand.
- [x] Connect existing player and bot swing animations and handedness to the rig.
- [x] Verify rig geometry, pose limits and existing gameplay; provide manual testing instructions.
- [x] Present this stage for review before starting the playzone.

## Camera batting — stage 4 batting playzone

- [x] Add lobby entry and isolated playzone state with free-movement and practice-delivery modes.
- [x] Add repeatable configurable deliveries and per-swing feedback without match scorecard or leaderboard changes.
- [x] Test playzone entry, both modes, exit and session isolation; document manual testing.
- [x] Present this stage for review before camera capture/tracking.

## Camera batting — stage 5 swing strength

- [x] Add optional normalized swing strength to shot inputs with backward-compatible defaults.
- [x] Apply the same strength scaling to estimated distance and match/practice shot flight.
- [x] Verify strength boundaries and existing shot behavior; document testing and present for review.

## Batter rig and practice gameplay revision

## Simplified skinned batter model

- [x] Select and inspect a redistributable humanoid model with a suitable skeleton and no Blender dependency.
- [x] Integrate the model with batting animation, handedness, bat attachment and the pose interface.
- [x] Verify match and practice behavior and document the model and testing steps.

- [x] Strengthen the articulated rig and directional batting animations for future pose control.
- [x] Align practice delivery presentation, controls and timing with match batting while retaining configurable, unlimited deliveries.
- [x] Verify rig and practice behavior, and document how to test the changes.

Ordered execution and exit criteria are in `DELIVERY_PLAN.md`. The user approved proceeding phase by phase. Unchecked items are not verified or complete.

## Phase index

- [ ] **Phase 0 — Baseline:** reproducible clean install, automated browser workflow, test fixtures, production preview and recorded environment.
- [ ] **Phase 1 — Offline match and controls:** repeated complete matches, lifecycle protection, accessible landscape input and device matrix.
- [ ] **Phase 2 — Rules:** tested no-ball, wide, free-hit, LBW/bowled and agreed contest/tie-break decisions; document limitations.
- [ ] **Phase 3 — Bowling physics:** unified coordinates and delivery trajectory, side/hand symmetry, marker consistency and traceable calibration.
- [ ] **Phase 4 — Batting and six flight:** spatial contact, shot timing, trajectory, boundary/landing distance and scoring fixtures.
- [ ] **Phase 5 — Offline opponents and fielding:** varied fair bots, AI-controlled supporting players, field settings, rating-based fielding and catches, automated running, and transparent teammate progression tied to player performance.
- [ ] **Phase 6 — Presentation and performance:** broadcast UI/cameras, animation, licensed audio, accessibility and actual-device profiling.
- [ ] **Phase 7 — Real-player 1v1:** authoritative private matches, event protocol, latency, reconnect, integrity and two-client testing.
- [ ] **Phase 8 — Release:** CI, staging, monitoring, deployment target, rollback and release verification.

The detailed tasks below map to these phases. Completed sub-tasks do not imply a whole phase is complete. Physical-device checks, measurement sources, service access and costs must remain explicit; do not invent results or block unrelated local work while waiting for them.

## Additional phase acceptance work

- [x] Add a repeatable browser smoke command that starts its own server, checks lobby → toss → gameplay, captures browser errors, and closes its browser and server.
- [x] Build and exercise production-preview assets with the same automated browser and viewport checks; physical devices and full production matches remain open.
- [x] Check batting and bowling control visibility and hit targets in touch-emulated 568×240, 667×300 and 1024×768 viewports, including bowling side and pace/spin control switching. These checks do not replace physical devices or full-match testing.
- [x] Resolve one missed batting delivery and one user-bowled delivery in each browser viewport, and check each appears in the over tracker without browser errors.
- [x] Swing at a bot delivery through the batting control and verify timing feedback and an over-tracker outcome at both emulated viewport sizes; broader shot and timing coverage remains open.
- [x] Add and run a seeded browser scenario through both innings, scorecards and return to lobby. It uses bowling controls and leaves bot deliveries while batting; interactive batting and alternative match outcomes remain open.
- [x] Verify six legal deliveries on both scorecards, then start a fresh rematch and toss in a seeded browser scenario.
- [x] Complete seeded browser matches in both innings orders with user bowling and registered batting swings; test additional shots and physical touch separately.
- [x] Exercise a timed lofted shot through a complete browser match and check the six count and displayed distance against the scorecard. The timing-based scenario does not guarantee a six on every device or run.
- [ ] **Phase 0:** Establish repeatable seeded match and browser fixtures, capture console/runtime failures, record clean-install and production-preview results, and stop test processes afterward.
- [ ] **Phase 1:** Verify a complete interactive batting and bowling match through both possible innings orders, extras, summary, rematch and lobby; ensure score and control state survive orientation and focus changes.
- [ ] **Phase 2:** Test no-ball precedence, free-hit chains, LBW/bowled for both hands, offered/no shot and actual impact ordering; keep contest tiebreak and sudden-death rules explicit.
- [ ] **Phase 3:** Reconcile modeled release/crease/contact/stump coordinates with the rendered pitch, then use one trajectory for pitch marker, flight, bounce, contact and wicket projection.
- [ ] **Phase 4:** Replace separate timing-only contact estimates with a spatial bat/ball model and verify the same shot produces the displayed, scored and replayed trajectory; define how distance is measured around stadium obstructions.
- [ ] **Phase 5:** Establish seeded bot distributions and fair delivery variety. Implement AI fielders with placement, reaction, interception, catches and throws influenced by individual ratings and ball physics; automate supporting roles and running while the human controls only their own all-rounder. Define and test transparent, bounded teammate-rating progression related to player performance.
- [ ] **Phase 6:** Profile actual frame time, input latency, memory, loading and sound on physical devices; verify broadcast cameras remain out of the way during decisions and test reduced motion.
- [ ] **Phase 7:** Specify server-authoritative inputs and event ordering before implementing private rooms, reconnection, validation and adverse-network tests.
- [ ] **Phase 8:** Record CI, staging/production destination, deployment credentials, costs, monitoring, versioning and rollback; no production target is assumed.

## Audit findings and next-feature readiness

- [x] Align the rendered human-bowled ball with the adjudicated contact plane and trigger the bot swing before resolution; cover pace, spin, frame crossings, practice and match recording.
- [ ] Validate the animated bat against the ball and model each bot shot's early or late timing in its swing animation. Contact remains timing-based rather than spatial, so the bat mesh is not guaranteed to meet the ball.
- [ ] Run the full readiness suite before starting the next feature: unit tests, production build and preview smoke across supported emulated landscape sizes, full match in both innings orders, sudden-death fixture, rematch/lobby, extras and a confirmed-six scenario. Record results and remaining physical-device coverage.
- [ ] Confirm a six through the browser match flow; the lofted-shot run on this audit completed with zero sixes, although six finalization has unit coverage.

## Match reliability and presentation — current priority

- [x] Initialize new match controllers even if a previous scene still marks a ball in play, while retaining the active-match reset guard.
- [x] Invalidate cancelled batting flight callbacks so they cannot observe or resolve a later delivery.
- [x] Store detached delivery and shot inputs for each recorded ball so later control changes cannot rewrite its history.
- [x] Use the finalized scorecard distance in the shot result banner, including when a distance is capped.
- [x] Keep the first run-up after changing bowling side on the newly selected side, including after a previously bowled delivery.
- [x] Show player batting timing as early, perfect or late with a colored meter and the offset in milliseconds; hide it for bot shots and new deliveries.
- [x] Remove the keyboard-only Rookie override that replaced a recorded shot's timing with a perfect value; preserve the displayed timing for both input methods while retaining documented difficulty assistance.
- [x] Identify timing assistance in the post-shot feedback on Rookie and Medium difficulty.
- [x] Use a compact batting cue with touch-appropriate wording on touchscreen devices and keyboard wording on desktop.
- [x] Apply the same human-versus-bot timing assistance to contact decisions and shot-flight quality; keep the timing meter and recorded input unmodified.
- [x] Show the opponent's configured bowling arm or batting hand instead of a hard-coded role; do not reveal the next delivery type.
- [x] Label over-tracker entries and upcoming balls by legal ball number after extras, and distinguish a legal free-hit dot from an extra.
- [x] Use the recorded legal ball number and identify wides, no-balls and free hits in summary scorecard labels; cover extra chains in unit tests and rendered scorecards in a full match.
- [ ] Verify run-up switching and batting timing feedback on physical phones and tablets, including repeated side changes and different shot timings.
- [x] Prevent repeated rendering of the same match summary from duplicating its leaderboard entry; cover successive matches.
- [ ] Test persistence and summary behavior through repeated rematches and lobby returns in the browser; a single rematch and lobby return have each been checked.
- [ ] Exercise repeated full matches, interactive batting, no-balls/free hits, wides, wickets and sudden-death presentation in a real browser; verify sound and errors.
- [x] Cancel held bowling and clear held inputs on pause or focus loss; track the bowling pointer so another finger cannot release it. Cover interruption logic in automated tests and normal pointer/keyboard bowling in an emulated browser.
- [x] In a touch-emulated browser, rotate during a held bowling action, confirm the run-up is cancelled without recording a ball, then rotate back and bowl successfully.
- [x] Prevent focused slider keys from also changing bowling aim or delivery type, and clear held-key release safely after leaving gameplay.
- [x] Support keyboard/assistive click activation of on-screen shot buttons without firing the global batting shortcut as well; verify keyboard activation in an emulated tablet browser.
- [x] Allow Enter to activate the focused bowling and batting action buttons, and keep Space/Enter on unrelated buttons from starting a delivery.
- [ ] Verify rotation, backgrounding, focus loss, pointer cancellation and simultaneous touch inputs end to end on physical devices, including batting while a delivery is in flight.
- [x] Show both sudden-death innings, including extras, alongside regular-innings scorecards; explain wicket-based decisions accurately and cover the summary with tests.
- [x] Wait for the actual innings transition before preparing another delivery; reject deliveries after an innings is finished. A browser fixture forced a regular-innings tie and verified one legal ball per sudden-death innings.
- [ ] Visually verify sudden-death summary, rematch and lobby return in a browser after a naturally completed tied match.
- [ ] Replace global delivery flags and loosely typed renderer callbacks incrementally with typed, cancellable match events and replayable snapshots.
- [ ] Remove obsolete diagnostic paths and duplicate UI/screen handling after verifying callers; do not discard useful tests.

## Rules, shot and delivery fidelity

- [x] Preserve a boundary-on-the-full when a shot starts at ground level and rises across the rope without bouncing.
- [x] Align rendered stump width and height with the dimensions used by the simplified wicket decision model; check the actual meshes against those dimensions.
- [x] Align the painted popping creases and adjoining markings with the existing modeled crease at both ends.
- [x] Sample the same authored incoming path for rendered deliveries, pitch marker, pitching-line test, contact and incoming velocity; extrapolate it to the rendered stump plane for simplified wicket decisions.
- [x] Add an evidence-informed pace-delivery slowdown at the pitch and record its scope and limitations in `PHYSICS_CALIBRATION.md`; calibrate spin, other surfaces and independent delivery trajectories separately.
- [x] Animate a bowled ball from its visible position to the modeled stump plane using the same projected path.
- [x] Continue missed deliveries that avoid the simplified pad model to the stump plane, including extras; stop the visual on modeled pad impacts.
- [ ] Model pad deflection and calibrate the extrapolated trajectory and wicket decisions against traceable data; the current approximation does not establish realistic LBW accuracy.
- [x] Document current contest scoring, modeled cricket decisions and known simplifications against MCC laws and ICC T20I free-hit conditions.
- [ ] Expand decision-table tests and implementation for both hands, offered/no shot, bat/pad order and unmodeled faults; compare each against the chosen playing conditions.
- [x] Identify non-boundary runs as distance estimates in the shot result.
- [ ] Design fielding and running before claiming realistic non-boundary scoring.
- [ ] Consolidate authored delivery, contact, shot flight and wicket projection around shared coordinates, time, units and sampled inputs; eliminate competing legacy distance paths where safe.
- [ ] Build traceable calibration fixtures for pace, bounce, swing, spin, contact speed, launch angle and six carry, including symmetry and frame-rate checks; document assumptions and confidence.
- [ ] Model landing/obstructions or label estimated unobstructed carry, and review hard distance caps and boundary geometry.
- [ ] Improve bot delivery variety to include spin and swing, use reproducible seeded inputs, and measure legal-ball, shot, wicket and scoring distributions by difficulty.

## Controls, performance and release

- [x] Remove repeated batter-mesh traversal and visibility writes from the run-up and delivery render loops; real-device impact remains to be measured.
- [x] Keep fixed-step shot simulation in sync at simulated 10 fps while bounding catch-up after long stalls; profile real-device frame pacing and worst-case cost separately.
- [ ] Automate landscape phone/tablet viewport and control-accessibility checks for batting and bowling, including safe areas and browser chrome; test actual iOS and Android hardware separately.
- [ ] Profile real-device frame time, loading, input latency and memory; investigate fixed-step catch-up and bundle size before selecting optimization or changing renderer.
- [ ] Add CI, clean-install/build and production smoke checks, deployment configuration and rollback; select staging/production hosting when needed.
- [ ] Design and build server-authoritative 1v1, replayable event logs, private rooms, reconnects, latency handling and two-client tests after offline match behavior is stable.
- [ ] Improve readable gameplay feedback, accessibility, audio and lightweight event-synchronized animations after control and physics priorities are met.

## Batter positioning before delivery

- [x] Add touch and keyboard controls for moving the batter left/right and a limited distance forward/back before release.
- [x] Bound the stance and lock movement at release; apply it to the visible batter, timing, approximate reach, pad impact, LBW and wides.
- [ ] Replace the simplified stance/contact model with spatial bat and body collision, calibrate it for both handednesses, and communicate the stance to a future opponent.
- [ ] Test movement and release locking on physical phones and tablets, including simultaneous touch input.

## Bowler side and delivery angle

- [x] Let the bowler choose over or around the wicket before delivery; mirror release positions for both bowling arms.
- [x] Use the selected release angle in the visible delivery, pitch target, swing, spin, incoming velocity and simplified contact, LBW and wide decisions. Bots also choose a side.
- [ ] Calibrate angle and lateral momentum against measured deliveries; add the side and release parameters to future multiplayer messages.
- [ ] Test both bowling arms and batter handednesses on physical devices, including trajectory-to-marker and umpiring consistency.

## Remaining foundations

- [x] Use a regulation-sized ball for physical ground and wicket calculations; retain an enlarged render for readability.
- [ ] Calibrate ball and bat parameters against measured cricket data; replace the current timing-based contact approximation with spatial bat/ball contact.
- [x] Record a sampled front-foot landing separately from release timing and use it for front-foot no-balls.
- [ ] Calibrate front-foot variability, add a visible delivery-stride/foot replay and cover back-foot faults, wides, LBW and free-hit edge cases.
- [ ] Profile frame pacing and input latency on real phones and tablets; build repeatable multi-device gameplay tests.
- [ ] Refine the existing basic character animations after the control and physics foundations are stable; implement authoritative real-player multiplayer in Phase 7.
## Practice camera and outcome options

- [x] Add follow-ball and detailed outcome controls to batting and bowling practice.
- [x] Verify both modes and document how to use the controls.

## Bowling practice pitch aiming

- [x] Add match-style pitch map and direct pitch targeting to bowling practice.
- [x] Verify aiming synchronization, input locking and touch access; document testing.
