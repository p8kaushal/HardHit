# Gameplay to-do

Ordered execution and exit criteria are in `DELIVERY_PLAN.md`. **The user must approve that plan before implementation resumes.** Unchecked items are not verified or complete.

## Phase index

- [ ] **Phase 0 — Baseline:** reproducible clean install, automated browser workflow, test fixtures, production preview and recorded environment.
- [ ] **Phase 1 — Offline match and controls:** repeated complete matches, lifecycle protection, accessible landscape input and device matrix.
- [ ] **Phase 2 — Rules:** tested no-ball, wide, free-hit, LBW/bowled and agreed contest/tie-break decisions; document limitations.
- [ ] **Phase 3 — Bowling physics:** unified coordinates and delivery trajectory, side/hand symmetry, marker consistency and traceable calibration.
- [ ] **Phase 4 — Batting and six flight:** spatial contact, shot timing, trajectory, boundary/landing distance and scoring fixtures.
- [ ] **Phase 5 — Offline opponents and fielding:** varied fair bots, reproducible difficulty, and the minimum fielding/running design needed for plausible outcomes.
- [ ] **Phase 6 — Presentation and performance:** broadcast UI/cameras, animation, licensed audio, accessibility and actual-device profiling.
- [ ] **Phase 7 — Real-player 1v1:** authoritative private matches, event protocol, latency, reconnect, integrity and two-client testing.
- [ ] **Phase 8 — Release:** CI, staging, monitoring, deployment target, rollback and release verification.

The detailed tasks below map to these phases. Completed sub-tasks do not imply a whole phase is complete. Physical-device checks, measurement sources, service access and costs must remain explicit; do not invent results or block unrelated local work while waiting for them.

## Additional phase acceptance work

- [ ] **Phase 0:** Establish repeatable seeded match and browser fixtures, capture console/runtime failures, record clean-install and production-preview results, and stop test processes afterward.
- [ ] **Phase 1:** Verify a complete interactive batting and bowling match through both possible innings orders, extras, summary, rematch and lobby; ensure score and control state survive orientation and focus changes.
- [ ] **Phase 2:** Test no-ball precedence, free-hit chains, LBW/bowled for both hands, offered/no shot and actual impact ordering; keep contest tiebreak and sudden-death rules explicit.
- [ ] **Phase 3:** Reconcile modeled release/crease/contact/stump coordinates with the rendered pitch, then use one trajectory for pitch marker, flight, bounce, contact and wicket projection.
- [ ] **Phase 4:** Replace separate timing-only contact estimates with a spatial bat/ball model and verify the same shot produces the displayed, scored and replayed trajectory; define how distance is measured around stadium obstructions.
- [ ] **Phase 5:** Establish seeded bot distributions and fair delivery variety; decide and implement how fielding, catches and runs work without undermining the six-hitting focus.
- [ ] **Phase 6:** Profile actual frame time, input latency, memory, loading and sound on physical devices; verify broadcast cameras remain out of the way during decisions and test reduced motion.
- [ ] **Phase 7:** Specify server-authoritative inputs and event ordering before implementing private rooms, reconnection, validation and adverse-network tests.
- [ ] **Phase 8:** Record CI, staging/production destination, deployment credentials, costs, monitoring, versioning and rollback; no production target is assumed.

## Match reliability and presentation — current priority

- [x] Invalidate cancelled batting flight callbacks so they cannot observe or resolve a later delivery.
- [x] Store detached delivery and shot inputs for each recorded ball so later control changes cannot rewrite its history.
- [x] Use the finalized scorecard distance in the shot result banner, including when a distance is capped.
- [x] Keep the first run-up after changing bowling side on the newly selected side, including after a previously bowled delivery.
- [x] Show player batting timing as early, perfect or late with a colored meter and the offset in milliseconds; hide it for bot shots and new deliveries.
- [ ] Verify run-up switching and batting timing feedback on physical phones and tablets, including repeated side changes and different shot timings.
- [x] Prevent repeated rendering of the same match summary from duplicating its leaderboard entry; cover successive matches.
- [ ] Test persistence and summary behavior through repeated rematches and lobby returns in the browser.
- [ ] Exercise repeated full matches, interactive batting, no-balls/free hits, wides, wickets and sudden-death presentation in a real browser; verify sound and errors.
- [x] Cancel held bowling and clear held inputs on pause or focus loss; track the bowling pointer so another finger cannot release it. Cover interruption logic in automated tests and normal pointer/keyboard bowling in an emulated browser.
- [ ] Verify rotation, backgrounding, focus loss, pointer cancellation and simultaneous touch inputs end to end on physical devices, including batting while a delivery is in flight.
- [x] Show both sudden-death innings, including extras, alongside regular-innings scorecards; explain wicket-based decisions accurately and cover the summary with tests.
- [ ] Visually verify sudden-death summary, rematch and lobby return in a browser after a naturally completed tied match.
- [ ] Replace global delivery flags and loosely typed renderer callbacks incrementally with typed, cancellable match events and replayable snapshots.
- [ ] Remove obsolete diagnostic paths and duplicate UI/screen handling after verifying callers; do not discard useful tests.

## Rules, shot and delivery fidelity

- [x] Document current contest scoring, modeled cricket decisions and known simplifications against MCC laws and ICC T20I free-hit conditions.
- [ ] Expand decision-table tests and implementation for both hands, offered/no shot, bat/pad order and unmodeled faults; compare each against the chosen playing conditions.
- [x] Identify non-boundary runs as distance estimates in the shot result.
- [ ] Design fielding and running before claiming realistic non-boundary scoring.
- [ ] Consolidate authored delivery, contact, shot flight and wicket projection around shared coordinates, time, units and sampled inputs; eliminate competing legacy distance paths where safe.
- [ ] Build traceable calibration fixtures for pace, bounce, swing, spin, contact speed, launch angle and six carry, including symmetry and frame-rate checks; document assumptions and confidence.
- [ ] Model landing/obstructions or label estimated unobstructed carry, and review hard distance caps and boundary geometry.
- [ ] Improve bot delivery variety to include spin and swing, use reproducible seeded inputs, and measure legal-ball, shot, wicket and scoring distributions by difficulty.

## Controls, performance and release

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
