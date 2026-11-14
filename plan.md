# HardHit project plan index

## Current account handoff — November 14, 2026

The user resumed the non-camera realism goal; it remains active. Workspace `/Users/parthkaushal/dev/proj/HardHit`; branch `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. The fielder return-throw run-estimate increment is committed and verified. `npm test` passes 136 tests; `npm run build` passes with the existing ~1.09 MB gzip Babylon chunk warning. A full browser fielding match verified visible scoring and replay of all 13 saved events against matching scorecards. The estimate is provisional and actual running/run-outs remain open. See `TODO.md`, `DELIVERY_PLAN.md`, `CRICKET_RULES.md` and the ignored local `handoff.md` for current details. Do not merge, deploy or push.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

Rated fielders move during fixed-step flight, stop reachable low bounced balls, catch reachable airborne balls and provide provisional return-throw run estimates. Physical fielding ratings and run-time constants are not calibrated; batter running animation, unsafe run-outs and field-setting controls remain open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
