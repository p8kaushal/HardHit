# HardHit project plan index

## Paused account handoff — November 13, 2026

The user resumed the non-camera realism goal and later paused it after asking to finish the rated ground-fielding step through verification and handoff. `get_goal` reports **paused**. Workspace `/Users/parthkaushal/dev/proj/HardHit`; branch `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. Latest implementation commit: `9e0cf6b feat: integrate rated ground fielding`. The tracked tree is clean. `npm test` passes 133 tests; `npm run build` passes with the existing ~1.09 MB gzip Babylon chunk warning. Browser checks verified a ground-stop scoring reduction and strict lofted boundary-on-full sixes. Current evidence and remaining work are summarized in `TODO.md` and the ignored local `handoff.md`. Earlier sections below are historical and may refer to other branches or superseded state. Do not merge, deploy or push.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

The bot visual contact callback was aligned to the sampled/adjudicated point and passed strict browser checks, including contact variants. Rated fielders now move during the fixed-step flight and can stop reachable low bounced balls; catches, throws, actual running and field-setting controls remain open. Overall readiness also depends on real-device coverage, physical calibration, projected obstacle landings, broad rules coverage and deterministic visual playback. See `TODO.md` before resuming the next bounded increment.
