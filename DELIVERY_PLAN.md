# HardHit delivery plan

This is the working plan for taking the existing offline prototype to a reliable mobile-first six-hitting duel and, after that foundation is ready, a deployable real-player 1v1 game. `TODO.md` tracks the current engineering tasks; this document defines priorities, verification and decision boundaries.

## Product constraints

- Keep the game lightweight, landscape-first and playable on phones, tablets and desktop browsers. Smooth controls and cricket behavior take priority over detailed graphics.
- Each player receives six legal balls. The biggest single six is the primary result. When biggest six and wickets are tied, compare the number of sixes, then total hit distance. If neither player hits a six and wickets are level, compare runs; if runs are also level, use sudden death.
- Preserve manual batting and bowling controls, batter movement before release, over/around-the-wicket selection, speed and swing or spin, a clear pitch target, and the selected shot direction.
- Real-player 1v1 is a later milestone. Until then, bot play must remain a complete, testable experience. Use original presentation and assets inspired by cricket games, without copying their interface or assets.
- Keep sound optional with an accessible mute control. Defer elaborate character animations until controls, decisions and physics are stable.

## Current baseline

The repository is a TypeScript/Vite web app using Babylon.js. It has an offline bot match, landscape controls, pre-delivery batter movement, bowler-side selection, approximate flight and contact calculations, simplified LBW/wide/no-ball handling, sound effects and browser-local progress. These systems are prototypes: they have not been calibrated against a representative set of measured deliveries or verified on the user's physical devices. The latest recorded baseline is 68 passing automated tests and a successful production build; rerun both before relying on it.

An emulated landscape browser run completed a bot match through both overs, the summary and the rematch toss, with no reported browser errors. A separate run checked that wides preserve legal-ball counts. The lobby showed the saved result and XP after reload. A 667 × 300 browser viewport showed the bowling controls, including pace and spin; this is not physical-device verification. Match return to lobby, full interactive batting, repeated matches, touch input and the remaining viewport matrix still need end-to-end checks.

## Codebase audit and priorities

The current code supports an offline prototype, not a calibrated cricket simulation or online game. The following observations drive the milestones below:

- **Match lifecycle:** UI callbacks and global mutable delivery flags coordinate the renderer and controller. Delivery cancellation and summary-write idempotency have regression coverage, but complete repeated match, rematch, lobby and paused-input scenarios still need browser coverage. Sudden-death results also need their own visible scorecards.
- **Scoring and rules:** Regular and sudden-death comparisons are embedded in the controller. Wides, no-balls, free hits and LBW use simplified models; non-boundary runs are estimated from distance without fielders or running. Define which contest-specific rules apply and validate the result and its explanation together. Boundary and six distance are simulated, with no stand/obstruction collision and a 130 m clamp.
- **Delivery, contact and physics:** The incoming delivery is an authored path, while post-contact uses a fixed-step simulation. Bat contact and shot velocities use timing, risk and hand-tuned factors, with separate legacy distance calculations and randomness. They are useful prototypes, not evidence of real-world accuracy. Document coordinate conventions and units, unify decisions with the displayed path, and calibrate representative pace, bounce, swing, spin, bat impact and landing fixtures against traceable data. Current fixed-step catch-up caps frame time and must be profiled for slow devices.
- **Controls and UX:** Phone-sized bowling was checked in one emulated viewport; batting, small heights, safe areas, multitouch, cancellation, keyboard focus and physical devices remain open. Test pause and focus loss while holding a control. Review the many overlapping responsive CSS rules and reduce them only with a viewport regression matrix. Prevent the controls and HUD from obscuring the ball, pitch or score.
- **Bots and player feedback:** Bots choose pace delivery types only, with randomized aiming and timing, and the automated bot simulator does not cover the actual rendered match or scores. Add spin/swing variation, reproducible seeded scenarios and measured difficulty distribution before tuning. Explain release error, no-ball/free hit, contact quality, score and distance without revealing a future human opponent's hidden choices.
- **Architecture and operations:** `ui.ts`, `scene.ts`, `game.ts`, and `formula.ts` mix state, simulation, rendering, DOM and diagnostics; global callbacks and uncaptured randomness make replay and future authoritative multiplayer difficult. Introduce typed, serializable delivery events and injected randomness incrementally. Add automated browser smoke tests, lifecycle cleanup, accessibility checks, profiling, release/rollback procedures and CI. The current production build includes a roughly 1.09 MB gzip Babylon chunk; measure load and runtime before considering an engine migration.
- **Future product:** Real-player 1v1, authoritative matchmaking/private rooms, reconnects, latency handling and deployment do not exist yet. Keep them behind stable offline rules, deterministic input/event contracts and representative two-client testing; hosting and credentials are still undecided.

