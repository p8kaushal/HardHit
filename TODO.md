# Gameplay to-do

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

- [ ] Calibrate ball and bat parameters against measured cricket data; replace the current timing-based contact approximation with spatial bat/ball contact.
- [x] Record a sampled front-foot landing separately from release timing and use it for front-foot no-balls.
- [ ] Calibrate front-foot variability, add a visible delivery-stride/foot replay and cover back-foot faults, wides, LBW and free-hit edge cases.
- [ ] Profile frame pacing and input latency on real phones and tablets; build repeatable multi-device gameplay tests.
- [ ] Add basic character animations after the control and physics foundations are stable, followed by authoritative real-player multiplayer.
