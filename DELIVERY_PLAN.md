# HardHit delivery plan

This is the proposed plan for taking the existing offline prototype to a reliable mobile-first six-hitting duel and, after that foundation is ready, a deployable real-player 1v1 game. `TODO.md` tracks the implementation checklist; this document defines priorities, phase gates and decision boundaries.

**Approval:** The user approved proceeding phase by phase and specified the AI teammate model. Complete and verify phases in order, commit focused increments, and continue autonomously unless a decision or access listed below is needed. Approval of the plan is not approval for an unspecified paid service, public deployment or destructive action.

## Product constraints

- Keep the game lightweight, landscape-first and playable on phones, tablets and desktop browsers. Smooth controls and cricket behavior take priority over detailed graphics.
- Each player receives six legal balls. The biggest single six is the primary result. When biggest six and wickets are tied, compare the number of sixes, then total hit distance. If neither player hits a six and wickets are level, compare runs; if runs are also level, use sudden death.
- Preserve manual batting and bowling controls, batter movement before release, over/around-the-wicket selection, speed and swing or spin, a clear pitch target, and the selected shot direction.
- Real-player 1v1 is a later milestone. Until then, bot play must remain a complete, testable experience. Use original presentation and assets inspired by cricket games, without copying their interface or assets.
- Each human controls only their own all-rounder when batting or bowling. Supporting players, including fielders, are AI-controlled. Field settings and individual fielding ratings influence positioning and realistic chances of stopping runs or taking catches. Teammate ratings are related to the human player's performance; define transparent, measured progression without obscuring player skill or granting unexplained advantages. Offline bot opponents use the same principles.
- Keep sound optional with an accessible mute control. Defer elaborate character animations until controls, decisions and physics are stable.

## Current baseline

The repository is a TypeScript/Vite web app using Babylon.js. It has an offline bot match, landscape controls, pre-delivery batter movement, bowler-side selection, approximate flight and contact calculations, simplified LBW/wide/no-ball handling, sound effects and browser-local progress. These systems are prototypes: they have not been calibrated against a representative set of measured deliveries or verified on the user's physical devices. Current rules and deliberate simplifications are documented in `CRICKET_RULES.md`. On 4 November 2026, the local baseline was 83 passing automated tests and a successful production build; rerun both before relying on it.

An emulated landscape browser run completed a bot match through both overs, the summary and the rematch toss, with no reported browser errors. A separate run checked that wides preserve legal-ball counts. The lobby showed the saved result and XP after reload. A 667 × 300 browser viewport showed the bowling controls, including pace and spin; pointer and keyboard bowling each resolved after the input interruption fix. This is not physical-device verification. Match return to lobby, full interactive batting, repeated matches, multitouch and the remaining viewport matrix still need end-to-end checks.

## Codebase audit and priorities

The current code supports an offline prototype, not a calibrated cricket simulation or online game. The following observations drive the milestones below:

