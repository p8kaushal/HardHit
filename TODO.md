# Gameplay to-do

### Completed bounded increment — Phase 2 no-ball precedence matrix

- **Scope:** extend no-ball-over-wide coverage to mirrored outside lines with right- and left-handed batters, and assert adjudication, penalty score, legal-ball count and free-hit state.
- [x] **Acceptance:** all four hand/line combinations classify as no-ball, add exactly one penalty run to the innings score, consume no legal delivery and activate free-hit state. `npm test` passed 121 tests; build and `git diff --check` passed.

### Completed bounded increment — Phase 3 trajectory symmetry

- **Scope:** add a deterministic unit regression comparing sampled mirror-image delivery paths across the full flight for pace swing and spin turn; no trajectory tuning.
- [x] **Acceptance:** mirrored paths have equal Y/Z and opposite X at release, bounce, between-bounce samples and crease. `npm test` passed 119 tests; `npm run build` and `git diff --check` passed. This verifies code symmetry only, not calibration or visible marker timing on physical devices.

### Completed bounded increment — Phase 3 bounce-marker agreement

- **Scope:** assert the rendered marker's source coordinates (`deliveryPitchPoint`) equal the shared sampled trajectory at its bounce progress across pace, swing and spin variants.
- [x] **Acceptance:** fixed-input regression passes for right/left arm pace deliveries with swing and both spin types; `npm test` passed 120 tests, build and `git diff --check` passed. Geometry agreement does not verify display/render timing or calibration.

### Completed bounded increment — Phase 3 incoming clock cadence

- **Scope:** extend the incoming delivery animation clock regression to 30/60/120 fps and mixed frame intervals at equal elapsed time.
- [x] **Acceptance:** 30/60/120 fps and mixed 9–41 ms slices for 1 s elapsed time produce equivalent progress within floating-point tolerance; the 50 ms per-frame catch-up cap remains covered. `npm test` passed 120 tests, build and `git diff --check` passed. This does not establish device-load performance.

## Active non-camera realism work

