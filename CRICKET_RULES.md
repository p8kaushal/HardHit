# Cricket decisions in the current prototype

HardHit is a six-hitting contest, not a complete match of cricket. This document separates its current behavior from full cricket laws so that later changes can be checked against the same assumptions. The geometry and physics described below are approximations, not umpire-grade tracking.

## Standards used for comparison

As of 13 November 2026, the current MCC Laws reference is the 2017 Code, 4th Edition (2026), in force from 1 October 2026. The selected T20 comparison is the ICC Men's Twenty20 International Playing Conditions effective July 2025. HardHit is a custom six-ball contest, so this is a comparison baseline rather than a claim that the game implements every T20I condition. Tournament conditions can vary.

## Contest rules

- Each player receives six **legal** deliveries in the regular innings. A dismissal increases wickets lost but does not end that player's over early.
- The longest six is the primary result. If the longest sixes are tied, fewer wickets wins. When neither player has a six and wickets are level, runs decide. Otherwise, equal wickets and biggest six lead to six count, then total distance. A remaining tie starts a one-legal-ball sudden death for each player.
- Sudden death currently compares survival first, then the distance of the legal delivery. It can finish as a draw. Extras still add runs and do not consume that legal delivery.
- A boundary crossed before the shot first bounces is six; one crossed after a bounce is four. Unfielded runs inside the rope are estimated from distance. A reachable fielder can stop a low bounced ball or catch a reachable airborne ball, changing the score or wicket result subject to no-ball/free-hit protections. For a fielded ground ball, two automated runner positions advance between creases while the fielder gathers and returns the ball. Completed crossings count; if the return reaches the wicket before the runner reaches safety, that runner is out. The model chooses the closest threatened wicket and uses provisional constants (7 m/s runner speed and 0.7 s gather delay); throw speed depends on the fielder's provisional throwing rating, with at most three runs. It does not animate batters, model detailed grounding, or adjudicate overthrows. Run-outs remain possible on no-balls and free hits; catches, bowled and LBW dismissals remain suppressed on those deliveries. While bowling, the player can choose coarse attacking, balanced or deep fielder starting positions; the bot currently uses balanced. The field radar displays the nine fielders, bowler and both batters with team colors; the non-striker marker is schematic. Stands do not obstruct the simulated shot; obstacle collisions and projected landings are not yet modeled.

## No-balls and free hits

The model samples a front-foot heel position from bowling accuracy and pace; a non-negative heel is treated as a no-ball. This is a simplified approximation of the foot-landing test, and is independent of the release timing meter. The game adds one penalty run, retains any runs hit off the bat, and does not count the no-ball as legal. A no-ball takes precedence over a wide, as specified by MCC Law 21.12 and ICC T20I clause 21.13.

Following a no-ball, the next legitimate delivery is a free hit. Another no-ball or wide preserves it. ICC T20I clause 21.19 also limits dismissals on a free hit to the circumstances that apply on a no-ball. HardHit now permits run-outs during a fielded ground shot on these deliveries; catches and the modeled bowled/LBW dismissals remain protected. Hit the ball twice and obstructing the field are not implemented.

Not yet modeled: back-foot and other no-ball faults, raised and partially grounded foot geometry, actual foot animation/replay, and other dismissal types such as hit the ball twice or obstructing the field. Run-out timing and runner paths are simplified and are not calibrated to measured running data.

## Wides

The prototype compares the simulated line at contact with a fixed reach threshold relative to the original and selected batter positions. A delivery reachable from the original stance is not made wide merely by moving away. Bat contact cancels a wide. A wide adds one run and does not count as a legal ball.

This is a simplified line test, not a complete implementation of MCC Law 22 or ICC T20I clause 22. The MCC 2026 law considers where the striker is standing or has stood after the ball comes into play and separately defines a delivery passing over head height after landing. The game does not model the batter's full path during delivery, actual bat reach, ball height for a high wide, or format-specific markings. Movement is currently locked at release.

## Bowled and LBW

A missed delivery can be bowled or LBW using a simplified projected path and pad/stump geometry. The incoming path is extended from the modeled popping crease to the rendered stump plane for the wicket test. A no-ball cannot result in either. The model takes batter handedness and stance into account; it rejects LBW when the ball pitches outside leg, or impacts outside off when a shot is offered. If there was no shot, impact outside off can qualify. A ball that misses the modeled wicket is not a wicket.

The projection beyond the crease extrapolates the current approximate path and is not calibrated. Missed deliveries that avoid the simplified pad model continue visually to the stump plane; a modeled pad impact currently stops the visual without a physical deflection. The model does not currently simulate bat-versus-pad first-contact ordering, full body geometry, umpire's-call margins, or all the evidence required to establish the MCC Law 36 sequence. It must not be presented as a fully accurate LBW decision system. Catches are modeled for reachable airborne shots; run-outs are modeled for fielded ground shots. Stumpings, hit wicket, leg byes and byes are not simulated.

## Existing test coverage

`tests/game.test.ts` verifies modeled no-ball precedence over a wide, penalty and legal-ball accounting, free-hit carry through another no-ball or wide, survival from modeled bowled/LBW and catches on protected deliveries, run-out eligibility on no-balls/free hits, a contacted reachable shot canceling a wide, and the no-ball penalty plus bat runs. Runner tests cover crossings, threatened-wicket run-outs, mirrored hands and boundary precedence. Fixed-step and seeded-simulation tests preserve rope-crossing order, so a ball that crosses before landing remains a six even if its carry simulation continues to first ground contact; a prior bounce remains a four. LBW cases cover pitching outside leg, impact outside off with and without an offered shot, no-ball immunity, right/left-handed lines and projected stump hits. Saved-event replay checks that these adjudications reproduce from recorded inputs.

These are decision fixtures for the current approximation, not certification against MCC or ICC conditions. Still open: sampled foot landing against visible crease geometry, wide height and the full striker path, actual bat-versus-pad order, first body impact, every no-ball fault, exceptions to free-hit dismissal protection, and independent measurements for LBW projection.

## Reference material

- [MCC Laws of Cricket, 2017 Code, 4th Edition (2026)](https://www.lords.org/getattachment/d9eb43d5-5935-4634-b170-da698e0e9d6e/Laws-of-Cricket-2017-Code-4th-Edition-%282026%29.pdf), especially Laws 21, 22 and 36; effective 1 October 2026.
- [ICC Men's Twenty20 International Playing Conditions, effective July 2025](https://images.icc-cricket.com/image/upload/prd/rz8dfczzfiwa0pwzmcs3.pdf), especially clauses 21.13, 21.17–21.19 and 22. Playing conditions can vary by tournament.

`tests/game.test.ts` covers representative modeled no-ball, free-hit, wide and LBW cases. It does not establish full compliance or physical calibration.