- **Match lifecycle:** UI callbacks and global mutable delivery flags coordinate the renderer and controller. Delivery cancellation, summary-write idempotency and sudden-death summary contents have regression coverage, but repeated matches, rematch, lobby, paused input and sudden-death presentation still need browser coverage.
- **Scoring and rules:** Regular and sudden-death comparisons are embedded in the controller. Wides, no-balls, free hits and LBW use simplified models; non-boundary runs are estimated from distance without fielders or running. Define which contest-specific rules apply and validate the result and its explanation together. Boundary and six distance are simulated, with no stand/obstruction collision and a 130 m clamp.
- **Delivery, contact and physics:** The incoming delivery is an authored path, while post-contact uses a fixed-step simulation. Bat contact and shot velocities use timing, risk and hand-tuned factors, with separate legacy distance calculations and randomness. They are useful prototypes, not evidence of real-world accuracy. Document coordinate conventions and units, unify decisions with the displayed path, and calibrate representative pace, bounce, swing, spin, bat impact and landing fixtures against traceable data. Fixed-step catch-up now covers 10 fps in a regression test and caps long stalls; actual device cost and frame pacing still need profiling.
- **Controls and UX:** Phone-sized bowling was checked in one emulated viewport; batting, small heights, safe areas, multitouch, cancellation, keyboard focus and physical devices remain open. Test pause and focus loss while holding a control. Review the many overlapping responsive CSS rules and reduce them only with a viewport regression matrix. Prevent the controls and HUD from obscuring the ball, pitch or score.
- **Bots and player feedback:** Bots choose pace delivery types only, with randomized aiming and timing, and the automated bot simulator does not cover the actual rendered match or scores. Add spin/swing variation, reproducible seeded scenarios and measured difficulty distribution before tuning. Explain release error, no-ball/free hit, contact quality, score and distance without revealing a future human opponent's hidden choices.
- **Architecture and operations:** `ui.ts`, `scene.ts`, `game.ts`, and `formula.ts` mix state, simulation, rendering, DOM and diagnostics; global callbacks and uncaptured randomness make replay and future authoritative multiplayer difficult. Introduce typed, serializable delivery events and injected randomness incrementally. Add automated browser smoke tests, lifecycle cleanup, accessibility checks, profiling, release/rollback procedures and CI. The current production build includes a roughly 1.09 MB gzip Babylon chunk; measure load and runtime before considering an engine migration.
- **Future product:** Real-player 1v1, authoritative matchmaking/private rooms, reconnects, latency handling and deployment do not exist yet. Keep them behind stable offline rules, deterministic input/event contracts and representative two-client testing; hosting and credentials are still undecided.

## Project work protocol

- Keep all implementation work on a dedicated `feature/<short-name>` branch; never edit `main` directly.
- Before each bounded task, record its scope and acceptance checks in `TODO.md` and update the relevant plan status. Update tracking at task start, when findings change scope, and at completion.
- Keep changes focused and architecture boundaries clear. Add only necessary, behavior-focused tests for fixes.
- Before considering a task complete, run relevant automated tests, production build, and browser/device checks when applicable. Record what ran, what passed, and any device or environment limitation.
- Commit each verified increment atomically with a descriptive message. Do not merge feature branches without presenting the verified changes and receiving explicit user approval. After an approved merge, remove the local and remote feature branch.
- Never claim the whole project is issue-free; report the audited scope and known limitations.

## Operating loop

For each bounded change:

1. Inspect the affected code, existing tests and worktree; preserve unrelated changes and check for repository instructions. Confirm the current behavior and write down the defect or acceptance criteria.
2. Prefer the smallest complete change that fixes the cause. Keep physics, match decisions and presentation in clearly separated modules when touching them; do not perform a broad rewrite without evidence.
3. Add or update focused automated tests for behavior and important edge cases. Run `npm test`, `npm run build` and any targeted checks. For UI or gameplay changes, also exercise the relevant flow in the browser at representative landscape sizes, including a short phone viewport and a tablet viewport.
4. Inspect the result: check the score, control state, visible ball/marker, browser errors and changed files as applicable. Record what was actually verified and what still requires a physical device.
5. Commit the verified increment with a clear message, then move to the next unblocked task. Keep `TODO.md`, relevant user-facing documentation and this plan consistent with the implementation.

Use a task branch when doing substantial or parallel work; reuse the current checkout when suitable. Do not overwrite existing changes. Keep commits focused and avoid unrelated formatting churn. If a check fails, fix or explicitly isolate the failure before proceeding; do not mark an unverified feature complete.

## Phased delivery plan

The goal is a credible six-hitting contest with responsive controls and explainable outcomes. "FIFA-like" is a long-term quality reference, not a claim that the present team, browser or prototype already matches a commercial sports simulation. Retain Babylon.js unless a measured comparison demonstrates that an engine migration is worth its cost.

