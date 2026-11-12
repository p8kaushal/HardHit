# HardHit project plan index

## Reject delayed pose frames

Inference results arriving more than 500 ms after frame submission are discarded, their overlay is cleared and the preview reports a delay. Fresh frames can resume tracking; continued delay eventually resets calibrated movement through the existing loss handling. This prevents stale poses being applied but can make tracking unavailable on slow devices; the threshold is not yet validated on real hardware. Verified with 118 unit tests, a production build and the camera browser regression, including an intentionally held result and fresh-frame recovery.

## Recover from brief torso occlusion

After a valid tracked pose, loss of required torso landmarks holds that pose for up to 500 ms, marks X-ray joints uncertain and resumes without recalibration if tracking returns. Longer loss resets calibration; interruption and watchdog behavior remain in place. The status explains the hold. Verified with 118 unit tests, production build and camera browser regression covering short loss, X-ray uncertainty, recovery, prolonged loss and lifecycle. Live-camera feel remains unverified.

## Consistent landmark coordinates during partial tracking

Each limb, torso and head angle now uses a complete, finite set of 3D landmarks or falls back to screen coordinates for that entire calculation. This prevents a missing or invalid world landmark from mixing unrelated coordinate spaces in a single angle. Transitions between the two estimates can still cause motion because they are not equivalent. Verified with 117 unit tests (including partial depth loss, mirrored input and recovery), a production build and the camera browser regression. Live-camera behavior remains unverified.

## Recorded replay coverage

The replay reports confident rendered samples and mismatches for each segment, including zero coverage, and optionally requires selected segments. The user's existing recording passed with both shoulders required (4,609 total comparisons); both lower legs and feet had zero coverage. A separate run requiring the left foot correctly failed for lack of coverage. Counts are render samples, not independent video frames, and agreement with pose-model targets does not establish physical accuracy.

## Recorded-motion limb alignment checks

The local replay now compares rendered arm, leg, hand and foot segment directions against the pose model's current targets only when both endpoint landmarks are visible. It also counts coverage and checks finite rig output, X-ray placement, cleanup and practice isolation. Two runs using the user's cropped screen recording passed; the second made 4,479 confident pose-target comparisons with none exceeding the 10-degree test tolerance. Both feet were visible in zero frames, so this does not validate the foot segments. The comparisons establish that the rig followed the model's own targets in this fixture; they do not establish that those targets accurately represented the person. The recording contains preview overlays and remains outside the repository.

## Local recorded camera-motion replay

Added `scripts/browser-pose-replay.mjs`, which accepts an explicitly supplied pre-cropped camera-view WebM and optional seek time. It feeds changing frames through the real pose worker and calibrated character, checks finite poses and rendered X-ray joint positions, verifies that movement occurs without scoring or changing saved progression, and confirms camera and X-ray cleanup on exit. It prints aggregate counts only; recordings and extracted clips remain outside the repository.

Two final isolated runs using a locally cropped, mirrored-back section of the user's screen recording passed. The later run processed 146 person frames and 727 rig samples, with finite outputs and no measured X-ray marker mismatch; both feet were visible in zero frames. The input already contained preview overlays and is not independently annotated ground truth, so it does not establish movement accuracy or validate feet. An earlier run timed out around a server restart; the cause is unconfirmed. The harness now provides playback diagnostics on timeout, and both subsequent runs passed.

## Camera movement: hands, feet, head and confidence

The user requested a larger movement increment before live testing and asked for a focused commit after each verified stage. The skinned rig now uses visible wrist-to-index and ankle-to-toe landmarks for approximate hand and foot direction; short occlusion holds the last direction before falling back. When both ears are usable, an approximate head turn is calculated relative to body facing, with mirrored handling and occlusion fallback. The X-ray adds index and toe model points where the skinned model provides them, and colors markers green for visible corresponding camera landmarks or amber when uncertain/not tracked. The fallback figure has no separate finger or toe endpoints. This does not provide detailed finger articulation, reliable palm roll, gaze tracking, physical bat tracking or automatic batting.

Verified: 116 unit tests, production build, development camera browser test (including all twelve limb/hand/foot directions, mirrored inputs, head movement and X-ray confidence), playzone/fallback regression, bowling-practice regression, production camera preview and full-match checks. See the separate recorded-camera replay above. Actual-camera hand, foot and head fidelity, particularly side-on and occluded poses, remains open.

The older camera/practice work accumulated before the user's commit request and is captured as a consolidated verified baseline rather than represented as a sequence of historical stage commits. Future verified increments should be committed separately. Preserve the existing workspace and keep recordings outside the repository.

## Hand-motion intensity calibration preview

