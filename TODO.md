# Gameplay to-do

## Batter positioning before delivery

- [x] Add touch and keyboard controls for moving the batter left/right and a limited distance forward/back before release.
- [x] Bound the stance and lock movement at release; apply it to the visible batter, timing, approximate reach, pad impact, LBW and wides.
- [ ] Replace the simplified stance/contact model with spatial bat and body collision, calibrate it for both handednesses, and communicate the stance to a future opponent.
- [ ] Test movement and release locking on physical phones and tablets, including simultaneous touch input.

## Bowler side and delivery angle

- [ ] Let the bowler choose over or around the wicket before delivery, with clear left/right and handedness feedback.
- [ ] Carry the selected release position and angle through the entire delivery model: visual release, pitch target, swing, bounce, spin, incoming velocity, bat/pad impact, stumps, LBW, wides and shot outcomes. Keep the landing marker aligned with the actual trajectory.
- [ ] Update bot choices, cameras, controls, delivery feedback and multiplayer messages to use the same side/angle choice.
- [ ] Test both bowling arms, both batter handednesses, both sides, pace and spin, and trajectory-to-marker and umpiring consistency.

## Remaining foundations

- [ ] Calibrate ball and bat parameters against measured cricket data; replace the current timing-based contact approximation with spatial bat/ball contact.
- [ ] Replace timing-derived no-balls with a modeled front-foot decision and complete wide, LBW and free-hit cases.
- [ ] Profile frame pacing and input latency on real phones and tablets; build repeatable multi-device gameplay tests.
- [ ] Add basic character animations after the control and physics foundations are stable, followed by authoritative real-player multiplayer.
