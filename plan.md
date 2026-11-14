# HardHit project plan index

## Current account handoff — November 14, 2026

The user resumed the non-camera realism goal; it remains active. Workspace `/Users/parthkaushal/dev/proj/HardHit`; branch `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. Automated crease crossings and run-out adjudication, a live field radar, the fielding-aware seeded simulator and three selectable field-layout presets are implemented and committed as `feat: add field radar and automated run-outs`. `npm test` passes 141 tests; `npm run build` passes with the existing ~1.09 MB gzip Babylon chunk warning. Desktop and compact-landscape browser checks verified radar markers/colors/accessibility, field-plan movement, a visible run-out and saved-event replay. Runner speeds, gather/throw timing, fielding ratings and simulation distributions remain provisional; runners have no visual animation and the non-striker marker is schematic. See `TODO.md`, `DELIVERY_PLAN.md`, `CRICKET_RULES.md` and the ignored local `handoff.md` for current details. Do not merge, deploy or push.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and return the ball toward a threatened wicket. Two numerical runners cross between creases during a fielded ground shot; the closest threatened wicket can produce a run-out, including on no-balls/free hits. A live field radar shows fielder, bowler and batter markers with team colors. The seeded bot simulator includes fielding and runner outcomes, and bowlers can choose coarse attacking, balanced or deep starting layouts. Fielding ratings and runner/gather/throw constants are not calibrated; batter movement is not animated, the non-striker radar marker is schematic, and strategic field-placement policy remains open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
