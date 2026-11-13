# Physics evidence and calibration notes

This document records the scope of measurements used to guide the prototype. Matching a few reference values is not validation of a complete cricket simulator. Values are in metres and seconds unless stated otherwise; the trajectory sampler is deterministic for a fixed delivery. Other game systems still use randomness.

## Incoming pace delivery at the pitch

[James and colleagues, *The playing performance of county cricket pitches* (2004)](https://citeseerx.ist.psu.edu/document?doi=dfa2679a9454ecf27a4fb17157412087db5e5b71&repid=rep1&type=pdf) analysed roughly 3,000 impacts by 82 professional players. For two example pitches, the paper's fitted rebound speeds at a 36 m/s incoming speed correspond to about 87.6% and 90.0% retained **total** speed. These examples describe particular pitches and conditions; they are not a universal bound, and the paper notes that spun-ball rebounds are more variable and difficult to assess in two dimensions.

The current game uses **0.9 retained longitudinal speed** at impact for pace deliveries as an initial approximation. Its existing vertical rebound factor remains 0.55, and lateral movement is still authored. With a centred fast delivery, middle pace, over the wicket and bounce targets at z = −7.5, −3.5 and −1.5 m, the instantaneous total-speed ratios in the regression fixture are approximately 0.890, 0.889 and 0.887 respectively. The fixture allows 0.86–0.92 to account for finite sampling and geometry. This compares different impact speeds and a simplified model to the study examples; it is a plausibility check, not a fit or a claim of measured accuracy.

The selected duration still represents the whole release-to-crease flight. The model advances faster before the bounce and slower after it so that the selected bounce point and total duration remain unchanged. Swing, spin, the pitch sound, the contact point and the projected wicket all use the same delivery-time mapping. Spin currently retains all longitudinal speed as an explicit placeholder: the seam-bowling data above should not be applied to spin without suitable evidence. Air drag, seam orientation, changing pitch conditions and secondary bounces are not yet calibrated.

## Batting reference, not yet calibrated

[Peploe and colleagues, *Relationships between technique and bat speed, post-impact ball speed, and carry distance during a range hitting task in cricket*](https://doi.org/10.1016/j.humov.2018.11.004), studied 20 male batters hitting machine deliveries indoors; the authors' [accepted manuscript](https://www.stuartmcnaylor.com/publication/CB3tech/Peploe_et_al_2019.pdf) reports 239 forward-directed trials. Its reported modeled carry range was 3.5–101.5 m. For central impacts the reported launch speed was 32.3 ± 2.5 m/s and launch angle 28.3 ± 14.5° (mean ± standard deviation). These are sample statistics, not limits on all players or shots; carry was calculated by a flight model rather than directly measured at landing.

The present game uses shot-type presets and timing/contact approximations rather than the study's measured bat kinematics. Do not tune individual shots merely to force this distribution. The next calibration step is to construct traceable input/output fixtures for bat speed, impact position, launch angle and velocity, then compare independent measured deliveries and real-device playback. Stand collisions and projected landings are not modeled.

## Aerodynamics and remaining evidence

The [Cambridge review of cricket-ball swing](https://www.cambridge.org/core/journals/flow/article/review-and-reassessment-of-the-aerodynamics-of-cricket-ball-swing/389B2E66A420FF51FAB3EC2186AFE0AE) describes sensitivity to ball condition, seam, flight and air conditions. Its example of a 4 m/s crosswind changing lateral displacement by about 0.18 m is a model result for a particular delivery, not a universal swing limit. The game's swing slider is an authored approximation; no wind, seam state or spin-dependent aerodynamics have been validated.

Before claiming cricket-grade fidelity, gather appropriately licensed, independent delivery trajectories and bat/ball contact data; specify source, uncertainty and tolerance for each fixture; verify both hands and bowling arms; and compare prediction to measurements not used for tuning. Record limitations when a measurement or physical device is unavailable.