| Phase | Outcome | Status |
|---|---|---|
| 0 | Baseline and repeatable verification | Partially complete; harden before feature work |
| 1 | Stable offline match and responsive controls | Partially implemented; end-to-end and device checks open |
| 2 | Fair decisions and contest rules | Prototype; significant work open |
| 3 | One shared, calibrated bowling trajectory | Prototype; significant work open |
| 4 | Bat contact, six flight and scoring | Prototype; significant work open |
| 5 | Credible offline opponents and non-boundary play | Basic bot exists; major work open |
| 6 | Broadcast presentation, sound and performance | Basic presentation exists; refinement and device measurements open |
| 7 | Real-player 1v1 | Not implemented |
| 8 | Staging, deployment and operations | Not implemented |

### Phase 0 — trustworthy baseline

- Record the current controls, match rules, browser matrix, existing known failures and baseline timings. Keep `CRICKET_RULES.md` and `TODO.md` synchronized with actual behavior.
- Establish a supported repeatable browser/integration workflow that can start the app, play test scenarios, inspect errors and shut down its own processes. Add a reproducible seeded test mode or injectable inputs without exposing gameplay shortcuts in production.
- Verify clean install, `npm test`, `npm run build`, asset/licence availability, production preview and a complete bot match. Audit repository instructions and preserve user files.
- **Gate:** reproducible checks and a recorded baseline; a failing or unavailable device check is listed as open rather than described as passed.

### Phase 1 — reliable offline match and controls

- Test both batting and bowling overs, toss, all ball outcomes, extras, wickets, sudden death, summary, rematch, lobby, leaderboard and saved profile over repeated matches. Ensure six legal balls per regular innings and one score resolution per delivery.
- Replace fragile global delivery flags and timer coupling incrementally with typed match/delivery states, cancellable callbacks and immutable or versioned event snapshots. Handle backgrounding, focus loss, rotation, interrupted holds and new-match cleanup.
- Verify direction locking, simultaneous aim/shot touch, batter movement and lock, bowling side, line/length, release meter, pace, swing and turn, including timing feedback and keyboard input. Correct any UI/physics direction mismatch.
- Exercise a representative landscape matrix: a short phone viewport such as 667×300, common phone sizes, tablet including browser chrome, and desktop. Check control hit targets, safe areas and unobstructed pitch; portrait must pause and request rotation. Automated emulation does not replace physical iOS/Android/iPad testing.
- **Gate:** repeated end-to-end scenarios and regression tests pass; each tested viewport has accessible controls and no duplicate ball or stuck state. Physical-device coverage remains explicitly open until available.

### Phase 2 — rules and fair execution

- Turn `CRICKET_RULES.md` into tested decision tables for no-ball/wide precedence, free-hit chains, legal-ball counts, bat-before-pad, bowled, LBW, offered/no shot, impact and pitching lines, stump projection, stance and both hands/arms. Compare against the applicable MCC law and chosen T20 playing conditions; document intentional contest exceptions.
- Make front-foot/no-ball behavior understandable and reproducible. Calibrate the current sampled landing against a defensible model, retain the sample in the delivery snapshot, and add only faults that can be represented coherently. Do not hide unexplained randomness from the player.
- Keep the agreed biggest-six/wickets/six-count/distance/runs hierarchy in one tested rules module. Make result messaging and sudden-death scorecards match stored results, including no-balls and free hits.
- **Gate:** table-driven tests cover legal/illegal deliveries and both hands, with adjudication, scoreboard and explanation agreeing. Remaining unsupported dismissals and approximations are documented.

### Phase 3 — bowling trajectory and pitch consistency

