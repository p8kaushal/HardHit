# Cricket decisions in the current prototype

HardHit is a six-hitting contest, not a complete match of cricket. This document separates its current behavior from full cricket laws so that later changes can be checked against the same assumptions. The geometry and physics described below are approximations, not umpire-grade tracking.

## Contest rules

- Each player receives six **legal** deliveries in the regular innings. A dismissal increases wickets lost but does not end that player's over early.
- The longest six is the primary result. If the longest sixes are tied, fewer wickets wins. When neither player has a six and wickets are level, runs decide. Otherwise, equal wickets and biggest six lead to six count, then total distance. A remaining tie starts a one-legal-ball sudden death for each player.
- Sudden death currently compares survival first, then the distance of the legal delivery. It can finish as a draw. Extras still add runs and do not consume that legal delivery.
- A boundary crossed before the shot first bounces is six; one crossed after a bounce is four. Runs inside the rope are estimated from distance. There are no fielders or manual running yet. The tracked distance is capped at 130 m, and stands do not obstruct the simulated shot.

## No-balls and free hits

The model samples a front-foot heel position from bowling accuracy and pace; a non-negative heel is treated as a no-ball. This is a simplified approximation of the foot-landing test, and is independent of the release timing meter. The game adds one penalty run, retains any runs hit off the bat, and does not count the no-ball as legal. A no-ball takes precedence over a wide.

Following a no-ball, the next legal delivery is a free hit. Another no-ball or wide preserves it. Bowled and LBW are suppressed on no-balls and free hits. This follows the general free-hit structure in ICC men's T20I playing conditions, clause 21.19; it is a contest choice rather than a general rule of every cricket format.

Not yet modeled: back-foot and other no-ball faults, raised and partially grounded foot geometry, actual foot animation/replay, and dismissals still possible on a no-ball or free hit such as run out. The model currently suppresses all dismissals on those balls because those dismissal types do not exist in the prototype.

## Wides

The prototype compares the simulated line at contact with a fixed reach threshold relative to the original and selected batter positions. A delivery reachable from the original stance is not made wide merely by moving away. Bat contact cancels a wide. A wide adds one run and does not count as a legal ball.

This is a simplified line test, not a complete implementation of MCC Law 22 or T20 playing conditions. The batter's path throughout the delivery, actual bat reach and body contact, above-head wides, and format-specific wide markings are not completely modeled. Movement is currently locked at release.

## Bowled and LBW

A missed delivery can be bowled or LBW using a simplified projected path and pad/stump geometry. The incoming path is extended from the modeled popping crease to the rendered stump plane for the wicket test. A no-ball cannot result in either. The model takes batter handedness and stance into account; it rejects LBW when the ball pitches outside leg, or impacts outside off when a shot is offered. If there was no shot, impact outside off can qualify. A ball that misses the modeled wicket is not a wicket.

The projection beyond the crease extrapolates the current approximate path; it is not calibrated, and a missed ball is not yet visibly animated all the way to the stumps. The model does not currently simulate bat-versus-pad contact ordering, full body geometry, a replay, or umpire's-call margins. It must not be presented as a fully accurate LBW decision system. Catches, stumpings, run outs, hit wicket, leg byes and byes are not simulated.

## Reference material

- [MCC Laws of Cricket, 2017 Code, 4th Edition (2026)](https://www.lords.org/getmedia/a4ef9f77-2a25-4f5b-a286-4601f08e6334/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29_5.pdf), especially Laws 21, 22 and 36.
- [ICC Men's Twenty20 International Playing Conditions](https://images.icc-cricket.com/image/upload/prd/rz8dfczzfiwa0pwzmcs3.pdf), especially clauses 21.17–21.19 and 22. Playing conditions can vary by tournament and change over time.

`tests/game.test.ts` covers representative modeled no-ball, free-hit, wide and LBW cases. It does not establish full compliance or physical calibration.
