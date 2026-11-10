# HardHit project plan index

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness blocker

The bot batting contact point may disagree with the adjudicated contact point. See the open bug and acceptance checks in `TODO.md` before starting another feature.
