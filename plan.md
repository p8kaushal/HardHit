# HardHit project plan index

## User priorities — November 14, 2026

1. **Primary:** cricket logic and physics realism. Prioritize decision ordering, delivery/impact/trajectory consistency, and evidence-backed calibration. Keep each increment scoped and document assumptions; do not spend the main effort on fielding polish.
2. **Secondary:** fix batting-camera pitch visibility where the wicketkeeper obstructs the view. Preserve a readable keeper representation and verify both hands and compact landscape layouts.
3. **Secondary:** add a player-controlled auto-run option, enabled by default. When disabled, provide clear run/continue choices and resolve them against the ball/throw timeline; bot running remains automated.

Current branch: `feature/cricket-logic-physics`. The missed-delivery/pad-impact slice is implemented with explicit laboratory assumptions and limitations; see `TODO.md` and `PHYSICS_CALIBRATION.md`. Pending shots record zero distance until physical flight finalizes. The outgoing solver records timestamped SI ground-contact, rope-crossing and rest events; final scoring and saved replay preserve event order. New deliveries use versioned swept finite-blade contact against the shared delivery sampler and record the earliest contact in SI units. The completed contact-kinematics increment shares rendered swing keys and handed pivot geometry, records estimated face offsets plus collision-point/distal-tip velocities, and preserves v1 replay. An isolated 2019 empirical launch-speed candidate is implemented and tested, but gameplay still uses its authored response because raw trials and independent shot-level holdout data are unavailable. Across is world-X because face roll is not modeled; the estimates have not been visually reviewed against rendered impact frames. Phase 4 remains active: the contact-derived vector → flight → score/carry acceptance gate is still open.

Current whole-game mechanics audit and dependency-ordered plan: [REALISM_AUDIT_AND_PLAN.md](REALISM_AUDIT_AND_PLAN.md). A controlled straight-lofted browser trace found first landing at 63.7–72.7 m versus heuristic estimates at 37.1–57.8 m; the heuristic no longer populates pending events. The latest swept-contact browser replay matched 13 saved events and both scorecards (player 4/1, bot 11/0). Never make a strict six fixture pass by weakening its assertion or blindly increasing shot speed.

Dynamic cricket batting studies identify bat speed and 2D impact location as useful predictors, but do not provide a transferable per-player deterministic launch law. See [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md); validate the estimated contact kinematics and ensure live collision and rendered swing agree before fitting any bounded launch response. Do not infer bat speed from the shot label or tune launch coefficients against one strict-six case.

## Repository source map

- `src/game.ts` owns match state, innings/result rules, event recording, and the bridge from a selected delivery/shot to adjudication.
- `src/formula.ts` owns authored incoming delivery geometry, simplified extras/wicket rules, shot-quality helpers, and the current authored outgoing launch response.
- `src/bat-physics.ts` owns the sampled finite-blade collision model, shared swing keyframes, handed pivot anchors, and v1/v2 contact geometry. `src/scene.ts` renders the shared keyframes and pivot.
- `src/ball-physics.ts` and `src/simulate.ts` own fixed-step outgoing flight and seeded offline resolution; `src/fielding.ts` owns fielder and runner timing.
- `src/match-replay.ts` replays serialized match events; `src/match-history.ts` persists them. Keep versioned contact fields optional for old saves and preserve the legacy replay path.
- `src/ui.ts`, `src/input.ts`, `src/touch-controls.ts`, and `src/styles.css` own HUD/control wiring; `src/main.ts` and `src/scene.ts` assemble the browser game.
- `tests/game.test.ts` is the consolidated deterministic suite. `scripts/browser-*.mjs` are the Chromium smoke, match, repeat-match, and replay verification harnesses.

Resume order: inspect `src/bat-impact-response.ts` and its contact-coordinate mapping, then visually inspect rendered v2 contacts for both hands. Obtain independent per-shot measurements/holdouts before assessing prediction error or connecting a response to gameplay. Next extend the outgoing model to direction/elevation/spin only when bat-face orientation and matching data are available; then verify that contact-derived launch, flight, carry and score use one consistent state. Keep the authored launch response and strict-six fixture intact during that work.

## Current account handoff — November 14, 2026

The gameplay-realism goal is active on `feature/cricket-logic-physics`; camera/keeper presentation remains secondary and excluded from this physics slice. On November 14, 2026, the worktree has 162 passing unit tests, a production build with the existing Babylon bundle warning, three browser viewport smoke checks, and a two-innings match whose saved replay matched all 12 recorded events and both scorecards. The current increment adds an isolated empirical speed candidate; it does not change gameplay launch behavior. See `TODO.md` and `PHYSICS_CALIBRATION.md` for acceptance limits and remaining data needs. Do not merge into main without explicit approval. The user previously requested completed feature increments be committed and pushed; retain that instruction.

On November 15, 2026, a bat-pivot regression was fixed: the v2 local pivot offset had been treated as a world-space offset, shifting the rendered bat 0.35 m from its collision path. Restored the hand-relative pivot offsets and included the batter's default root offset in collision coordinates. Both-hand Babylon world-transform fixtures, centered contact checks, 162 unit tests, production build, and the two-innings 13-event browser replay pass. No launch response coefficients changed. Full evidence and limitations are in `TODO.md` and the local `handoff.md`.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and return the ball toward a threatened wicket. Two numerical runners cross between the rendered popping creases during a fielded ground shot; the closest threatened wicket can produce a run-out, including on no-balls/free hits. The ground map shows 13 uniquely tagged, team-colored scene representations: ten fielders, the bowler and two batters. The modeled fielding side has eleven scene representations, but no complete named squad; the non-striker is a role model without a named identity. The seeded bot simulator includes all ten fielders and runner outcomes, and bowlers can choose coarse attacking, balanced or deep starting layouts. A small sprint-with-bat study informs the average speed for a single crease crossing; turn time in repeated runs, fielder gather/throw timing and fielding ratings are not calibrated. Batter motion follows the provisional runner timeline, while detailed animation and strategic field placement remain open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