- **Clean-branch contact-alignment increment (committed `8d3af66`):** Fixed bot visual/adjudicated contact alignment in `src/scene.ts` and extended `scripts/browser-match.mjs` with traces and lifecycle fixtures. At that increment, 107 unit tests and the build passed, as did a strict square-shot match with sixes/fours and bot-contact checks. Later clean-branch browser checks cover both innings orders, extras, misses, pause/visibility/rotation, replay and repeated-match persistence. The disposable clean-install snapshot passed 117 tests; the latest workspace suite passes 121 after Phase 2 and Phase 3 regressions. Physical bat collision, independent calibration, live-input determinism and visual/timing replay remain open. Camera batting remains excluded; no merge/deploy.
- **Replay investigation:** `scripts/browser-match.mjs --replay-out=<path>` captures all recorded delivery inputs and outcomes. Two runs with the same seed and controls differed in shot timing/contact zone and some distance values because the fixture presses controls against rendered cues and live clocks. Seeded `Math.random` is insufficient for deterministic match generation from live controls. Browser checks replay saved events through adjudication and compare result, runs, wickets and legal-ball counts with the visible scorecards. Bat-first and forced sudden-death matches passed (12 and 14 events respectively); a dismissal-heavy unit fixture preserves six player wickets, innings totals and match result. The two-match shared-profile runner now requires replay verification on both runs; `npm run test:repeat-match` passed, with each match logging 13 replayed events and persisted leaderboard/history counts increasing 1→2. `npm test` passed 117 tests and `npm run build` passed with the existing Babylon chunk warning. This verifies saved event replay through controller adjudication and the browser; it does not replay timing, input events or animation. Deterministic live match generation and full visual/timing playback remain open; do not change simulation timing to hide fixture variability. **Audit reconciliation:** `REALISM_AUDIT_AND_PLAN.md` now leads with the clean-branch snapshot and verified evidence; the camera-backup findings and dated work log are labeled historical. `plan.md` reflects the resumed goal and current readiness gaps. No implementation readiness or physics accuracy is inferred beyond locally verified cases.
- **Contact variants:** Browser fixtures `--bot-bats-fast` and `--bot-bats-spin` override the shared delivery before rendering and adjudication. Both full-match runs passed the bot-contact alignment assertion, strict six and bounced-four checks, and both scorecards. This verifies those selected fast/leg-spin inputs in the current model; it is not calibration against measured deliveries.
- **Wide browser fixture:** `--fixture-wide` places one shared delivery outside the batter's reach before rendering and adjudication. A full match verified the `WD` scorecard entry, six legal balls, and one penalty run without consuming a legal delivery. This is a controlled rules fixture, not a calibration of a physical bowler's release.
- **No-ball fixture:** `--fixture-noball` now marks the shared delivery with an over-line heel value before animation; the full-match trace and scorecard verified an NB6, penalty plus shot runs, six legal balls, and a free hit next. The visual bowler-foot animation is still not physically modeled or verified.
- Work on `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; do not merge or deploy. Camera batting is excluded. See `REALISM_AUDIT_AND_PLAN.md` for the user-approved direction and phases. Its prior findings and test results describe `feature/gameplay-realism-camera-base-backup`, not this clean branch. Port the applicable non-camera changes, reconcile differences, and verify each increment.
- Ported six ground-contact interpolation, uncapped distances, unrounded longest-six ranking, pending-shot tracker and a guard waiting for final-flight resolution before innings transition. The initial port passed 107 tests and a build; later clean-branch fixtures verify six/four scoring, pending/final outcome behavior, and sudden death. See the current verification records below; older camera-backup evidence is not a substitute for clean-branch checks.

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

- [x] **Plan baseline reconciliation:** Refreshed `DELIVERY_PLAN.md`'s clean-branch baseline and code audit to current evidence: 118 latest tests, clean-install production-preview results, event replay scope, current bot variation, uncapped distances and remaining device/calibration gaps. Approved phase gates and unresolved product decisions are preserved.

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
- [x] **Phase 0:** Establish repeatable seeded match and browser fixtures, capture console/runtime failures, record clean-install and production-preview results, and stop test processes afterward. In a disposable copy, `npm ci` installed 42 packages; `npm test` passed all 117 tests, `npm run build` passed with the existing Babylon chunk warning, and `npm run test:production` passed batting/bowling preview smoke at 568×240, 667×300 and 1024×768 with no browser errors. The full dependency audit reported 7 advisories (1 moderate, 6 high); `npm audit --omit=dev` reported 0 production advisories. Clean-install artifacts stayed outside the workspace, and the preview script shut down its server after the checks.
- [x] **Phase 0 asset licensing:** The runtime inventory contains three WAV files and Babylon.js 6.49.0; no separate image, model, or font files are shipped. Added `THIRD_PARTY_NOTICES.md`, linked it from README, and copied Babylon's package license and notice into `THIRD_PARTY_LICENSES/`. The WAV credits map to BudgetPixel AI source pages identifying CC BY 4.0; those pages and the CC deed were checked. BudgetPixel's terms qualify its grant as applying to rights it holds, so the underlying rights chain remains unverified. Visuals are generated in code; delivery/bounce sounds are synthesized.
- [ ] **Phase 1:** Verify a complete interactive batting and bowling match through both possible innings orders, extras, summary, rematch and lobby; ensure score and control state survive orientation and focus changes.
- [ ] **Phase 2:** Test no-ball precedence, free-hit chains, LBW/bowled for both hands, offered/no shot and actual impact ordering; keep contest tiebreak and sudden-death rules explicit.
- [x] **Phase 2 rule-matrix increment:** Reconciled the documented no-ball/wide/free-hit/LBW fixtures to the 2026 MCC Laws and ICC Men's T20I conditions effective July 2025. Added a six-case mirrored batter-movement wide regression; `npm test` passed 118 tests and `npm run build` passed with the existing Babylon chunk warning. Body/foot ordering, other faults and out-of-model dismissal exceptions remain explicit open gaps; this does not establish law compliance or physical calibration.
- [ ] **Phase 3:** Reconcile modeled release/crease/contact/stump coordinates with the rendered pitch, then use one trajectory for pitch marker, flight, bounce, contact and wicket projection.
- [ ] **Phase 4:** Replace separate timing-only contact estimates with a spatial bat/ball model and verify the same shot produces the displayed, scored and replayed trajectory; define how distance is measured around stadium obstructions.
- [ ] **Phase 5:** Establish seeded bot distributions and fair delivery variety. Implement AI fielders with placement, reaction, interception, catches and throws influenced by individual ratings and ball physics; automate supporting roles and running while the human controls only their own all-rounder. Define and test transparent, bounded teammate-rating progression related to player performance.
- [ ] **Phase 6:** Profile actual frame time, input latency, memory, loading and sound on physical devices; verify broadcast cameras remain out of the way during decisions and test reduced motion.
- [ ] **Phase 7:** Specify server-authoritative inputs and event ordering before implementing private rooms, reconnection, validation and adverse-network tests.
- [ ] **Phase 8:** Record CI, staging/production destination, deployment credentials, costs, monitoring, versioning and rollback; no production target is assumed.

## Bowling touch reliability

- [x] Keep the release control available during a hold and suppress its browser text-selection UI. Production browser checks covered quick tap, held release, subsequent delivery, rotation cancellation and keyboard input; 103 unit tests and the build passed. The user reported that the fix seems to work on iPad Chrome.

## Audit findings and next-feature readiness

- [x] **BUG: Align bot batting visual contact with adjudicated contact.** The delivery animation now resolves at the sampled `batterContactProgress` point and schedules the bot swing 150 ms before that point. A strict browser match verified the rendered position against the adjudicated contact for six bot deliveries. **Still open:** pace- and spin-specific regression fixtures; current strict scenario does not cover those delivery types, and this does not establish spatial bat collision or physical timing fidelity.
- [ ] Run the full readiness suite before starting the next feature. **Verified on this branch:** clean install (117 tests at that snapshot), latest 118-test unit run, production build/preview at 568×240, 667×300 and 1024×768, strict square-shot six/four matches in both innings orders, fast and leg-spin contact variants, wide/no-ball/free-hit chains, unswung miss, direct/visibility/rotation pause fixtures, forced sudden death, rematch, and two shared-profile matches with event replay verification. **Still open:** physical-device coverage, the original straight-shot strict-six failure, deterministic live-input timing and visual/animation replay, and one repeated-match run combining every edge case.

## Match reliability and presentation — current priority

- [x] Initialize new match controllers even if a previous scene still marks a ball in play, while retaining the active-match reset guard.
- [x] Invalidate cancelled batting flight callbacks so they cannot observe or resolve a later delivery.
- [x] Store detached delivery and shot inputs for each recorded ball so later control changes cannot rewrite its history.
- [x] Use the finalized scorecard distance in the shot result banner. The former distance cap has since been removed.
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
- [x] Test persistence and summary behavior through repeated full matches and lobby returns in one shared browser profile. `npm run test:repeat-match` completed two matches with scorecards and lobby returns; persisted leaderboard and match-history entries each increased from 1 to 2. The single-match `--rematch` flow separately verifies a fresh match state.
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
- [x] Add rating-weighted, bounded pace/spin/swing selection to bot deliveries; seeded tests verify type variety and exact bot-input replay from snapshots. `MatchController` accepts a numeric seed, records it in `MatchState`, and passes its seeded source to bot decisions; production matches generate a fresh crypto seed and the browser harness can inject one. The match event log stores detached delivery/shot inputs and updates the same event with finalized flight outcome. Summary finalization persists a bounded, versioned local match history with seed, result, difficulty, player/bot snapshots, toss and events; storage tests cover duplicates, retention and corrupt data. `replayMatchRecord` replays saved regular and tied sudden-death matches through adjudication, including wide/no-ball/free-hit chains, and verifies results and innings. `runBotSimulation` uses per-tier seeded streams, caps extras at 24 attempts per over, reports legal/extra/wicket/type-share denominators and is tested for repeatability. **Still open:** broaden wicket and interruption replay cases and add browser playback, restore interrupted matches, measure score/outcome distributions and agree fairness targets by difficulty.

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