## Operating loop

For each bounded change:

1. Inspect the affected code, existing tests and worktree; preserve unrelated changes and check for repository instructions. Confirm the current behavior and write down the defect or acceptance criteria.
2. Prefer the smallest complete change that fixes the cause. Keep physics, match decisions and presentation in clearly separated modules when touching them; do not perform a broad rewrite without evidence.
3. Add or update focused automated tests for behavior and important edge cases. Run `npm test`, `npm run build` and any targeted checks. For UI or gameplay changes, also exercise the relevant flow in the browser at representative landscape sizes, including a short phone viewport and a tablet viewport.
4. Inspect the result: check the score, control state, visible ball/marker, browser errors and changed files as applicable. Record what was actually verified and what still requires a physical device.
5. Commit the verified increment with a clear message, then move to the next unblocked task. Keep `TODO.md`, relevant user-facing documentation and this plan consistent with the implementation.

Use a task branch when doing substantial or parallel work; reuse the current checkout when suitable. Do not overwrite existing changes. Keep commits focused and avoid unrelated formatting churn. If a check fails, fix or explicitly isolate the failure before proceeding; do not mark an unverified feature complete.

## Milestones, in order

### 1. Stabilize the existing match loop

**Work**

- Exercise full batting and bowling overs, innings transitions, extras, free hits, wickets, ties, sudden death, rematch, lobby return, profile persistence and sound/mute behavior.
- Audit timers and state transitions so one delivery produces one resolution, a new match cannot inherit an old callback, and orientation changes or backgrounding do not silently consume balls.
- Add regression tests for confirmed failures, including a repeatable headless/integration strategy where the environment supports it. Keep physical-device testing separate from viewport emulation.
- Resolve contradictory or stale project documentation and remove diagnostic or obsolete code only after checking its use.

**Exit criteria:** complete match flows work repeatedly without duplicate deliveries, stuck transitions, incorrect legal-ball counts or uncaught browser errors; automated tests and production build pass.

### 2. Cricket decisions and fair input

**Work**

- Review no-ball, wide, free-hit, bowled and LBW decisions against the applicable cricket laws and document deliberate contest-specific simplifications. Preserve a full six legal balls per innings.
- Replace arbitrary decisions with explicit, inspectable state. The current front-foot landing is sampled from pace and accuracy; evaluate its fairness, calibrate the distribution, record the sampled value for replay, and give players understandable feedback. Add back-foot and other delivery faults only when they can be modeled coherently.
- Make bat-versus-pad order, no-shot cases, ball trajectory to the wicket, batter movement and handedness part of a consistent decision path. A missed ball must not automatically become a wicket, and a no-ball hit must retain both bat runs and its penalty/free hit.
- Keep current tiebreak rules in one tested place, including extra deliveries and sudden death.

**Exit criteria:** decision-table tests cover legal/illegal balls, offered/no shot, both handednesses, pitch and impact lines, wicket projection, extras, free hits and tiebreak precedence. UI feedback agrees with the stored result. Any remaining simplification is documented.

### 3. Delivery and shot physics

**Work**

- Define a single set of units, coordinates and physical constants. Use the same trajectory for the pitch marker, rendering, contact, wicket projection, sound events and scoring.
- Replace the current timing-and-reach approximation incrementally with a spatial bat/ball contact model. Include stance, footwork, swing phase, delivery pace, bounce, spin/swing, incoming velocity and shot selection. Preserve deliberate player aim for clean contact; explain mishits through the model rather than arbitrary redirection.
- Calibrate ball speed, bounce/restitution, spin turn, swing, bat exit speed, launch angle and carry against traceable measurements or credible ranges. Track assumptions and units; do not present unvalidated estimates as real-world measurements.
- Keep rope crossing, bounce order and simulated landing distance distinct. Account for stadium geometry before claiming an actual landing distance when a ball hits stands or an obstruction.
- Add deterministic physics fixtures and invariant tests: finite values, plausible ranges, mirrored handedness/side cases, direction, spin/swing sign, timing and frame-rate independence. Compare representative scenarios before and after tuning.

**Exit criteria:** repeatable scenarios agree with the documented model, the visible and scored paths agree, and parameter changes have measurable evidence. Remaining approximations and calibration gaps are explicit.

### 4. Mobile controls and performance

**Work**

