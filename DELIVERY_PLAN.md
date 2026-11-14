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

**Clean-branch snapshot — 14 November 2026:** `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; current working changes are summarized in the ignored local `handoff.md`. The app is a TypeScript/Vite web game using Babylon.js with a six-legal-ball offline contest, interactive batting/bowling, authored delivery paths, approximate shot resolution, simplified dismissals/extras, seeded bot decisions, persistent match events and browser-local profile/history.

In a disposable copy, `npm ci` installed 42 packages, `npm test` passed 117 tests at that snapshot, `npm run build` passed with the existing ~1.09 MB gzip Babylon chunk warning, and `npm run test:production` passed batting/bowling smoke at 568×240, 667×300 and 1024×768 without browser errors. The latest workspace suite passes 133 tests after the fielding movement increment. The full dependency audit reported seven advisories (one moderate, six high); `npm audit --omit=dev` reported zero production advisories. Runtime asset sources and licenses are inventoried in `THIRD_PARTY_NOTICES.md`; BudgetPixel's terms qualify their audio license as applying to rights they hold, so the deeper rights chain is not established.

Full browser evidence in `TODO.md` includes both innings orders, strict square-shot six/four scoring, fast/spin contact variants, wide/no-ball/free-hit, unswung miss, pause/visibility/rotation, forced sudden death, rematch, repeated matches and saved-event replay. Fielding-stop, aerial-catch, selectable-field and run-out matches completed both innings and replayed saved events against matching scorecards. Commit `b29d2e4` has 141 passing unit tests and a production build; browser fixtures verify rated ground stops, catches, automated crossings/run-outs, field selection and radar markers at desktop and compact landscape sizes. The current uncommitted follow-up fixes seeded simulation's on-the-full scoring: a fixed-seed 1,000-over-per-tier run now records sixes, whereas the prior simulator recorded zero. Fielding ratings, runner speed and gather/throw timing remain provisional; runner positions are numerical and no running animation exists. The radar's non-striker marker is schematic because the scene has no 3D non-striker model. These checks are emulated/scripted; physical-device controls, audio, performance and frame pacing remain unverified. The original straight-shot strict-six case remains a failure. Rules and deliberate simplifications are documented in `CRICKET_RULES.md`; physics assumptions are in `PHYSICS_CALIBRATION.md`.

## Codebase audit and priorities

The current code is an offline prototype, not a calibrated cricket simulation or online game. The following observations drive the milestones below:

- **Match lifecycle:** UI callbacks and global mutable delivery state still coordinate renderer and controller. Final-flight innings transitions, stale/duplicate resolution, held-input cancellation and summary idempotency have focused regression coverage. Full matches, repeated persistence, rematch, forced sudden death and saved-event replay pass scripted browser scenarios; physical device interruptions and broad combinations remain open.
- **Scoring and rules:** Longest-six comparison uses unrounded values, distance caps have been removed, and the fixed-step flight resolves first landing and rope order. Wides, no-balls, free hits and LBW remain simplified; shots that are not fielded still estimate non-boundary runs from stopped distance. For fielded low balls, two numerical runners advance between creases while the fielder gathers and throws; a run-out can occur at the threatened wicket. This does not animate batters or model detailed grounding/overthrows. Run speed and gather timing are provisional. Low bounced balls can be intercepted and reachable aerial balls caught using provisional fielding ratings. Bowling has coarse attacking/balanced/deep field presets; bot bowlers default to balanced. A live top-down radar displays current fielder positions, bowler and batters; the non-striker marker is schematic. Catch envelopes and field placements are not calibrated, and catch animations are absent. Stands do not obstruct flight and projected landing through obstacles is not implemented.
- **Delivery, contact and physics:** The incoming delivery uses a shared authored path for rendering and key adjudication points; post-contact flight uses a fixed-step simulation with 30/60/120 fps fixtures. Contact and launch still rely on timing thresholds and hand-tuned shot parameters rather than swept bat/ball collision or measured bat kinematics. No representative held-out delivery/contact dataset has calibrated the system; device cost/frame pacing and independent physics remain open.
- **Controls and UX:** Browser automation covers batting/bowling at 568×240, 667×300 and 1024×768, keyboard activation, pointer flows, side changes, and selected pause/visibility/rotation cases. Emulation does not establish safe-area behavior, simultaneous real touch, audio, accessibility or iOS/Android operation. Physical device and human reviews remain required.
- **Bots and player feedback:** Bot bowling varies pace, spin and swing with seeded decision streams; the synthetic bot simulator includes rated field stops/catches and automated runner/run-out outcomes, and reports legal/extra/wicket/type/fielding denominators. Difficulty fairness and score/outcome distributions are not established by those synthetic runs. Bots and contact outcomes still need representative playtesting and measured targets.
- **Architecture and operations:** Match state records a seed and serializable delivery/shot/outcome events; bounded local history stores setup and results, and `replayMatchRecord` re-applies saved inputs through controller adjudication. This does not reproduce input timing, visuals or animations, and live rendered controls are not deterministic from a seed alone. UI, scene and controller responsibilities remain coupled. Production preview is repeatable; CI, release/rollback procedures, actual-device profiling and performance budgets are open.
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
- Use consistent fixed-step flight and event ordering for bounce, rope crossing and landing; distinguish carry, total distance and boundary outcome. Distance caps have been removed; retain finite/invalid-input guards and tests. Model stadium obstructions or clearly label an unobstructed estimate.
- Calibrate representative shots, launch angles, exit speed and carry against traceable ranges; include extremes, both hands, all aim directions, pace/spin, boundary-on-full and missed-frame cases.
- **Gate:** repeatable end-to-end fixtures connect input → contact → visible trajectory → score and distance, with no NaNs or inconsistent results. Report calibrated scope and deviations instead of a blanket realism claim.

### Phase 5 — credible offline play

- Give the bot varied pace, swing and spin deliveries, selectable sides and skill-based batting; use seeded randomness and measured distributions. Keep the same inputs, rules and adjudication path as a human player.
- Implement AI-controlled teammates and fielders: field placement, reaction, movement, interception, catching and throws affect runs and dismissals, taking each fielder's rating and the actual ball trajectory into account. A player bowling can select attacking, balanced or deep starting positions; bot bowlers currently use balanced. Calibrate strategies and placements. The human controls only their own all-rounder; fielders and other supporting roles are automated. Keep running decisions consistent with that constraint and retain the distance-estimate label until the replacement works.
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

- [MCC Laws of Cricket, 2017 Code, 4th Edition (2026)](https://www.lords.org/getattachment/d9eb43d5-5935-4634-b170-da698e0e9d6e/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29.pdf), especially Laws 19, 21, 22 and 36, and [ICC Men's T20I playing conditions effective July 2025](https://images.icc-cricket.com/image/upload/prd/rz8dfczzfiwa0pwzmcs3.pdf). Tournament conditions can differ.
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