- Define shared world coordinates, metres, seconds and constants, including release, popping crease, impact and actual rendered stumps. Wicket decisions now extrapolate the approximate path to the rendered stump plane; animate missed balls there and calibrate the projection before claiming accuracy.
- Make a single sampled delivery path drive pitch marker, rendering, bounce, batter contact, sound and wicket projection. Include selected over/around side, bowling arm, stance, line/length, pace, swing and off/leg spin with mirrored sign tests.
- Gather traceable, appropriately licensed measurements or research ranges for representative pace, spin, swing and bounce. Record source, units, uncertainty, fixture inputs and chosen tolerances before tuning; use reproducible tests rather than promising professional-grade accuracy from guessed coefficients.
- Test stable simulation under frame-rate variation, interruption and device load; preserve player reaction time without hidden slowdowns.
- **Gate:** fixture trajectories and visible markers agree within documented tolerances, direction/hand symmetry tests pass, and calibration limits are published.

### Phase 4 — batting contact, six distance and scoring

- Build a spatial bat/ball interaction incrementally, incorporating incoming velocity, swing timing and phase, footwork, stance, shot type, bat orientation and contact point. Preserve intentional aim on clean strikes and explain mishits through the model; the timing meter must use the same effective timing as the outcome or explicitly explain assistance.
- Use consistent fixed-step flight and event ordering for bounce, rope crossing and landing; distinguish carry, total distance and boundary outcome. Model stadium obstructions or clearly label an unobstructed estimate. Revisit the 130 m clamp only with evidence, bounded behavior and tests.
- Calibrate representative shots, launch angles, exit speed and carry against traceable ranges; include extremes, both hands, all aim directions, pace/spin, boundary-on-full and missed-frame cases.
- **Gate:** repeatable end-to-end fixtures connect input → contact → visible trajectory → score and distance, with no NaNs or inconsistent results. Report calibrated scope and deviations instead of a blanket realism claim.

### Phase 5 — credible offline play

- Give the bot varied pace, swing and spin deliveries, selectable sides and skill-based batting; use seeded randomness and measured distributions. Keep the same inputs, rules and adjudication path as a human player.
- Implement AI-controlled teammates and fielders: field placement, reaction, movement, interception, catching and throws affect runs and dismissals, taking each fielder's rating and the actual ball trajectory into account. The human controls only their own all-rounder; fielders and other supporting roles are automated. Keep running decisions consistent with that constraint and retain the distance-estimate label until the replacement works.
- Relate supporting-player ratings to the human player's performance through a transparent progression model. Define measurable inputs, fair bounds and offline/online behavior before implementation; prevent ratings from overriding physically impossible catches or obscuring the player's own influence. Avoid assuming that a single rating controls every fielding skill.
- Test difficulty distributions, no-ball and wide frequency, shot diversity and six opportunities; avoid impossible lines or a bot that wins through hidden advantages.
- **Gate:** offline matches provide varied, fair and reproducible scenarios; field settings, ratings and player performance have tested, explainable effects, and catches and saved runs follow reachable trajectories. Test extremes, ratings distribution and both teams without hidden advantages.

### Phase 6 — broadcast feel, sound and performance

- Refine the existing original HardHit visual identity, stadium, batsman, bowler, equipment, basic stance/swing/run-up, broadcast scorebar and result cards. Use event-driven camera cuts only between decisions; keep the pitch and timing readable while aiming, bowling or batting.
- Verify bat, bounce, bowling, wicket and crowd sounds on real devices, including unlock, mute, mixing and offline playback; retain asset attribution. Add an optional replay/highlight when it does not delay input or obscure the next ball.
- Profile cold load, render frame time, input latency, memory and battery/thermal behavior on representative phones and tablets. Target smooth 60 fps where hardware permits; measure actual supported-device results. Reduce CPU/GPU work and bundle size from measurements; provide quality fallbacks as needed.
- Check contrast, labels, focus, safe areas, touch sizes, reduced motion and non-color feedback.
- **Gate:** all essential controls and match information remain visible and usable across the tested matrix, actual-device measurements are recorded, and cameras/audio do not interrupt play.

### Phase 7 — real-player 1v1