The opt-in two-hand preview offers explicit gentler and stronger sample recording. A stronger sample must exceed the gentler sample by at least 20% and 0.5 torso lengths/s; a later detected movement is shown as a clamped percentage between the two. Samples are held in memory, survive changes between batting modes, and are cleared when pose tracking or the preview stops. Interrupting a pending sample cancels it. Both samples must exceed the existing detection threshold; this is a comparison of image-based hand motion, not bat speed, physical power, shot choice or gameplay input.

Verified: 114 unit tests, production build, development and production camera browser checks (synthetic sample recording, rejection, midpoint, lifecycle and scoring isolation), playzone regression and bowling-practice browser check passed. The development screenshot of the controls was inspected. Thresholds, repeatability, camera latency and correlation with actual swings or power remain unverified on real cameras.

## Hand-motion direction preview

The opt-in hand-motion diagnostic reports the direction of the hands' furthest displacement in the mirrored camera image, not a cricket-field shot direction. Detection retains that furthest displacement when the hands return toward their starting point; timing continues to use the peak-speed frame. It still does not detect the bat, classify a shot, or change gameplay. The provisional thresholds, camera-view directions and false positives remain to be checked against live swings.

Verified: 113 unit tests, production build, camera browser check including a synthetic out-and-back movement and mirrored direction, playzone regression, and production camera preview with a person-image fixture passed. The browser check also retains timing, pause and score-isolation coverage. The production fixture checks model/preview operation, not movement accuracy; no live swing was tested.

## Practice hand-motion timing preview

The opt-in hand-motion preview can now compare its estimated peak hand-speed frame with the modeled contact time of the current practice delivery. A negative/early or positive/late difference is shown as milliseconds before or after modeled contact. This is diagnostic: peak hand speed is not bat contact, the frame-submission timestamp is not an independently measured exposure time, and camera/model latency and detection thresholds remain uncalibrated. It never registers a shot or changes the score. Delivery generations and release/contact windows reject unrelated movement, and pause revisions discard old in-flight camera frames and reset gesture state.

Verified: 112 unit tests, production build, camera browser check with synthetic timing approximately 80 ms before modeled contact, pause-crossing and stale-frame rejection, unchanged manual shot behavior, rotation/gameplay browser smoke, and production camera preview with a person-image fixture passed. The first pause browser test attempted calibration before a fresh frame arrived; it was updated to wait for a fresh frame and passed. Live timing accuracy and true bat-contact validation remain open.

## Experimental two-hand movement preview

An opt-in practice preview detects fast two-wrist movement after a brief still period and displays duration and peak speed relative to apparent torso length. The pose worker supplies the frame-submission timestamp; this is not a measured bat-contact time. The preview does not detect a bat, identify shot type or direction, estimate power, register a shot, change scores or access match progression. Low-confidence hands, frame gaps, implausible jumps, mode changes and interruption reset or block detection. The thresholds are provisional and require real recorded swings and device testing before they can inform gameplay.

Verified: 111 unit tests, production build, camera browser test, batting and bowling practice browser checks, and production camera preview with a person-image fixture passed. Tests cover synthetic movement, body translation, short twitches, frame gaps, confidence loss, timestamps, opt-in behavior, unchanged score/storage and mode reset. The first browser run sampled foot height between render updates and failed; the isolated rerun passed and the assertion now waits for a rendered pose. No live swing, bat detection, latency or accuracy validation has been performed.

## Limb retargeting revision from second recording

The user's second recording showed raised or twisted model arms while the user's arms were down or differently positioned; the preview did not include the full legs. The skinned and fallback rigs now align individual arm and leg segments to tracked camera-relative directions instead of applying changes on top of the pre-bent bind pose. Brief missing-landmark frames retain the last direction; longer loss eases the limb toward neutral. The rig visually compensates if its foot joints fall below the pitch; this does not change gameplay position. The status prompts for a front-facing view if turning direction is unavailable. Live-camera limb fidelity, foot geometry and side-on occlusion remain open.

Verified: 110 unit tests and production build; camera browser tests with X-ray checked all eight rendered limb directions in both mirror modes, arm movement, turns, bend, neutral/loss, foot-joint ground height and a manual shot while tracking. The fallback rig's tracked arm, X-ray and return to manual animation were exercised in the playzone browser. Batting and bowling practice, a batting-first full match (before the fallback/ground refinements), a bowling-first full match (after fallback), and production pose preview with a person-image fixture passed. A cropped frame from the earlier recording was inspected locally after the final change; this is not a live-motion test. The source recordings remain outside the repository.

## Camera turning, posture and joint X-ray

