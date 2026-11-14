# HardHit project plan index

## Current account handoff — November 14, 2026

The user resumed the non-camera realism goal; it remains active. Workspace `/Users/parthkaushal/dev/proj/HardHit`; branch `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. Automated crease crossings/run-outs, the player-readable ground map, fielding-aware seeded simulation, on-the-full bot scoring, crease-aligned runner adjudication and protected-delivery replay are committed (`b29d2e4`, `b59184f`, `0c47cf7`, `871fc36`), along with the latest ground-map enhancement. The map gives the 12 modeled scene players unique role/position tags in team colors, improves the stadium frame and expands on short landscape screens. `npm test` passes 143 tests; `npm run build` passes with the existing ~1.09 MB gzip Babylon chunk warning. Desktop browser verification passed all field presets, a live keeper run-out and 13-event replay; compact 667×300 verification passed tag/color/collapse sizing. Runner speed is supported by a small study for a single run, but repeated-run turns, gather/throw timing and fielding ratings remain uncalibrated; runners have no visual animation and the non-striker is a crease marker. The map represents only the 12 current scene objects, not full team rosters; fielders are identified by position. Seeded bot distributions remain synthetic and are not fairness calibration. See `TODO.md`, `DELIVERY_PLAN.md`, `CRICKET_RULES.md`, `PHYSICS_CALIBRATION.md` and the ignored local `handoff.md` for current details. Do not merge, deploy or push.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and return the ball toward a threatened wicket. Two numerical runners cross between the rendered popping creases during a fielded ground shot; the closest threatened wicket can produce a run-out, including on no-balls/free hits. The ground map shows uniquely tagged, team-colored markers for nine fielders, bowler and two batters, refreshed from scene coordinates. This is the 12 player representations currently modeled, not full 22-player rosters; the non-striker marker is schematic. The seeded bot simulator includes fielding and runner outcomes, and bowlers can choose coarse attacking, balanced or deep starting layouts. A small sprint-with-bat study informs the average speed for a single crease crossing; turn time in repeated runs, fielder gather/throw timing and fielding ratings are not calibrated. Batter movement is not animated and strategic field-placement policy remains open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