- Design server-authoritative match states and a versioned protocol for private rooms, toss, both innings, ordered inputs, hidden bowling selection, deterministic randomness, results and replay. Select networking and hosting after cost, latency, security and deployment needs are known.
- Implement authoritative validation and scoring, idempotent commands, latency policy, disconnect/reconnect and recovery; do not trust client-provided score, distance, timestamps or randomness. Preserve offline bot play.
- Add private create/join first; defer public matchmaking, ranking and social features until that flow is stable. Avoid collecting more personal data than needed.
- **Gate:** two independent clients complete repeatable matches with authoritative results; tests cover latency, jitter, packet loss/retries, disconnects, reconnects, duplicates, version mismatches and malicious inputs.

### Phase 8 — staging and release

- Add CI for clean install, typecheck, tests, browser checks, production build and asset licence validation. Define release versions, environment configuration, observability, backups where applicable, rollback and incident handling.
- Measure and optimize delivery size, loading and caching on mobile networks. The current Babylon chunk is about 1.09 MB gzip; profile before deciding whether to change engine or packaging.
- Select an affordable staging/production target and domain with the user when required. Deploy staging, run a two-device smoke test and rollback rehearsal, then publish only to an explicitly agreed destination.
- **Gate:** clean-checkout and CI checks pass; staging and production tests, monitoring and rollback are recorded. Hosting access, potential costs and physical-device availability are explicit dependencies.

### Cross-phase verification and workflow

For each increment: reproduce the issue or define an acceptance case; make the smallest coherent change; add focused tests; run the relevant tests and build; exercise changed UI/gameplay in the browser at relevant sizes; inspect console and results; commit; and update the phase checklist. Keep simulation independent of frame rendering and prefer injectable clocks/randomness. Stop test servers started by the task when they are no longer needed. Record device, browser, viewport, build/commit, case, observed result and unresolved limitations. Never mark a phase complete merely because code exists or a unit test passes.

### Known decisions and dependencies

- **Contest interpretation:** preserve the agreed one-over 1v1 longest-six hierarchy in `CRICKET_RULES.md`. IPL awards have used different criteria; HardHit is an original game inspired by the six-hitting spectacle, not an assertion that its rules reproduce a particular IPL award.
- **Distance:** decide and label whether the primary metric is modeled unobstructed carry, actual first physical contact with stands, or a competition-defined measure before calibration is finalized. Current behavior is an approximation with a cap.
- **Fielding and progression:** the human controls only their all-rounder; fielders and other supporting players are AI-controlled. Phase 5 must specify how field settings are chosen, running is automated, and player performance maps to teammate ratings. Make any consequential progression choices transparent and testable.
- **Network/deployment:** backend, regions, domain, accounts, costs, moderation needs and release target are not yet chosen. No purchase or production destination is assumed.
- **Devices and external data:** physical Android/iPhone/iPad access, representative measurements and asset rights may require user input or access; continue independent local work while these are pending, but do not claim their validation.

### References for future calibration and validation

- [MCC Laws of Cricket, 2026 edition](https://www.lords.org/getmedia/a4ef9f77-2a25-4f5b-a286-4601f08e6334/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29_5.pdf), especially Laws 19, 21, 22 and 36, and [ICC men's T20I playing conditions](https://images.icc-cricket.com/image/upload/prd/rz8dfczzfiwa0pwzmcs3.pdf). Tournament conditions can differ.
- [A review and reassessment of the aerodynamics of cricket ball swing](https://www.repository.cam.ac.uk/items/08ac7dca-0898-4fd6-851b-43b7f632f658): research starting point for understanding swing, not a ready-made validated game model.
- [Official IPL 2017 awards](https://www.iplt20.com/news/article/ipl-awards-2017): one historical award used six count with longest-six tie-break; the user's specified duel hierarchy governs this project.
- [Playwright device emulation](https://playwright.dev/docs/emulation): useful for browser/viewport checks, not evidence of actual device performance or touch behavior.

## Decisions and escalation

After the user approves the phase plan, continue autonomously through routine implementation, testing, refactoring and the requested commit loop. Use judgment for ordinary technical choices and preserve the established game rules. Ask the user only when:

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