Calibration now asks the user to stand upright facing the camera. Shoulder orientation is tracked continuously through left and right turns, using that front-facing reference; the old mapping folded the back-facing direction onto the front. Torso bend now drives both spine and chest, and an initial rig correction straightens the imported model's bent torso relative to an upright calibration. The optional X-ray draws the character's actual 17 driven joint locations and bone links through the body, with fallback support; it turns off when leaving batting practice. Single-camera depth, back-facing occlusion and true joint accuracy remain unverified in live use.

Verified: 110 unit tests, production build, camera browser tests, and playzone regression passed. Camera tests enabled X-ray, checked marker alignment with actual model joints, rendered a screenshot for visual inspection, exercised both turn directions and mirror behavior, and checked actual torso-joint movement during a synthetic bend. A frame from the user's earlier recording was also used to inspect the upright reference. This does not prove real-camera motion accuracy.

## Fix camera-facing alignment from user recording

The user's recording showed the character facing across the pitch while the user faced the camera. A frame from the recording reproduced a nearly front-facing pose estimate but an approximately sideways rendered model. The rig now aligns the actual rendered shoulders and foot direction after the tracking pose is applied, rather than relying solely on the imported bind pose. The same recording frame produced an approximately pitch-aligned model after the change. The camera test now checks alignment after it settles as well as checking turn and bat behavior. The recording showed the user's feet outside the camera view, so full leg tracking was unavailable; posture and live motion remain unverified.

Verified: 110 unit tests, production build and camera browser test passed. A local simulated camera using a cropped frame from the user's recording verified the corrected model orientation; the recording and frame are not part of the repository. Actual live-camera confirmation remains open.

## Camera-facing body orientation and bat visibility

During pose tracking the visual bat is hidden and returns when tracking stops. The model aligns its shoulders and foot direction toward the bowler end when the tracked person faces the camera; shoulder-depth estimates drive a bounded, smoothed turn, with mirror handling. Rig axes are recalculated as the character turns. The mapping is visual only and does not change scoring or infer shots. Single-camera shoulder depth can be inaccurate or ambiguous, particularly side-on or turned away; live-camera review remains open.

Verified: 110 unit tests, production build, camera browser test and playzone browser regression passed. Simulated tests cover front alignment using the imported model's shoulders and toe direction, a shoulder-depth turn, mirrored turn sign, absent depth and bat visibility restoration. They do not establish actual-camera accuracy.

## Camera tracking responsiveness and depth

The user reports the current mapping kind of works. Brief per-limb landmark loss now holds the last pose for 300 ms before easing toward neutral; larger joint movements respond faster. An optional forward/back visual movement estimates distance from apparent torso size and is bounded and off by default. It can drift with body orientation or bending and does not affect gameplay position. The user's live-camera feedback is still needed to assess movement quality and whether depth is useful.

Verified: 110 unit tests, production build and camera browser test passed. Unit tests cover short and long landmark dropout, recovery and apparent-size depth; the browser test checks that depth is opt-in and leaves gameplay position unchanged. These tests do not verify live-camera behavior.

## Camera whole-body movement revision

The user reported mirrored movement works but legs and body barely respond. Camera-driven rotations now account for the imported bones' bind axes and the camera orientation; mirrored movement defaults on. A bounded visual offset follows camera-relative sideways movement and crouching without changing the batter's gameplay position. The camera status warns when leg landmarks are not visible. Calibration remains relative to the initial stance, and depth translation, reliable foot contact, hands, the bat and full pose fidelity remain open. Live-camera review is needed to determine whether leg motion and directions are correct.

Verified: 110 unit tests, production build, camera browser test and playzone browser regression passed. The camera browser test injects synthetic landmarks, checks that a knee movement moves the imported model's foot, checks body movement without changing gameplay position, and exercises leg visibility and reset. This does not validate real movement fidelity.

## Camera calibration and movement revision

Calibration is available in free movement and batting practice, and its status explains success or missing torso landmarks. The pose worker now supplies estimated 3D landmarks; the mapping uses depth as well as image-plane movement for arms and legs, plus approximate upper-body and head rotation. Individual missing limbs no longer cancel the whole session; missing torso, stalled tracking or session interruption resets calibration. The calibrated stance is the reference, so it does not immediately reproduce the player's static pose. The mapping is experimental and does not replicate every movement: body translation, accurate 3D joint orientations, hands and bat remain open. User camera testing is required.

Verification: 110 unit tests, build, camera browser test (including calibration in both modes, movement and occlusion), production person-image camera preview and playzone regression passed. These automated fixtures do not establish live-camera fidelity.

## Current stage: calibrated camera movement in free practice

