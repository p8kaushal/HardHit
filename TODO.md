# Gameplay to-do

### Completed bounded increment — verify protected-delivery simulated run-outs

- **Scope:** reproduce a real simulated interception and throw on a no-ball and its following free hit, and compare scoring and wickets with the same legal-delivery inputs.
- [x] **Acceptance:** a deterministic defensive shot produces a ground interception and run-out on the no-ball, the following free hit and five later legal deliveries. The fixture checks all seven wickets, six legal balls, the no-ball penalty and no bat runs; the existing protected-catch fixture still passes. `npm test` passed 147 tests and production build passed with the existing Babylon chunk warning. These are numerical model fixtures, not running or fielding calibration.

### Completed bounded increment — isolate browser traces from replay

- Replay verification invokes the same instrumented controller as live play. The harness now excludes those replay calls from live shot and match traces, preventing duplicate entries and false score-summary failures when `--trace-shots` and `--verify-replay` are combined.
- [x] The injected no-ball, lofted square-shot browser match passed both innings, scorecards, lobby return and a 13-event replay; browser script syntax and `git diff --check` passed.

### Completed bounded increment — simulate scoring on illegal deliveries

- **Scope:** align seeded bot simulation with live wide cancellation, no-ball bat runs, free-hit chains and fielding dismissals. Keep attempt and legal-ball denominators explicit.
- [x] **Acceptance:** controlled simulator fixtures cover contacted and missed wides, no-ball bat runs and protected catches on a no-ball and subsequent free hit. Existing live/replay fixtures cover protected-delivery run-outs; the subsequent increment above adds simulator-specific run-out coverage. At this increment `npm test` passed 146 tests and the production build passed with the existing Babylon chunk warning.

### Completed bounded increment — missed-delivery decision table

- **Scope:** document and test the existing modeled dismissal precedence for mirrored hands, offered/no shot, pad interception, pitch and impact lines, wicket projection and no-ball. Distinguish approximated contact from physical bat/body ordering; do not claim unsupported ordering is implemented.
- [x] **Acceptance:** table fixtures assert pad interception and dismissal outcomes for both hands, offered/no shot and no-ball protection; limitations and comparison to Law 36 are explicit. Physical first-contact order and calibration remain open.

### Completed bounded increment — add the missing tenth fielder

