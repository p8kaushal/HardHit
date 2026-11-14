# HardHit project plan index

## User priorities — November 14, 2026

1. **Primary:** cricket logic and physics realism. Prioritize decision ordering, delivery/impact/trajectory consistency, and evidence-backed calibration. Keep each increment scoped and document assumptions; do not spend the main effort on fielding polish.
2. **Secondary:** fix batting-camera pitch visibility where the wicketkeeper obstructs the view. Preserve a readable keeper representation and verify both hands and compact landscape layouts.
3. **Secondary:** add a player-controlled auto-run option, enabled by default. When disabled, provide clear run/continue choices and resolve them against the ball/throw timeline; bot running remains automated.

Current branch: `feature/cricket-logic-physics`. First bounded logic/physics slice: audit and improve missed-delivery/pad-impact decision ordering, because it feeds LBW, wide, no-ball and free-hit outcomes. Existing uncommitted recovery work is preserved on this branch.

## Current account handoff — November 14, 2026

The non-camera gameplay-realism goal is active on `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. The current scene has ten fielders, the bowler, the striker and a non-striker role model, all represented on the ground map. Live and simulated fielders share pursuit and catch logic; fielded ground shots use numerical runners and return-throw adjudication, with provisional turn timing. The latest verification passes 153 tests and the production build, with the existing Babylon bundle warning. Both innings orders passed browser matches with matching map markers and saved replay; running biomechanics, fielding strategy, physical calibration and device testing remain open. See `TODO.md`, `DELIVERY_PLAN.md`, `CRICKET_RULES.md`, `PHYSICS_CALIBRATION.md` and the ignored local `handoff.md` for details. Do not merge, deploy or push.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and return the ball toward a threatened wicket. Two numerical runners cross between the rendered popping creases during a fielded ground shot; the closest threatened wicket can produce a run-out, including on no-balls/free hits. The ground map shows 13 uniquely tagged, team-colored scene representations: ten fielders, the bowler and two batters. The modeled fielding side has eleven scene representations, but no complete named squad; the non-striker is a role model without a named identity. The seeded bot simulator includes all ten fielders and runner outcomes, and bowlers can choose coarse attacking, balanced or deep starting layouts. A small sprint-with-bat study informs the average speed for a single crease crossing; turn time in repeated runs, fielder gather/throw timing and fielding ratings are not calibrated. Batter motion follows the provisional runner timeline, while detailed animation and strategic field placement remain open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
