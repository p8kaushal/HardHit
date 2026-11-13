# HardHit project plan index

## Active account handoff — November 13, 2026

The user explicitly resumed the non-camera realism goal. Continue on `feature/gameplay-realism-clean`, based on local `main` at `bb0d8d1`; camera batting is excluded. Latest verified commits include persisted-event replay in regular, dismissal-heavy, sudden-death and repeated-browser-match cases. Current evidence and remaining work are summarized at the top of `REALISM_AUDIT_AND_PLAN.md` and in `TODO.md`; the ignored local `handoff.md` carries the account-specific context. Earlier sections below are historical and may refer to other branches or superseded state. Do not merge or deploy.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness gaps

The bot visual contact callback was aligned to the sampled/adjudicated point and passed strict browser checks, including contact variants. Overall readiness remains open: real-device coverage, physical calibration, projected obstacle landings, fielding/running, broad rules coverage and deterministic visual playback are not complete. See `TODO.md` before starting the next bounded increment.