An optional enlarged camera preview and experimental calibration are available. Once tracking sees the full body, the user can calibrate a neutral stance and try camera-relative 2D arm and leg movement on the batter in free movement. A mirror option requires recalibration. Missing or low-confidence landmarks, stalled tracking, mode changes and stopping the camera reset the pose; manual shots remain separate. This is a bounded, smoothed 2D approximation, not 3D pose reconstruction, bat detection, shot inference or match control. Live motion, side-on stances, handedness, occlusion and latency still need user testing.

Verified: 110 unit tests, production build, development camera browser test with synthetic landmark movement and tracking loss, playzone regression, and production camera preview using a person image. Browser fixtures do not establish real-camera movement quality. The user previously confirmed that pose tracking became available after its startup failure; the original failure's cause remains unknown.

## Desktop portrait play

The rotation prompt and orientation pause now apply only when the primary pointer is coarse. Desktop portrait windows remain playable, and hidden-page pausing remains in effect. Verified with 109 unit tests, a production build, the playzone browser test (including desktop portrait clock progression), and touch-emulated browser smoke including rotation. Actual phones, tablets and hybrid devices remain untested; pointer capability is a browser-reported approximation of device type.

## Camera batting stage 7 — pose tracking preview

Implemented an opt-in MediaPipe Pose Landmarker Lite preview in free movement and batting practice. A worker processes at most one frame at a time, with a 15 fps submission cap; the mirrored camera preview shows 2D landmarks and basic framing feedback. The model and WebAssembly assets are served locally. Starting tracking, cancelling loading, model failures, switching to bowling, stopping the camera, hiding the page and leaving practice are handled. The UI discloses that Google documents on-device frame processing and possible MediaPipe Tasks performance metrics. Pose tracking is preview-only: it does not animate the batter, detect the bat, infer shots or control gameplay.

Verification: `npm test` passed 109 tests; `npm run build`, `npm run test:camera-preview`, `npm run test:playzone`, `npm run test:bowling-playzone` and production browser smoke passed during this stage. After restoring the existing Vite configuration and adding prebundling, the build and development camera test passed again. The final production build's pose tracker also detected a person and drew an overlay from Google's test image via `HARDHIT_POSE_FIXTURE=/private/tmp/hardhit-pose-fixture.jpg node scripts/browser-camera-preview.mjs --preview`; the image is temporary and not in the repository. The camera test also covers blank frames, simulated model failure/retry, cancellation, mode switching and camera cleanup. An initial concurrent development run failed while Vite servers reoptimized dependencies; the isolated rerun passed. An earlier production failure-injection attempt timed out because worker requests were not reliably intercepted; the test now supplies a missing model URL and passed.