- **Finding:** the ground map showed 12 scene representations because the fielding side had a bowler and only nine fielders (including the wicketkeeper). ICC T20I Playing Conditions clause 1.1 defines an eleven-player side, so the modeled bowling side was short one fielder.
- **Scope:** add a tenth AI-controlled fielder across default and attacking/balanced/deep layouts, the 3D scene, live interception/catching/throwing, seeded simulation, radar tags, and browser/unit assertions. Keep the existing team layout/physics abstractions and do not invent named squad identities or claim calibrated strategy.
- [x] **Acceptance:** every layout/preset has ten distinct in-rope fielders and mirrors laterally. The live map has 13 uniquely tagged pointers (ten fielders, bowler, two batters) with team colors and accessible labels. The new third-man fielder is created in the 3D scene and flows through the shared live/simulated interception layout. `npm test` passed 143 tests; production build passed with the existing ~1.09 MB gzip Babylon chunk warning; browser harness syntax and `git diff --check` passed. Desktop browser match verified all presets including third-man coordinates, ten fielder models/40 meshes, a live keeper run-out and a 12-event saved replay. The 667×300 browser match verified all 13 map tags/colors and compact expansion. This gives the bowling side eleven modeled scene representations, not a full named team roster; the non-striker and runner movement remain schematic/unanimated. Reference: [ICC Men's T20I Playing Conditions, clause 1.1](https://images.icc-cricket.com/image/upload/prd/rz8dfczzfiwa0pwzmcs3.pdf).

### Completed bounded increment — player-readable live ground map

- **Finding:** the current radar already plots the 12 scene representations (nine modeled fielders, bowler, striker, and a crease-positioned non-striker), but fielders look like interchangeable dots and the 158 px panel hides positional identity. The game has no full eleven-player bowling lineup or 3D non-striker model, so the map must not imply either exists.
- **Scope:** evolve the overlay into a readable miniature ground with role/position-specific pointer tags, live scene coordinates, batting/fielding colors, a stadium/rope/pitch frame, and accessible labels/collapse behavior. Do not invent roster members or change fielding/scoring behavior.
- [x] **Acceptance:** the 12 modeled players each have a unique tag (WK, CL, PT, CV, MO, MI, SL, FL, LB, B, S, N), full accessible role/identity labels and team colors. The map uses the same live coordinates as the scene and retains the existing collapsible behavior; on short landscape it expands from a compact 126 px header to a 188 px map panel. `npm test` passed 143 tests; `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning; `git diff --check` passed. Desktop browser match verified all three field presets, a keeper run-out, and replay of 13 events against both scorecards. The 667×300 browser match verified 12 unique tags, colors and compact expand/collapse sizing. This displays the 12 representations currently modeled (nine fielders, bowler, two batters), not a complete 22-player roster; fielders have positional labels rather than squad identities, and the non-striker remains a crease marker because no 3D non-striker model or running animation exists.

### Completed bounded increment — replay run-outs on protected deliveries

- **Finding:** direct match tests verify run-outs remain legal on no-balls/free hits, and saved-match replay separately verifies an ordinary fielded run-out. Add an end-to-end saved-event fixture for both combinations so extras, free-hit state, wicket reason, `runOutBy`, score and legal-ball count are checked together.
- **Scope:** test the existing replay contract; change implementation only if replay diverges from live scoring. Keep normal no-ball/free-hit protections for catches, bowled and LBW unchanged.
- [x] **Acceptance:** a serialized-match fixture replays a no-ball run-out followed by a free-hit run-out and verifies extras/free-hit state, dismissal reason and fielder, score, wickets, six legal balls, and match result against the live record. The test exposed and fixed a replay-validator mismatch: the pre-flight reason on the no-ball is still its no-ball explanation even though final scoring records a run-out. `npm test` passed 143 tests; `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning; `git diff --check` passed. No browser rerun was needed because the adjudication is covered in the replay fixture and the separate live run-out browser match already passed.

### Completed bounded increment — align automated runs with crease geometry

- **Finding:** `decideAutomatedRuns` currently measures the runner's full crossing and safety position from stump to stump (20.12 m), although HardHit's popping creases are rendered at z=±8.8 m. MCC Law 30 defines a batter as safe when part of their bat/person is grounded behind the popping crease. A cricket-specific sprint-with-bat study reports 2.83±0.15 s over 17.68 m between popping creases (Lockie et al., 2013; n=17), equivalent to about 6.25 m/s average over that test.
- **Scope:** use the same crease endpoints as the scene for runner progress and safe-arrival timing, retain the physical stumps as return-throw targets, and set the constant runner speed to the evidence-derived mean equivalent. Keep this as a simplified uniform-speed model; measured sample and movement/grounding limitations remain explicit.
- [x] **Acceptance:** deterministic tests cover 17.6 m between the rendered creases, runner starting positions on the safe lines, completed runs, run-outs at the target stumps, mirror symmetry and preserved boundary precedence. `npm test` passed 142 tests; `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning; `git diff --check` passed. `node scripts/browser-match.mjs --bat-first --swing --square --require-runout --field-setting=all --trace-shots --verify-replay` completed both innings, produced a keeper run-out with zero completed runs, verified all field presets and replayed 13 events against matching scorecards. Runner speed is anchored to a 17.68 m sprint-with-bat mean of 2.83±0.15 s (mean-equivalent 6.25 m/s); this small study is not a population-wide constant. Repeated-run turning, grounding/animation, fielder gather delay and throw speed remain uncalibrated. See `PHYSICS_CALIBRATION.md`.

### Completed bounded increment — preserve on-the-full boundaries in seeded bot simulation

- **Finding:** a 1,000-over seeded run per tier recorded zero sixes. The live gameplay path preserves whether the rope was crossed before first bounce, but the simulator evaluates the final landing state (`hasBounced`) and loses that event ordering, counting a ball that crossed on the full then landed as a four.
- **Scope:** carry the fixed-step `boundaryOnFull` event into simulator scoring so bot outcome metrics use the same boundary precedence as live matches. Do not tune shot physics or difficulty while correcting this scoring discrepancy.
- [x] **Acceptance:** fixed-step tests confirm a full boundary remains six even when the ball lands after crossing, while a bounce before crossing remains four. The seeded simulation regression now requires sixes and remains reproducible. `npm test` passed 141 tests; `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning. A fixed seed over 1,000 overs per tier produced 28/48/114 sixes with fielding (Rookie/Medium/Hard) and 49/94/140 without fielding; all tiers completed 6,000 legal balls with no incomplete overs. This fixes omitted six metrics, but the synthetic Rookie-batter-vs-tier-bowler distributions are not fairness targets or human-play evidence.

### Completed bounded increment — automated runner crossing and run-out adjudication

- **Scope:** replace the fielded-ground-ball fixed time-per-run estimate with one shared model for two automated runners crossing between creases while a reachable ground ball is live, accounting for the fielder's pickup/throw and a run-out at the threatened wicket. Apply it to live scoring, replay, and seeded bot simulation. Non-fielded distance estimates remain unchanged; the timing constants are provisional.
- [x] **Acceptance:** deterministic tests cover completed crossings, run-outs before the runner reaches the threatened crease, mirrored hands, boundary precedence, and run-outs surviving no-ball/free-hit protections. Saved-event replay reproduces runs and wickets, seeded simulation remains reproducible, and the browser visibly verified a keeper run-out with zero runs. At the initial increment `npm test` passed 141 tests; build and `git diff --check` passed. The browser match completed both innings and replayed all 13 persisted events against matching scorecards. The current speed and crease geometry are documented in the later calibration increment; gather delay (0.7 s) and throw timing remain provisional. Runner positions are adjudicated numerically; there is no running animation.

### Completed bounded increment — live field radar and player-readable ground map

- **Design:** show the ten current fielder positions, bowler, striker and non-striker in a top-down ground overlay. Use role-specific shapes, short unique position tags, high-contrast team colors, and a visible stadium/rope/pitch frame; keep full accessible player labels and collapse on short landscape screens. Plot the same world coordinates as the scene and refresh while fielders move. Cricket 22's in-game map supports reading gaps while fielders reposition; Cricket 07's developer diary describes a fielding radar HUD for tactical changes. This implementation uses the tactical overview and live-position ideas while retaining HardHit's existing preset controls. Sources: [Cricket 22 field-map guide](https://www.cheats.co/en/game/cricket-22) and [Cricket 07 developer diary](https://worthplaying.com/article/2006/11/13/news/37744-cricket-07-ps2pc-developer-diary-3/).
- **Scope:** display live positions without changing fielding controls or match decisions; no manual map positioning or player selection.
- [x] **Acceptance:** unit tests verify world-to-map orientation and boundary bounds. Desktop and 667×300 browser checks confirm 13 unique player tags, ten fielders, bowler and both batters, team colors, complete accessible labels and collapse/expand sizing without browser errors. `--field-setting=all` verifies marker positions across field plans; the run-out/replay browser scenario also verifies live fielder movement and saved event outcomes. `npm test` passed 143 tests; `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning; `git diff --check` passed. The non-striker remains a crease marker, and the map's 13 scene markers do not imply a full named team roster.

### Completed bounded increment — selectable AI fielder layouts

- **Scope:** add attacking, balanced and deep field plans for the player while bowling; plans must reposition AI-controlled fielders before each delivery and feed the selected positions into live interception, catches, throw estimates and seeded simulation. Bot bowling uses a consistent balanced policy. Record the field plan with each delivery for saved-match context.
- [x] **Acceptance:** attacking, balanced and deep layouts each retain nine in-range fielders and mirror for both batting hands. Unit tests verify distinct depths and the seeded simulator confirms a selected deep field changes outcomes. At completion, `npm test` passed 138 tests; production build passed with the existing ~1.09 MB gzip Babylon chunk warning; `git diff --check` and browser-harness syntax check passed. `node scripts/browser-match.mjs --field-setting=all --verify-replay` selected every plan through the bowling UI, verified point-fielder positions (deep selected before delivery), completed both innings, and replayed all 14 saved events with field presets matching. Bot bowling uses balanced. The presets are coarse starting positions; see the later runner increment for the current runner model. No data-calibrated field strategy is established.

### Completed bounded increment — fielding-aware seeded bot simulation

- **Scope:** run simulated batting trajectories against the same hand-mirrored fielder layout, rating-based reach/catch envelopes, rope ordering and return-throw run estimate used by live matches. Report ground stops and catches in the tier metrics so synthetic difficulty results include fielding effects.
- [x] **Acceptance:** identical seed and options reproduce all metrics; deterministic fixtures exercise ground stops, catches, both batting hands and rope precedence; legal catches dismiss while free-hit catches do not. Comparing the same seeded simulation with fielding enabled/disabled changes runs or wickets. Denominators reconcile with legal balls and extras. At this increment `npm test` passed 141 tests; build and `git diff --check` passed. The fielding browser match completed both innings, verified the point fielder reduced a controlled shot from one run to zero, and replayed all 13 events against matching scorecards. The catch browser match recorded a point-fielder wicket and replayed all 13 events against the visible scorecards. The simulator remains synthetic, with no fairness target. The follow-up runner calibration now documents a single-run timing reference; throw timing and repeated-run behavior remain provisional.

### Completed bounded increment — fielder return-throw run estimates

- **Scope:** replace stopped-distance scoring for fielded low balls with an automated estimate of completed runs before the return throw, using the elapsed flight, the fielder's final position and throwing rating. Retain the distance-estimate label for shots that are not fielded. The human controls only their own all-rounder; fielders and running decisions remain automated.
- [x] **Acceptance:** this intermediate estimator was superseded by automated runner crossing and run-out adjudication above. Its original ground-stop browser regression and replay passed; refer to the active increment for the current model and its assumptions.

### Completed bounded increment — reachable aerial catches

- **Scope:** model catching as a separate fielding skill; allow a fielder to catch only a reachable airborne ball before rope crossing, resolve a legal catch as a wicket, and preserve no-ball/free-hit protections.
- [x] **Acceptance:** unit tests verify legal catches add one wicket and zero shot runs, while no-ball catches add the penalty plus stopped-distance estimate without a dismissal. `npm test` passed 135 tests, build and `git diff --check` passed. `node scripts/browser-match.mjs --bat-first --swing --square --require-catch --trace-shots` completed a full match; the point fielder caught the controlled aerial shot and the wicket appeared in the result toast. The browser catch envelope and ratings are provisional; jumps/animations are not modeled.

### Completed bounded increment — rated live ground fielding

- **Scope:** use the bowling-side player's provisional agility/reaction ratings to move visible fielders during fixed-step ball flight; stop a reachable, low ground ball at the fielding point so final distance-based runs decrease, and identify the fielder in the result message.
- [x] **Acceptance:** reaction delay and speed limits have focused unit coverage; `npm test` passed 133 tests, production build passed with the existing Babylon chunk warning, and `git diff --check` passed. The controlled full browser match stopped a low ground ball with the point fielder for 0 estimated runs; replaying the same launch without fielders scored 1. The result toast identified the fielder. A strict lofted match scored sixes on the full without fielding stops. These ratings and fielding distances are provisional, and the browser fixture uses an adjusted launch for a clear scoring-threshold regression. Later increments add catches and return-throw estimates; actual batter running remains open.

### Completed bounded increment — Phase 2 no-ball precedence matrix

- **Scope:** extend no-ball-over-wide coverage to mirrored outside lines with right- and left-handed batters, and assert adjudication, penalty score, legal-ball count and free-hit state.
- [x] **Acceptance:** all four hand/line combinations classify and record as no-ball, show the no-ball explanation, add exactly one penalty run to the innings score, consume no legal delivery and activate free-hit state. `npm test` passed 121 tests; build and `git diff --check` passed.

### Completed bounded increment — Phase 2 mirrored LBW adjudication

- **Scope:** compare a right-hand/offspin/right-arm LBW fixture with its mirrored left-hand/legspin/left-arm counterpart, with offered and no-shot inputs.
- [x] **Acceptance:** both mirror fixtures return the same verdict for offered-shot and no-shot inputs. `npm test` passed 122 tests; build and `git diff --check` passed. This verifies model symmetry, not LBW calibration.

### Completed bounded increment — deterministic provisional carry estimate

- **Scope:** remove unseeded random carry overrides from the provisional `calculateDistance` path; final score and distance remain determined by the fixed-step ball flight.
- [x] **Acceptance:** assisted-edge/Rookie estimate path throws if it tries to consume global randomness; existing fixed-step tests remain green. `npm test` passed 123 tests, build and `git diff --check` passed. Final scoring still uses the resolved physical trajectory; estimates remain provisional.

### Superseded progression increment — seeded random upgrade

- The intermediate `f2f0886` change moved random upgrade selection onto the match stream. It has since been replaced by the deterministic performance mapping below; stat selection no longer uses randomness.

### Completed bounded increment — performance-based progression

- **Scope:** replace random stat upgrades with a documented, deterministic mapping from batting/bowling performance to eligible stat gains; display the measured reason and avoid gains without qualifying performance.
- [x] **Acceptance:** boundary performance maps to Power; wickets while bowling map to Accuracy; capped Power falls through to the next tied eligible stat; no-performance matches receive no attribute upgrade; progression does not use global randomness. The summary displays the measured reason. `npm test` passed 124 tests; build and `git diff --check` passed.

### Completed bounded increment — progression summary browser check

- **Scope:** assert in the strict-six browser scenario that a performance upgrade appears with its reason in the match summary.
- [x] **Acceptance:** `node scripts/browser-match.mjs --bat-first --swing --loft --square --require-six` completed both innings and returned to the lobby; the player scored five sixes and the summary displayed `Power +2 (Now 52) · 6 boundary hits`. `npm test` passed 124 tests; build and `git diff --check` passed.

### Completed bounded increment — physical bot scoring distributions

- **Scope:** extend the seeded bot simulator through the game's shot launch formula and fixed-step ball physics; report runs, dots, fours and sixes plus legal/extra/wicket rates, honoring modeled free-hit chains.
- [x] **Acceptance:** same seed reproduces every metric; simulated hits use production shot launch, fixed-step physics, boundary scoring, rated fielder interception/catch/throwing functions and automated run adjudication; attempts reconcile to legal balls and extras, and runs include extra penalties. This increment originally passed 138 tests; the expanded current suite passes 141. These synthetic Rookie-batter-vs-tier-bowler outcomes are not a fairness target, human play result, or physical calibration.

### Completed bounded increment — fielding reachability foundation

- **Scope:** add a deterministic reachability solver over timestamped ball trajectory samples using fielder position, reaction delay, speed, and reach radius.
- [x] **Acceptance:** identifies the earliest reachable sample, respects reaction delay and speed limits, and validates all inputs. `npm test` passed 126 tests; build and `git diff --check` passed. This is a reusable solver only; gameplay integration, field placement, catching and throws remain open.

### Completed bounded increment — full fixed-step flight capture

- **Scope:** allow a caller to observe every simulated fixed-step ball position so the full live trajectory can feed fielding adjudication.
- [x] **Acceptance:** optional physics observer receives every completed step; live scene stores timestamped full-flight samples and exposes defensive copies through `getShotTrajectory()`. Regression compares observed/unobserved state and accumulator, validates ordered samples and the catch-up cap. `npm test` passed 127 tests; build and `git diff --check` passed. Fielding still does not consume these samples.

### Completed bounded increment — live trajectory capture browser check

- **Scope:** make the browser trace capture the scene's trajectory at flight resolution and compare sample ordering and endpoint with the resolved physics state.
- [x] **Acceptance:** `node scripts/browser-match.mjs --bat-first --swing --loft --square --require-six --trace-shots` completed both innings and lobby; six player shots had 315–332 finite samples at 120 Hz with their last sample matching final physics position. The strict match scored six sixes. `npm test` passed 127 tests; build and `git diff --check` passed. This verifies trajectory capture, not fielding impact.

### Completed bounded increment — default field formation and movement profiles

- **Scope:** define nine named default fielder positions and a bounded mapping from agility/reaction ratings to movement profiles in pitch metres and seconds.
- [x] **Acceptance:** nine positions fit within the modeled 65 m field, mirror exactly by batter hand, and 0–100 agility/reaction map monotonically to 2–6 m/s movement, 0.15–0.45 s reaction, and 0.30–0.60 m reach. `npm test` passed 129 tests; build and `git diff --check` passed. These are prototype defaults, not measured fielding data; live visual and scoring integration remain open.

### Completed bounded increment — visible default fielders

- **Scope:** render nine simple fielders at the tested default layout and mirror their positions when batter handedness changes.
- [x] **Acceptance:** browser match verified nine fielders in-range with 36 enabled, visible, non-pickable meshes; unit matrix verifies mirrored handedness positions and the stable mesh count shows no duplicate creation on hand changes. `npm test` passed 129 tests; build and `git diff --check` passed. This increment is visual only; no scoring behavior or movement animation is connected.

### Completed bounded increment — Phase 3 trajectory symmetry

- **Scope:** add a deterministic unit regression comparing sampled mirror-image delivery paths across the full flight for pace swing and spin turn; no trajectory tuning.
- [x] **Acceptance:** mirrored paths have equal Y/Z and opposite X at release, bounce, between-bounce samples and crease. `npm test` passed 119 tests; `npm run build` and `git diff --check` passed. This verifies code symmetry only, not calibration or visible marker timing on physical devices.

### Completed bounded increment — Phase 3 bowling-side symmetry

- **Scope:** extend full-flight mirror comparison to both over-the-wicket and around-the-wicket releases for pace swing and opposite spin types.
- [x] **Acceptance:** mirrored paths agree at release, bounce, intermediate samples and crease in both bowling-side configurations. `npm test` passed 121 tests; build and `git diff --check` passed. This checks mathematical symmetry, not bowling realism.

### Completed bounded increment — Phase 3 bounce-marker agreement

- **Scope:** assert the rendered marker's source coordinates (`deliveryPitchPoint`) equal the shared sampled trajectory at its bounce progress across pace, swing and spin variants.
- [x] **Acceptance:** fixed-input regression passes for right/left arm pace deliveries with swing and both spin types; `npm test` passed 120 tests, build and `git diff --check` passed. Geometry agreement does not verify display/render timing or calibration.

### Completed bounded increment — Phase 3 incoming clock cadence

- **Scope:** extend the incoming delivery animation clock regression to 30/60/120 fps and mixed frame intervals at equal elapsed time.
- [x] **Acceptance:** 30/60/120 fps and mixed 9–41 ms slices for 1 s elapsed time produce equivalent progress within floating-point tolerance; the 50 ms per-frame catch-up cap remains covered. `npm test` passed 120 tests, build and `git diff --check` passed. This does not establish device-load performance.

## Active non-camera realism work

- **Clean-branch contact-alignment increment (committed `8d3af66`):** Fixed bot visual/adjudicated contact alignment in `src/scene.ts` and extended `scripts/browser-match.mjs` with traces and lifecycle fixtures. At that increment, 107 unit tests and the build passed, as did a strict square-shot match with sixes/fours and bot-contact checks. Later clean-branch browser checks cover both innings orders, extras, misses, pause/visibility/rotation, replay and repeated-match persistence. The disposable clean-install snapshot passed 117 tests; the latest workspace suite passes 129 after Phase 2/3 symmetry, deterministic scoring and fielding foundations. Physical bat collision, independent calibration, live-input determinism and visual/timing replay remain open. Camera batting remains excluded; no merge/deploy.
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
- [ ] **Phase 5 — Offline opponents and fielding:** varied fair bots, AI-controlled supporting players, calibrated field strategy beyond the three starting presets, rating-based fielding/catches, animated automated running, and transparent teammate progression tied to player performance. Numerical runner adjudication and transparent progression now exist; synthetic bot outcomes still need a human-tested fairness target.
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
- [ ] **Phase 5:** Use seeded distributions to identify simulator errors and establish fair delivery variety, then agree human-tested difficulty targets. AI fielders now have provisional placement, reaction, interception, catches, throws and numerical runner/run-out adjudication; batter movement animation and calibrated field strategy remain open. Teammate ratings have transparent, bounded performance progression. Synthetic results are not calibration or fairness evidence.
- [ ] **Phase 6:** Profile actual frame time, input latency, memory, loading and sound on physical devices; verify broadcast cameras remain out of the way during decisions and test reduced motion.
- [ ] **Phase 7:** Specify server-authoritative inputs and event ordering before implementing private rooms, reconnection, validation and adverse-network tests.
- [ ] **Phase 8:** Record CI, staging/production destination, deployment credentials, costs, monitoring, versioning and rollback; no production target is assumed.

## Bowling touch reliability

- [x] Keep the release control available during a hold and suppress its browser text-selection UI. Production browser checks covered quick tap, held release, subsequent delivery, rotation cancellation and keyboard input; 103 unit tests and the build passed. The user reported that the fix seems to work on iPad Chrome.

## Audit findings and next-feature readiness

- [x] **BUG: Align bot batting visual contact with adjudicated contact.** The delivery animation now resolves at the sampled `batterContactProgress` point and schedules the bot swing 150 ms before that point. A strict browser match verified the rendered position against the adjudicated contact for six bot deliveries. **Still open:** pace- and spin-specific regression fixtures; current strict scenario does not cover those delivery types, and this does not establish spatial bat collision or physical timing fidelity.
- [ ] Run the full readiness suite before starting the next feature. **Verified on this branch:** clean install (117 tests at that snapshot), latest 122-test unit run, production build/preview at 568×240, 667×300 and 1024×768, strict square-shot six/four matches in both innings orders, fast and leg-spin contact variants, wide/no-ball/free-hit chains, unswung miss, direct/visibility/rotation pause fixtures, forced sudden death, rematch, and two shared-profile matches with event replay verification. **Still open:** physical-device coverage, deterministic live-input timing and visual/animation replay, and one repeated-match run combining every edge case. The straight-shot six control was rerun on this branch with `node scripts/browser-match.mjs --bat-first --swing --loft --require-six --trace-shots`; all six player lofted shots bounced before the rope and scored four. Traced launches were approximately 27.7–29.8 m/s forward and 13.1–14.0 m/s upward, while the model's distance estimate was 37.1–57.8 m. This reproduces the control failure; do not change shot coefficients without reconciling flight, estimated carry, and traceable calibration evidence.

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
- [x] Model automated runners crossing between wickets, completed runs and run-out risk for fielded ground balls. The model is shared by live scoring, replay and seeded simulation; its numerical runner speed and gather/throw timing remain provisional, and batter movement is not animated.
- [ ] Consolidate authored delivery, contact, shot flight and wicket projection around shared coordinates, time, units and sampled inputs; eliminate competing legacy distance paths where safe.
- [ ] Build traceable calibration fixtures for pace, bounce, swing, spin, contact speed, launch angle and six carry, including symmetry and frame-rate checks; document assumptions and confidence.
- [ ] Model landing/obstructions or label estimated unobstructed carry, and review hard distance caps and boundary geometry.
- [x] Add rating-weighted, bounded pace/spin/swing selection to bot deliveries; seeded tests verify type variety and exact bot-input replay from snapshots. `MatchController` accepts a numeric seed, records it in `MatchState`, and passes its seeded source to bot decisions; production matches generate a fresh crypto seed and the browser harness can inject one. The match event log stores detached delivery/shot inputs and updates the same event with finalized flight outcome. Summary finalization persists a bounded, versioned local match history with seed, result, difficulty, player/bot snapshots, toss and events; storage tests cover duplicates, retention and corrupt data. `replayMatchRecord` replays saved regular and tied sudden-death matches through adjudication, including wide/no-ball/free-hit chains, and verifies results and innings. `runBotSimulation` uses production launch, fixed-step flight, event-ordered boundary scoring and rated field interception/catch/automated-run logic; per-tier seeded metrics include field stops and catches alongside runs, dots, fours, sixes and legal/extra/wicket/type denominators. **Still open:** these synthetic Rookie-batter-vs-tier-bowler results are not a fairness target; agree measured targets by difficulty, broaden interruption replay cases and visual playback, and restore interrupted matches.

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
