# Gameplay to-do

## Batter positioning before delivery

- [ ] Add accessible touch and keyboard controls for moving the batter left/right and a limited distance forward/back before release. Keep every control usable in compact landscape layouts and avoid obscuring the ball or pitch.
- [ ] Define physical movement limits, starting stance and when movement locks; provide clear feedback for both players.
- [ ] Feed the chosen stance into the visible batter position, bat reach and contact, timing, pad impact, LBW, wides and shot trajectory. Handle left- and right-handed batters consistently.
- [ ] Test movement bounds, lock timing, contact and dismissal decisions, both handednesses, and phone/tablet layouts.

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