- Test batting and bowling in landscape at short phone, common phone and tablet sizes, including safe-area insets, browser toolbars, orientation changes, touch cancellation and simultaneous aim/action inputs. Confirm every essential control is visible, reachable and does not hide the pitch.
- Test the movement lock, shot-direction lock, bowling side, pace, swing/spin and timing controls for touch, mouse and keyboard. Check focus, labels, disabled state, mute and reduced-motion behavior.
- Profile frame time, memory, loading, input latency and battery/thermal behavior on representative devices once available. Investigate expensive work and allocations before changing quality settings. Treat a stable 60 fps where hardware permits as a target, not a claim; ensure the simulation remains correct when frames are missed.
- Add an automated viewport/control-visibility check to the project's supported test workflow where possible; keep a short manual device checklist for issues emulation cannot prove.

**Exit criteria:** no essential controls are clipped in the tested matrix; input and orientation flows work; performance measurements and device limitations are recorded. Physical iOS and Android/iPad verification remains open until those devices are available.

### 5. Contest presentation and accessibility

**Work**

- Improve the match HUD, pitch/shot feedback, biggest-six and landing-distance display, match summary and replay so the contest's primary objective is immediately clear.
- Use a lightweight bowling-machine presentation where appropriate. Add basic, readable batter/bowler animations only after the preceding gameplay is stable; animation timing must follow simulation events rather than decide outcomes.
- Refine synthesized sound or replace it with appropriately licensed assets, while preserving mute preference, autoplay behavior and offline use. Verify sound on actual devices when available.
- Keep controls legible and usable without relying only on color; retain screen-reader labels and keyboard access.

**Exit criteria:** a new player can understand and complete a full over, see why each delivery was scored, and mute audio. Presentation does not interfere with gameplay or the performance target.

### 6. Real-player 1v1

**Work**

- Choose the network and hosting architecture after the offline match rules and deterministic simulation interface are stable. Define match states, authoritative event ordering, inputs, delivery snapshots, timing, replay and versioning before implementation.
- Build a server-authoritative match loop with validation, idempotent commands, disconnect/reconnect behavior and a clear latency policy. Do not trust client-reported score, distance, time or randomness. Keep a deterministic event log for investigating disputes and reproducing bugs.
- Add private match creation/joining first, then matchmaking and social features only when the base flow is reliable. Define what each player can see so a bowler's hidden input is not leaked before release.
- Test two clients, latency/jitter, dropped/repeated messages, reconnects, simultaneous inputs, version mismatches and full match completion. Keep offline bot play functional.

**Exit criteria:** two actual clients finish repeatable matches against an authoritative result; disconnects and invalid messages are handled; latency behavior is documented and tested. This milestone requires a selected backend/hosting environment and its access.

### 7. Release and deployment

**Work**

- Establish a reproducible clean install, typecheck/build, automated test run and production smoke test. Add CI appropriate to the selected repository host and deployment target.
- Reduce or justify the current large 3D bundle, check caching and asset delivery, and verify load/error recovery on mobile networks. Do not switch rendering engines without measured evidence that the benefit justifies the migration.
- Prepare environment configuration, secrets handling, monitoring, backup/recovery where relevant, and a rollback path. Verify the production build locally before publishing.
- Deploy to the agreed staging target first, run end-to-end checks there, then publish to the agreed production target when access and the intended destination are available. Record the deployed version and rollback method.

**Exit criteria:** clean-checkout checks pass; staging and production smoke tests are recorded; deployment configuration and rollback instructions are documented. No deployment target or production credentials are assumed.

## Decisions and escalation

Work continues autonomously through routine implementation, testing, refactoring and the requested commit loop. Use judgment for ordinary technical choices and preserve the established game rules. Ask the user only when:

- A product decision would materially change the agreed six-ball contest, scoring hierarchy, control scheme or player experience and cannot be inferred from existing direction.
- A required physical-device test, account, credential, hosting destination, domain, paid service or external integration is unavailable locally.
- An action is destructive, irreversible, exposes data, incurs an unapproved cost, or needs an approval required by the environment. Prepare the specific change and evidence first, and explain the exact decision and its consequences.
- A blocker cannot be resolved through local investigation, an authorized alternative or a reversible test.

Do not wait for approval for routine reversible work already authorized. Never claim a feature, device, sound, deployment or realism level has been verified without evidence. Report meaningful progress and blockers concisely, including what changed, checks run and material limitations.

## Release-readiness checklist

- [ ] Full offline match and tiebreak flows pass automated and browser checks.
- [ ] Delivery, contact, rules and six-distance behavior have documented calibration and regression fixtures.
- [ ] Phone/tablet controls, audio, orientation and performance have physical-device results.
- [ ] Original/basic animations are synchronized to gameplay without degrading frame pacing.
- [ ] Real-player 1v1 is authoritative, reconnectable and tested under imperfect networks.
- [ ] Clean install, CI, staging, production smoke test and rollback are documented and verified for the chosen host.
