# HardHit project plan index

## User priorities — November 14, 2026

1. **Primary:** cricket logic and physics realism. Prioritize decision ordering, delivery/impact/trajectory consistency, and evidence-backed calibration. Keep each increment scoped and document assumptions; do not spend the main effort on fielding polish.
2. **Secondary:** fix batting-camera pitch visibility where the wicketkeeper obstructs the view. Preserve a readable keeper representation and verify both hands and compact landscape layouts.
3. **Secondary:** add a player-controlled auto-run option, enabled by default. When disabled, provide clear run/continue choices and resolve them against the ball/throw timeline; bot running remains automated.

Current branch: `feature/cricket-logic-physics`. The missed-delivery/pad-impact slice is implemented with explicit laboratory assumptions and limitations; see `TODO.md` and `PHYSICS_CALIBRATION.md`. The first carry invariant is now implemented: pending shots record zero distance and finalized shots take distance from physical flight. Next, unify the trajectory/contact/bounce/rope data as a shared SI event stream before changing contact or launch physics.

Current whole-game mechanics audit and dependency-ordered plan: [REALISM_AUDIT_AND_PLAN.md](REALISM_AUDIT_AND_PLAN.md). A controlled straight-lofted browser trace found first landing at 63.7–72.7 m versus heuristic estimates at 37.1–57.8 m; the heuristic no longer populates pending events. Never make a strict six fixture pass by weakening its assertion or blindly increasing shot speed.

## Current account handoff — November 14, 2026

The gameplay-realism goal is active on `feature/cricket-logic-physics`; camera/keeper presentation remains secondary and excluded from this physics slice. The current test suite passes 158 tests and production build, with the existing Babylon bundle warning. Current verified work removes the pre-flight distance heuristic from pending score events; see the fresh audit and `TODO.md`. Continue with the shared physical event record, then swept bat/ball collision. Do not merge into main without explicit approval. The user previously requested feature work be committed and pushed; retain that instruction for completed verified increments.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and return the ball toward a threatened wicket. Two numerical runners cross between the rendered popping creases during a fielded ground shot; the closest threatened wicket can produce a run-out, including on no-balls/free hits. The ground map shows 13 uniquely tagged, team-colored scene representations: ten fielders, the bowler and two batters. The modeled fielding side has eleven scene representations, but no complete named squad; the non-striker is a role model without a named identity. The seeded bot simulator includes all ten fielders and runner outcomes, and bowlers can choose coarse attacking, balanced or deep starting layouts. A small sprint-with-bat study informs the average speed for a single crease crossing; turn time in repeated runs, fielder gather/throw timing and fielding ratings are not calibrated. Batter motion follows the provisional runner timeline, while detailed animation and strategic field placement remain open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
