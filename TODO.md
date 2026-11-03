# Gameplay to-do

Ordered execution and exit criteria are in `DELIVERY_PLAN.md`. Unchecked items are not verified or complete.

## Match reliability and presentation — current priority

- [x] Prevent repeated rendering of the same match summary from duplicating its leaderboard entry; cover successive matches.
- [ ] Test persistence and summary behavior through repeated rematches and lobby returns in the browser.
- [ ] Exercise repeated full matches, interactive batting, no-balls/free hits, wides, wickets and sudden-death presentation in a real browser; verify sound and errors.
- [x] Cancel held bowling and clear held inputs on pause or focus loss; track the bowling pointer so another finger cannot release it. Cover interruption logic in automated tests and normal pointer/keyboard bowling in an emulated browser.
- [ ] Verify rotation, backgrounding, focus loss, pointer cancellation and simultaneous touch inputs end to end on physical devices, including batting while a delivery is in flight.
- [x] Show both sudden-death innings, including extras, alongside regular-innings scorecards; explain wicket-based decisions accurately and cover the summary with tests.
- [ ] Visually verify sudden-death summary, rematch and lobby return in a browser after a naturally completed tied match.
- [ ] Replace global delivery flags and loosely typed renderer callbacks incrementally with typed, cancellable match events and immutable delivery snapshots.
- [ ] Remove obsolete diagnostic paths and duplicate UI/screen handling after verifying callers; do not discard useful tests.

## Rules, shot and delivery fidelity

- [ ] Document contest-specific scoring and compare wide, no-ball, free-hit, bowled and LBW decisions with applicable laws; add decision-table tests for both hands, offered/no shot and bat/pad order.
- [ ] Clearly identify estimated runs in the no-fielder prototype and design fielding/running before claiming realistic non-boundary scoring.
- [ ] Consolidate authored delivery, contact, shot flight and wicket projection around shared coordinates, time, units and sampled inputs; eliminate competing legacy distance paths where safe.
- [ ] Build traceable calibration fixtures for pace, bounce, swing, spin, contact speed, launch angle and six carry, including symmetry and frame-rate checks; document assumptions and confidence.
- [ ] Model landing/obstructions or label estimated unobstructed carry, and review hard distance caps and boundary geometry.
- [ ] Improve bot delivery variety to include spin and swing, use reproducible seeded inputs, and measure legal-ball, shot, wicket and scoring distributions by difficulty.

## Controls, performance and release

- [ ] Automate landscape phone/tablet viewport and control-accessibility checks for batting and bowling, including safe areas and browser chrome; test actual iOS and Android hardware separately.
- [ ] Profile real-device frame time, loading, input latency and memory; investigate fixed-step catch-up and bundle size before selecting optimization or changing renderer.
- [ ] Add CI, clean-install/build and production smoke checks, deployment configuration and rollback; select staging/production hosting when needed.
- [ ] Design and build server-authoritative 1v1, replayable event logs, private rooms, reconnects, latency handling and two-client tests after offline match behavior is stable.
- [ ] Improve readable gameplay feedback, accessibility, audio and lightweight event-synchronized animations after control and physics priorities are met.

## Batter positioning before delivery

- [x] Add touch and keyboard controls for moving the batter left/right and a limited distance forward/back before release.
- [x] Bound the stance and lock movement at release; apply it to the visible batter, timing, approximate reach, pad impact, LBW and wides.
- [ ] Replace the simplified stance/contact model with spatial bat and body collision, calibrate it for both handednesses, and communicate the stance to a future opponent.
- [ ] Test movement and release locking on physical phones and tablets, including simultaneous touch input.

## Bowler side and delivery angle

- [x] Let the bowler choose over or around the wicket before delivery; mirror release positions for both bowling arms.
- [x] Use the selected release angle in the visible delivery, pitch target, swing, spin, incoming velocity and simplified contact, LBW and wide decisions. Bots also choose a side.
- [ ] Calibrate angle and lateral momentum against measured deliveries; add the side and release parameters to future multiplayer messages.
- [ ] Test both bowling arms and batter handednesses on physical devices, including trajectory-to-marker and umpiring consistency.

## Remaining foundations

- [x] Use a regulation-sized ball for physical ground and wicket calculations; retain an enlarged render for readability.
- [ ] Calibrate ball and bat parameters against measured cricket data; replace the current timing-based contact approximation with spatial bat/ball contact.
- [x] Record a sampled front-foot landing separately from release timing and use it for front-foot no-balls.
- [ ] Calibrate front-foot variability, add a visible delivery-stride/foot replay and cover back-foot faults, wides, LBW and free-hit edge cases.
- [ ] Profile frame pacing and input latency on real phones and tablets; build repeatable multi-device gameplay tests.
- [ ] Add basic character animations after the control and physics foundations are stable, followed by authoritative real-player multiplayer.