Limitations: the user cannot currently test a real camera; device compatibility, latency, motion quality, physical framing and end-to-end gameplay are unverified. Google documents possible MediaPipe Tasks metrics; see its [privacy notice](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/tasks/web/vision#privacy-notice). The runtime-only npm audit reported zero vulnerabilities; the full development dependency audit reported seven advisories (one moderate, six high). The existing Babylon bundle warning remains, the pose runtime adds roughly 14 MB of WebAssembly plus a 5.5 MB model on demand, and no lint script exists. The README describes the preview and its limitations.

Stage 7 was presented and the user authorized continuing. See the current stage above; swing and shot inference remain future work.

## Camera batting stage 6 — setup and preview

Free movement and batting practice now offer an explicitly started local camera preview. The stream is stopped on request, practice exit, bowling mode, page hiding or page exit; a late permission result is stopped without disturbing a newer session. Permission denial, missing/busy devices, disconnection and unsupported browsers show actionable messages. The preview does not send camera data to a server. It does not yet estimate pose or control batting.

Manual test: run `npm run dev`, open the localhost address in a camera-capable browser, enter Cricket Playzone and expand Camera setup in the right panel. Start the camera and allow permission; stand back and confirm the full body is visible. Stop and restart the camera; switch between free movement and batting practice, then switch to bowling or exit and check the browser camera indicator turns off. Hide and return to the tab, and try denying permission. On HTTPS or localhost, repeat with a real phone or tablet.

Verified: `npm test` passed 109 tests; `npm run test:camera-preview`, `npm run test:playzone`, `npm run test:bowling-playzone` and `npm run test:production` passed. The camera browser test uses simulated video and verifies rendered frames, opt-in access, lifecycle cleanup, a stale permission race, errors and touch access; physical cameras and devices remain untested. No lint script is configured. The existing Babylon bundle-size warning remains.

## Bot delivery contact alignment

Human-bowled deliveries now resolve at the same sampled contact point used for adjudication, with the bot swing triggered approximately 150 ms beforehand. If a frame crosses both thresholds, the swing is triggered before the delivery resolves. The swing still uses a fixed visual lead; individual early/late bot timing and actual bat/ball collision remain unmodeled and need separate work.

Testing: run `npm run dev`, open Bowling practice, choose pace and spin deliveries and bowl to the bot; check that the outgoing hit or missed-ball continuation starts where the incoming ball meets the batter. Repeat while bowling in a match. Run `npm test`, `npm run test:bowling-playzone`, `npm run test:playzone`, `npm run test:match`, `npm run test:match:bat-first`, `npm run test:match:sudden` and `npm run test:production` for automated coverage. The unit test checks pace and both spin types at normal and reduced frame rates, including crossing swing and contact in one frame. Browser instrumentation checks the visible contact coordinates and the bot shot recorded by the match.

Verified: 109 unit tests, both practice browser checks, both full-match innings orders, sudden death and production smoke passed. The match-order checks passed before the final test-only assertion was strengthened; the bowling-first match was then rerun with the recorded-shot assertion. Physical devices and precise visual bat/ball intersection remain unverified. No lint script is configured; the existing Babylon bundle-size warning remains.

## Current micro-step: bowling practice layout and regression audit

Bowling practice now places line, length and pitch aiming on the left, with delivery type, pace, movement and side on the right. Opponent and display settings expand on demand. The primary controls are accessible without panel scrolling in 667×300 and 568×240 touch-emulated landscape views. The opponent section resets closed on re-entry.

Manual test: open Cricket Playzone → Bowling practice. Set a target with the left selectors, map or 3D pitch, and adjust the delivery on the right. Expand Bot batter to change shot style, difficulty and handedness, and Display to change ball following and outcome feedback. Hold and release Space or the bowling button; check the result and repeat. Test the same interactions on an actual landscape phone or tablet. Expanded secondary settings may scroll on very short screens.

The regression audit ran all configured unit, practice, browser, production and match scripts, including both innings orders, batting, rematch and a forced sudden-death fixture. The lofted match run completed but scored no six; the existing unit test verifies six finalization, while a browser-confirmed six remains open. The existing bot visual-contact discrepancy, real-device testing, unimplemented webcam tracking, lack of a lint script and Babylon bundle-size warning also remain open; the game cannot yet be called issue-free or ready for the next phase without addressing the blocker below.

## Bowling playzone

Bowling practice is available in Cricket Playzone. The player sets delivery type, line, length, pace, swing or spin and bowling side; the bot can use simulated shot selection or a chosen shot type, Rookie/Medium/Hard difficulty, and either batting hand. Hold Space or the bowling button and release against the meter. Each session is unlimited and does not update match progression or the leaderboard. The bot's skill and shot timing use the existing match bot, so shot styles are the game's four batting archetypes rather than named cricket strokes.

Testing: `npm test` passed 108 tests; `npm run test:bowling-playzone`, `npm run test:playzone`, and `npm run test:production` passed. The bowling browser test checks a Hard left-handed defensive bot, mirrored off-side aim, spin, bowling side, release timing, interruption, storage isolation and touch controls. Desktop and 667×300 touch-emulated layouts were visually checked. Physical-device testing remains open, and the existing Babylon bundle-size warning remains.

## Practice spin and simulated bowling

Manual off spin and leg spin expose a 0–100% spin slider. Repeat selected delivery repeats manual settings. Simulated bowler uses the match bot with Rookie, Medium or Hard difficulty and automatically bowls successive balls; difficulty changes apply to the next ball. The current match bot varies line and length, while delivery type is determined by its pace rating.

Testing: `npm test` passed 108 tests, `npm run build` and `npm run test:production` passed, and `npm run test:playzone` verified spin changes the trajectory, manual repeats preserve settings, bot difficulty changes on the next ball, mode cancellation, and touch access. Desktop settings were visually checked. Physical devices remain untested; the existing Babylon bundle-size warning remains.

## Practice shot selection styling

The selected touch shot now uses the game's green and gold palette and stays synchronized with keyboard and menu selection. Verified with 108 unit tests, a production build and the playzone browser check; the selected state was also visually checked at 667×300 in a touch-emulated browser. Physical devices remain untested.

## Practice controls and direction

Current micro-step: present the split practice controls and direction fix for review. Direction is synchronized across the menu, keyboard and touch stick; practice keeps a fixed batting view while the ball travels so different shot directions remain visible.

Testing: `npm test` passed 108 tests, including all eight computed shot directions. `npm run test:playzone` passed desktop and touch-emulated practice, configuration and controls, left/right ball displacement, auto bowl, cancellation, model fallback, re-entry and match entry. `npm run test:production` passed the production build and smoke checks; the production build and playzone test were repeated after the final small-screen adjustments. Desktop and 667×300 touch-emulated split layouts were visually checked. Physical touch devices remain unverified. The existing Babylon bundle-size warning remains.

## Playzone orientation and usability

Current micro-step: present the revised playzone for review. The imported model now faces the bowler; free practice previews shot, direction and footwork changes. The delivery settings, action button, touch aim and movement controls have been reorganized around the field. Auto bowl starts off so settings can be chosen before the first ball.

Testing: run `npm run dev`, open **Batting Playzone**, and change shot type, direction and footwork in free movement to see previews. Switch to practice deliveries, set a ball, press **Next ball**, and time the swing. Turn on Auto bowl for continuous practice. `npm test` (108 tests), `npm run test:playzone`, `npm run test:production`, and `npm run test:match:bat-first` passed. Desktop and 667×300 touch-emulated views were visually inspected; physical-device and camera tracking tests remain open.

## Camera batting — stage 5 swing strength

Current micro-step: present the swing strength implementation for review before beginning the next stage. Camera capture and user-facing power calibration remain later stages.

`ShotChoice.strength` accepts a normalized 0–1 value. A bounded factor from 0.4 to 1 scales estimated distance and launch velocity; omitted or non-finite strength uses the existing full-strength behavior. Actual carry is calculated by the ball physics and therefore does not scale linearly with launch speed. Existing keyboard, touch and bot inputs omit strength.

Testing: `npm test` checks boundary handling, unchanged legacy shots, stored strength and shorter simulated flight at lower strength. `npm run test:playzone` and `npm run test:match:bat-first` exercise the existing input paths; `npm run build` checks the production bundle. All passed (108 unit tests). The browser interfaces do not yet provide a strength input; camera calibration comes later. The existing Babylon bundle-size warning remains.

## Simplified batter model revision

Current micro-step: present the implemented and verified skinned model for review. The referenced X clip was not accessible directly; do not claim an exact visual match.

Model decision: use the CC0 Quaternius low-poly humanoid distributed at https://github.com/UMRAM-Bilkent/supine-human-model as `assets/human.glb`. The file has one skinned body mesh and 41 skeletal joints; it is loaded directly with the Babylon glTF loader, without Blender. A 15-bone rigid mannequin was also considered but has fewer independently controllable body joints. The existing 17-joint logical pose interface drives mapped bones, with the bat following the active hand; the old figure is a fallback if loading fails. Full landmark-to-skeleton retargeting, two-hand bat constraints, and physical camera validation remain future work.

Testing: run `npm run dev`, open Batting Playzone and use free movement to view the character and swing; change shot direction to compare swings. Run `npm test`, `npm run test:playzone`, `npm run test:production` and `npm run test:match:bat-first` for automated checks. The model uses the source's neutral low-poly appearance; visual comparison to the inaccessible clip and physical camera tracking are not verified.

Verification: 106 unit tests, production build and browser smoke, the complete bat-first match, and the playzone browser test passed. The playzone check confirms both skinned-model loading and the fallback when the model request fails. A local browser screenshot was inspected for the resting and swinging character; no physical-device or camera-tracking tests were performed. The existing Babylon bundle-size warning remains.

## Camera batting — stage 1 baseline

Stage 1 was presented for review; the user authorized Stage 2.

## Camera batting — stage 2 shared batting behavior

Stage 2 was presented for review; the user authorized Stage 3.

## Camera batting — stage 3 articulated batter

Stage 3 was presented for review; the user continued to Stage 4.

## Camera batting — stage 4 batting playzone

Current revision micro-step: present the articulated character and match-like unlimited practice changes for review.

Revision verification: 106 unit tests, `npm run test:playzone`, and `npm run test:production` passed. The practice browser check covers keyboard shot selection, direction, footwork, run-up, scoring, repeat, cancellation, re-entry and storage isolation. Manual visual and physical-camera validation remain open.

To try the revision: open Batting Playzone, use Free movement to compare swings aimed in different directions, then select Practice deliveries. Deliveries repeat, with no innings limit; W/A/S/D aim, 1–4 choose shots, Q/E choose footwork, I/J/K/L move and Space swings. The panel keeps delivery settings and shows the practice score. Touch users can drag the aim stick and tap a shot. The joint pose interface expects already-retargeted local rotations; webcam tracking and automatic bat direction are not yet implemented.

Practice retains configurable delivery and repeat controls inspired by Don Bradman Cricket's practice nets and training modes with repeatable scenarios: https://dlassets-ssl.xboxlive.com/public/content/63f28171-42f2-4df3-a7c8-af2a4b2a75aa/GameManual/80aeb277-2c5a-4c3b-895b-9e99c8d2bc03/en-HK/index.html and https://game.capcom.com/manual/SF6/en/ps5/page/8/6.

Current micro-step: present the verified playzone for review before starting the next stage.

Verification: `npm test` passed 106 tests; `npm run test:playzone` passed free swing, practice delivery, repeat, cancellation, re-entry, match entry and storage isolation; `npm run test:production` passed the production build and existing browser smoke checks. The existing Babylon bundle-size warning remains. Physical-device and visual animation checks remain open.

### Stage 4 testing guide

1. Run `npm run dev`, open the shown localhost address, and choose **Batting Playzone** in the lobby.
2. In **Free movement**, use the arrow buttons or I/J/K/L and click **Swing** or press Space. Check that the character moves and swings.
3. Choose **Practice deliveries**, select delivery type, line, length and pace, then press **Bowl**. Choose a shot and direction and swing as the ball arrives. Check the timing and outcome feedback.
4. Enable **Repeat deliveries** to bowl continuously. Switch to free movement during a delivery to cancel it, then exit and re-enter the playzone. Start a normal match and check that it works; the practice session does not add a leaderboard entry or change player XP.
5. Run `npm run test:playzone` for the automated browser checks. Camera control is not available at this stage.

Verification: `npm test` passed 106 tests; `npm run build`, `npm run test:production`, `npm run test:match:batting` and `npm run test:match:bat-first` passed. The existing Babylon bundle-size warning remains. Automated browser checks verify match behavior, not visual animation quality; manual visual review is still needed.

### Stage 3 testing guide

- Run `npm test` to check joint hierarchy, fixed joint offsets, rotation bounds, invalid pose rejection and handedness/bat attachment, together with the existing game tests.
- Run `npm run dev`, open the displayed localhost URL and start a match. Bat and swing using Space or a shot button, then bowl and watch the bot bat. Check that the batter's arm and bat move together, the bat stays attached, and the batter returns to its stance after each swing. Complete both innings to check both human and bot paths.
- Both handedness values are covered by the rig unit test; there is currently no lobby control to switch batting hand. Camera mirroring and the playzone are not implemented yet.

Verification: `npm test` passed 105 tests; `npm run test:production`, `npm run test:match:batting` and `npm run test:match:bat-first` passed. The production build retains the existing large Babylon chunk warning. No lint script is configured.

### Stage 2 testing guide

- Run `npm test` to check standalone resolution, detached inputs, free-hit transitions, flight scoring and the existing match rules. The existing assisted-shot formulas may use randomness; isolation does not imply deterministic output.
- Run `npm run test:production` to build and exercise batting and bowling in the production preview. Run `npm run test:match:batting` and `npm run test:match:bat-first` for full interactive batting matches in both innings orders.
- For manual verification, run `npm run dev`, open the displayed localhost URL, start a match and play through both batting and bowling. Check that shot timing feedback appears, the over tracker updates, scores and wickets are plausible, and both innings and the summary complete. Test both toss choices across separate matches. This stage is an internal refactor and adds no new camera or playzone UI to test.

### Lifecycle and integration findings

- **Match and screens:** `src/main.ts` creates a `MatchController` before the toss, starts it after the toss, creates or reuses `UIManager`, shows gameplay, and calls `setupActiveTurn()`. The UI also handles rematch and lobby transitions. A playzone needs its own session and navigation so it does not write match results or leaderboard entries.
- **Pause:** `main.ts` pauses active gameplay when hidden or in portrait and interrupts held controls. `game-clock.ts` subtracts paused duration from `performance.now()` and supplies pause-aware timers. A playzone must participate in that screen check, and camera capture timestamps need an explicit mapping to this clock across pauses.
- **Delivery and swing:** `UIManager.setupActiveTurn()` selects a bot delivery and schedules it; `initBattingDelivery()` runs the bowler's run-up, sets the delivery start time at release, and locks batter position. `GameScene.updateBallFlight()` samples the flight and calls arrival at the contact progress. Keyboard/touch swings enter `executeBattingSwingGesture()`, whose timing includes a 150 ms animation lead and is recorded once in `activeShot`. Camera input needs a distinct timestamped contact-time path rather than reusing that lead.
- **Scoring:** the arrival callback immediately calls `handleBallArrivalAtStumps()` and `MatchController.recordBall()`, which mutates innings state, including extras, wickets and legal-ball count. Successful hit runs and distance are finalized later by `finalizeBallOutcome()` after ball flight. A camera grace period and unscored replay must occur before `recordBall()`; practice needs a shared resolution path without these match mutations.
- **Innings and cancellation:** `handleInningsCompletion()` schedules a pause-aware transition, then swaps innings or resolves the match. `afterInningsTransition()` queues subsequent setup. `UIManager` invalidates pending callbacks with `deliveryGeneration`, but delivery state is also shared through `globalAutoAssistConfig`; camera sessions and practice must account for both.
- **Presentation and known risk:** the batter in `scene.ts` uses a procedural body with whole-limb meshes and a single bat pivot, not a joint rig. The existing `TODO.md` also records a bot visual-contact versus adjudication discrepancy; this baseline does not resolve it.

### Baseline verification — 10 November 2026

- Environment: Node v24.6.0, npm 11.6.4; existing installed dependencies, without a clean install.
- `npm test`: passed, 103 tests. `npm run build`: passed; Vite warned that the minified Babylon chunk exceeds 500 kB (5,024.50 kB; 1,090.29 kB gzip).
- `npm run test:browser` and `npm run test:production`: passed batting and bowling smoke checks at 568×240, 667×300 and 1024×768.
- `npm run test:match`, `test:match:batting`, `test:match:bat-first`, `test:match:sixes`, `test:match:sudden` and `test:rematch`: passed. The lofted-shot run recorded zero sixes, so it did not verify a confirmed six; the forced sudden-death fixture verified one legal ball per player.
- Browser tests initially failed to bind localhost in the sandbox (`listen` EPERM); all were rerun successfully with permission to bind local test servers. No lint script is defined. Physical-device validation, a clean install, and a confirmed-six browser run remain open.

The detailed, phased gameplay plan, acceptance gates, and current phase status live in [DELIVERY_PLAN.md](DELIVERY_PLAN.md). The implementation checklist and active defects live in [TODO.md](TODO.md). Rules and known approximations are tracked in [CRICKET_RULES.md](CRICKET_RULES.md) and [PHYSICS_CALIBRATION.md](PHYSICS_CALIBRATION.md).

## Standing work protocol

- Work only on a dedicated `feature/<short-name>` branch; never modify `main` directly.
- Record scope and acceptance checks in `TODO.md` at task start; update tracking when findings change and when the task resolves.
- Keep commits atomic and focused. Run relevant tests/build/browser checks before marking work verified.
- Present verified branch changes for user review. Merge only after explicit approval, then delete local and remote feature branches.
- Report what was checked and any remaining known limitations; do not claim issue-free status beyond the tested scope.

## Current readiness blocker

The rendered bowling delivery now reaches the adjudicated contact point, but the animated bat does not yet use spatial collision or reproduce each bot timing error. Physical-device validation and a browser-confirmed six also remain open; see `TODO.md` before treating the game as release-ready.
## Current micro-step: practice camera and outcome options

Added independent controls for following a hit ball and showing detailed delivery outcomes in batting and bowling practice. Both settings are shared between the two modes during the session; the camera returns to the starting view for the next ball.

Testing: Start the playzone, select Batting practice or Bowling practice, and find **Display** in the settings (on the left for batting and right for bowling). Turn on **Follow ball after a shot**, deliver a ball and hit it, and watch the camera follow the flight. Turn it off to keep the starting view. Toggle **Show delivery outcome** after a delivery to hide or restore the detailed result; the practice score remains visible. Repeat in the other mode, including a missed ball or wicket. Following applies to hit balls, not missed deliveries.

Verified: `npm test` (108 tests), `npm run build`, `npm run test:playzone`, and `npm run test:bowling-playzone` passed. Browser checks cover both modes and small-screen control access; physical devices were not tested. The build retains the existing large Babylon chunk warning. No lint script is configured.

## Current micro-step: bowling practice pitch aiming

Added the match-style pitch map and direct pitch aiming to bowling practice. The map, line and length selectors, target marker and intended delivery point stay synchronized; release timing and bowler accuracy can shift the actual delivered ball, as in a match. Aim locks during the run-up and ball, and the target marker returns after the ball or an interrupted run-up.

Manual test: open the playzone and choose Bowling practice. Tap or drag the pitch map and check the marker and line/length selectors move together. Tap or drag the 3D pitch and check the map follows. Change line and length directly, and try both batter hands. Hold and release to bowl; aiming should lock until the result. Test a cancelled hold and confirm the marker returns. Repeat using touch on a phone or tablet.

Verified: `npm test` (108 tests), `npm run build`, `npm run test:bowling-playzone`, `npm run test:playzone`, and `npm run test:match` passed. Automated mobile touch uses emulation; physical devices were not tested. The build has the existing Babylon bundle-size warning; no lint script is configured.
