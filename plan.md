# HardHit project plan index

## Active recording review — November 12, 2026

### Current increment — missing torso calibration

Verify that both immediate and delayed calibration reject a fresh pose with a missing shoulder, give actionable guidance, and recover when the torso returns. Preserve partial-body calibration when feet are missing and the existing stale-frame, pause and ambiguity safeguards. Run the camera regression and record the result; this is a lifecycle check, not physical pose accuracy validation.

The development camera browser regression passed with the new missing-shoulder checks for both calibration paths and subsequent full-body recovery, along with the existing partial-view and lifecycle checks. Real camera pose accuracy remains unverified.

### Current investigation — reported multi-person warning

The user's 6:39 PM recording shows a multiple-person warning while one person is apparent. A local, mirrored-back crop from 100–120 seconds retains on-screen landmark overlays and is diagnostic only. The recorded replay timed out at its initial frame, and seeking to 10 seconds reached calibration but failed its freshness gate; no conclusion about false detections follows. Synchronize replay calibration with an actually fresh accepted worker result, preserve freshness/ambiguity protection, and retry before considering any runtime change. Keep the recording and crop outside the repository.

Replay now initiates calibration immediately after a fresh, single-pose worker result with visible torso. The 6:39 crop from a 10-second seek ran: 83 results, 40 with single-person landmarks and 43 multiple-pose results, with 872 rendered/target comparisons and zero mismatches. A separate earlier recording replay also passed (91 results, 32 single and 59 ambiguous). Both recordings contain overlays, and the earlier one contains another person; counts do not establish live false-positive rates or physical accuracy. The initial no-seek and stale-calibration failures above remain part of the record. No change to ambiguity rejection is justified by these replays alone.

Investigate whether the apparent extra poses in the latest overlaid crop are spatially separate or overlapping model estimates, using local real-model inference on sampled frames and aggregate-only geometry. This single recording is not independently labeled and cannot calibrate identity rules; retain the existing rejection behavior.

An exploratory CPU model run used 20 one-second samples from the overlaid, mirrored-back crop. Independent IMAGE-mode calls returned zero poses in 9 and one in 11, with no two-pose results. A VIDEO-mode sequence using the same samples and one-second timestamps returned zero in 3, one in 6, and two in 11; all 11 pairs had at least four visible in-frame landmarks per pose. Visible-landmark box IoU ranged 0.167–0.556, and intersection covered at least 75% of the smaller box in 10/11 pairs (7/11 fully contained). These are landmark bounding boxes, not identity labels or proof of false detection; the screen overlay, coarse temporal sampling, IMAGE/VIDEO differences and single scene limit interpretation. Distinct people can overlap, so no confidence or containment threshold was selected and the runtime guard remains unchanged. Local scripts and samples remain in `/private/tmp`; Vite reported a missing source-map warning but both runs exited successfully.

### New live feedback — 6:39 PM recording

November 13 verification: partial torso calibration and prominent guidance are implemented; the camera browser regression passed, including missing-foot calibration, countdown, scrolling and short landscape mode-selector access. The mobile fixture needed an initial painted frame, and the selector needed to stack above shot controls. All 132 unit tests, production build, browser smoke, both practice modes, full matches in both orders, sudden death and rematch passed. Real-camera fidelity and the previously failed strict six scenario remain open.

The 2:09 recording shows delayed calibration counting down while the camera excludes the player's feet; the recent full-body requirement rejects capture. A later status reports multiple people despite a single apparent player. The small, scrollable status text is hard to read. Restore calibration from a recent visible torso for both controls, explicitly report limited leg tracking when feet are missing, preserve multi-person and stale-frame protection, and keep guidance and countdown visibly adjacent to the fixed preview with larger text. Verify missing-feet calibration, countdown, missing-torso rejection, ambiguity and lifecycle, as well as preview/control layout at desktop and short mobile viewports. This permits partial tracking and does not establish accurate full-body motion.

Next, correct a layout regression in the new top-left preview: it currently overlaps the practice mode panel at the same coordinates. Keep the preview visible while scrolling, position the panel beneath the actual preview height, constrain both on short viewports, and verify the mode selector remains visible and clickable through preview resizing and camera stop.

The user requested analysis of their 3:25 camera recording, fixes for inaccurate body replication, and a camera preview that remains at the top left while scrolling. Review the complete recording and distinguish model inference errors, calibration, rig retargeting and camera perspective before selecting changes. Preserve the recording outside the repository. Move the live preview out of the scrollable settings panel, maintain camera/overlay lifecycle and usable small-screen layout, and verify scrolling and stop behavior in browser. Establish regression evidence for each pose fix using the recording where feasible; do not claim physical accuracy from agreement with model targets alone. Continue the camera-batting plan with live physical acceptance still open.

The preview has been moved outside the scrolling settings panel and the browser regression checks that it stays in place during scrolling. The recording shows a severely folded model while the player is upright around 2:32–3:00; a calibration near 2:28 appears to occur while the player is leaning close to the camera, so calibration capture and retargeting both need further investigation. Unit tests (132), build, and the camera browser regression passed; one earlier concurrent run timed out during delayed calibration and the isolated rerun passed. The recording remains outside the repo. Pose fidelity is not yet fixed or verified.

Next increment: prevent immediate calibration from accepting a torso-only pose while the player is too close to the camera; require the same visible head and feet as delayed calibration, provide an actionable message, and regress rejection and subsequent full-body recovery. Full-body visibility alone cannot prove that the reference is upright, so continue investigating the torso transformation separately.

Immediate calibration now also requires a fresh full-body view; the browser regression rejected a missing foot and then successfully calibrated a full-body pose. All 132 unit tests, the build and the camera regression passed. The recording does not conclusively establish which calibration path or reference produced the observed bend, and this safeguard does not establish pose fidelity.

Investigate forward-bend direction using a rendered-joint browser assertion: when the synthetic shoulders move toward the camera relative to the hips, the rendered torso should lean toward the camera too. The existing check only verifies that the torso moves at all. Establish whether it fails before changing the transform, then verify any correction alongside existing retargeting and lifecycle checks.

The new rendered-joint direction assertion timed out on the prior transform and passed after reversing the torso pitch sign; 132 unit tests, build and the full development camera regression also passed. The recording was reviewed at two-second intervals throughout, with finer sampling around calibration and movement: it shows a strongly folded character during upright poses, imperfect arm/leg correspondence and a camera preview clipped by settings scrolling. Some footage also shows the player too close to frame, and the separate preview window partially covers the game; these observations cannot establish exact model landmark errors or fully isolate each cause. This synthetic directional result is not live-camera accuracy validation. Investigate remaining limb, turn and foot fidelity without claiming completion.

Next investigate limb coordinate spaces: `PoseRetarget` creates camera-relative landmark directions, but `alignLimb` compares them directly to world-space joint vectors. Establish a rendered-direction check against a rotated game camera and a camera-depth limb movement before making a correction. Preserve mirror behavior, distal segments and confidence/loss handling; distinguish this independent geometry test from prior target-following tests.

The rotated-camera rendered-arm assertion failed before conversion and passed after transforming camera-relative directions into world space. A separate simulated forward reach passed without changing the existing limb depth sign. The full development and production camera regressions, 132 unit tests and build passed. The prior recording replay passed with 915 confident rig/target comparisons and no mismatches, using transformed targets; this verifies model/rig consistency, not physical accuracy. During verification, one run timed out at delayed calibration and another failed a timing-sensitive delayed-frame assertion; isolated reruns passed. Production initially attempted calibration before a fresh injected frame and correctly rejected it; the harness now waits for a new result. Live limb, foot and turn fidelity still require review.

While live review is pending, fix the audit's reproduced local bat-annotation defect: saving an already annotated frame must replace its previous entry, and export must remain strictly ordered and scorer-valid. Exercise replacement and out-of-order saves in the browser using a local video and validate the resulting reference; preserve the known variable-frame-rate timing limitation.

The annotator now replaces repeated frames and sorts the export. A browser regression on the local public clip saved frames 0 and 5, revisited and replaced frame 0, then validated the exported reference. One first run confirmed the assertions but its simulated download prevented browser cleanup; intercepting the download allowed a clean rerun and exit. This does not establish frame-accurate timing for variable-frame-rate sources.

## Active camera-batting goal — November 12, 2026

The user explicitly authorized autonomous implementation of the whole camera-batting feature with no personal approval between stages or phases. This supersedes historical stage-review stop instructions below. Keep working on `feature/camera-batting`, preserve unrelated changes, record scope and acceptance before code changes, and commit each verified increment. Merge and public deployment still require separate authorization. Stop only for necessary user input, physical validation or external access; keep independent work moving while those are pending.

Remaining sequence: make tracking performance observable; validate and refine calibrated full-body motion; implement and independently validate physical-bat tracking and two-hand constraints; calibrate swing events and shot type, field direction, strength and timing; integrate an explicitly enabled practice camera-input path with timestamp and delivery lifecycle protection; then integrate match camera control after practice verification. Treat hand-only diagnostics as hand motion, never physical bat measurements. Real-camera/device accuracy gates stay open until measured.

### Verified increment: camera performance feedback

Expose a rolling accepted-result rate, recent frame-submission-to-result round-trip time, and session rejection counts, without storing video or landmarks. Reset on tracking restart/stop and distinguish pause rejection from slow results. Verify rolling-window expiry, timestamps, resets, delayed-frame rejection and camera lifecycle with unit/build/browser checks. These measurements exclude camera exposure and display latency and must not be called end-to-end latency. Implemented and verified with 122 unit tests, production build and development/production camera browser regressions, including nonzero interrupted/delayed counts and stop/restart reset. The sandbox initially prevented localhost binding; the authorized browser runs outside the sandbox passed. Actual-device rates and end-to-end latency remain unmeasured.

## Verified tooling: independent annotated pose validation

Add an explicit local-only annotated-frame check, separate from the moving rig replay. A user-supplied unmirrored clip and manually annotated normalized landmark positions define the evidence, pixel tolerance, source dimensions and times. Seek to each frame, run the real pose worker, fail on low-confidence/missing points, inaccurate positions or missing coverage, and print aggregate errors only. Validate schema and scoring with behavior tests, then exercise the browser harness against the existing local clip with a clearly labeled synthetic smoke fixture; synthetic annotations cannot establish accuracy. Keep all recordings, annotations and per-frame results outside the repository. Implemented as `test:pose-reference`, with schema and coordinate-error tests included in `npm test`. All 126 tests and production build passed. The actual browser/worker processed three annotated frames from the existing local clip using a deliberately loose synthetic-smoke fixture; a separate near-zero-tolerance run failed as expected. Those references were not human annotations and do not establish accuracy. `CAMERA_BATTING.md` records schema, model-output limitations and remaining acceptance gates. This supplies a validation path, not validated body or bat accuracy.

## Evaluated: bat-hand association sensitivity

Ran the actual association function against 23 public-stroke frames with human handle annotations and real pose-worker wrists. Illustrative maximum distances 0.15/0.30/0.60 torso lengths accepted 7/9/13 frames; eight lacked a confident wrist. A handle shifted one torso length was rejected in all 23 at each threshold. These are one-clip and synthetic-negative results, not calibrated thresholds, physical grip proof or detector accuracy. Details are in `CAMERA_BATTING.md`.

## Verified foundation: physical bat and hand association geometry

Added a pure image-plane association check for independently detected handle endpoints and both wrists. It requires finite in-frame points, explicit confidence, aspect, torso scale and caller-supplied thresholds, and rejects uncertain, distant or degenerate observations. Synthetic unit checks cover mirroring, aspect, low confidence, occlusion and false associations; 131 tests and production build passed. It is not connected to the hand preview or gameplay, and is not bat detection, calibrated thresholds, identity or real-device validation.

## Verified increment: preserve high-frame-rate annotation steps

The bat annotator's fixed 1/60-second seek tolerance can skip adjacent frames in a 120 fps clip while advancing the exported index. The annotator now skips a seek only when the requested and current media times are effectively identical. A browser check advanced one frame in the 120 fps public clip, verified changed canvas pixels and the requested media time, then exported frame 1 with the correct nominal timestamp. Browser timing is still not a guarantee of exact frame index for variable-frame-rate sources.

## Verified increment: represent occluded bat landmarks

The annotator can mark occluded points without coordinates; the scorer counts confident outputs on them as false, requires visible point coverage and cannot pass an all-occluded reference. Existing visible annotations remain valid. Schema, correct abstention, false outputs and zero-visible behavior passed in 132 unit tests; a browser check exported an occluded point without coordinates. This supports evaluation only and does not implement bat detection.

## Verified increment: score bat detector output from local files

The local scoring command validates dimensions, exact frame indices/times and ordered point names before comparing endpoints, counting missing points as failures. All 130 unit tests passed, including frame mismatch, order and missing-point cases. A synthetic annotation-export-to-command smoke passed; this evaluates supplied predictions, not a detector or accuracy.

## Verified tooling: validate and score bat endpoint references

Added a strict manual bat reference validator and pixel scorer for four ordered endpoints, with confidence and missing-point coverage failures. Behavior tests cover schemas, aspect-aware pixel error, exact tolerance, low confidence and absent predictions. Integrated into `npm test`; all 129 tests pass. This defines evaluation for future detectors and does not supply detector output.

## Verified: bound bat annotation at clip end

Clamp the frame index itself when stepping beyond the clip, so the exported frame and time match the bounded request. A browser run on the local cricket clip stepped past the end, annotated four points and verified the exported frame/time were within the clip, with no browser errors. This does not establish exact decoded-frame timing on variable-frame-rate sources.

## Verified tooling: local bat keypoint annotation

Added a local browser page to annotate handle top, splice, blade middle and toe on sampled frames, with an explicit nominal FPS and JSON export. Verified frame-zero load, four-point entry, saving and exported dimensions/rate/names using the local cricket clip; no browser errors. Click coordinates in this smoke were synthetic, so this verifies tool operation only. Variable-frame-rate timing still needs careful reference preparation, and no detector is evaluated by this tool yet.

## Verified increment: make annotated video seeks tolerate frame-zero timestamps

The local pose reference harness can wait forever when an annotation time is a tiny positive value near zero: the browser keeps `currentTime` at zero and does not fire `seeked`. Skip seeking when already within one frame of the requested time and verify the decoded position after an actual seek. A real-worker browser run at time 0.0001 processed and scored one frame successfully (1 expected/compared point, zero missing/outside tolerance). The 1000-pixel tolerance and synthetic annotation make this harness smoke evidence only; no pose accuracy follows.

## Evaluated: bat-to-hands association feasibility

The real pose worker processed 23 exact FFmpeg-extracted annotation-indexed frames from the public single-stroke clip. All had a pose and torso; both wrists passed visibility ≥0.5 in 15. Distance from each visible wrist to the human-annotated handle segment, divided by shoulder-to-hip midpoint distance, had left median/p90/max 0.217/0.581/0.666 torso lengths (n=23), right 0.105/0.166/0.332 (n=15), and worst-of-both 0.150/0.581/0.666 (n=15). Eight frames lacked a confident wrist. This does not establish a reliable threshold or bat detector. The earlier HTML video seek run repeated landmarks for different annotated frames and was discarded; exact PNG indexing fixed the experiment. The video and frames remain outside the repo. `CAMERA_BATTING.md` records method and limitations. Continue searching for endpoint-capable tracking and broader evidence; no two-hand gameplay constraint is implemented.

## Verified increment: clear interrupted pose overlay

When a worker result crosses a pause boundary, discard its pose and clear the previous skeleton rather than leaving an old overlay visible. Explain the interruption until a fresh frame arrives. The development camera browser regression verified interruption, a transparent overlay and subsequent recovery; all 126 unit tests and the production build passed.

## Verified increment: invalidate calibration across a pause

A recent pose can still precede a pause boundary, so its age alone does not establish that it belongs to the current gameplay session. Reject immediate and delayed calibration while paused or when the last accepted pose predates a pause/resume boundary; require a fresh accepted pose after resuming. The development camera browser regression passed with calibration rejected both during pause and immediately after resume, followed by fresh-frame recovery and existing lifecycle checks. All 126 unit tests and the production build passed. Physical-device behavior remains unmeasured.

## Verified increment: reject stale immediate calibration

Immediate calibration currently bypasses the freshness check used by delayed full-body calibration. Require recent accepted landmarks for both paths so a stalled tracker cannot capture an old reference. Measure freshness from the main-thread frame-submission timestamp, rather than giving old frames a new age on result arrival or when reapplying a calibrated pose. Add a browser regression that holds the next worker result, waits beyond 500 ms and attempts immediate calibration; prove the old implementation fails that regression, then verify rejection, fresh-result recovery and the existing calibration/ambiguity lifecycle. Keep partial-body immediate calibration available when its required torso landmarks are recent. The freshness rejection and recovery passed the development and production camera regressions, along with 126 unit tests and the production build. In an isolated copy using the previous implementation, the same regression failed at the expected stale-calibration assertion, confirming the negative control. Actual-device timing remains unmeasured.

## Verified: reject ambiguous multi-person tracking

Request up to two poses so the camera can report detected ambiguity. When more than one person is detected, emit no player landmarks, clear the overlay, cancel delayed calibration and pending hand-motion samples, and immediately reset calibrated movement. Require explicit recalibration after returning to a single detected person. Keep manual play and scoring separate. Verify a synthetic ambiguous result through lifecycle checks, calibration rejection/cancellation and recovery in development/production browser tests, and exercise actual multi-person model output where a local fixture permits. Detection is not identity recognition: a missed second person or sequential person replacement remains a limitation. Measure and document that the extra pose allowance can cost more inference time; real-device impact remains open. Implemented and verified with 126 unit tests, production build and development/production camera regressions. The real worker identified two composited fixture people and suppressed landmarks. A replay from the inspected 12-second full-body point processed 30 single-person frames, rejected 63 multi-person frames, and passed 1,625 confident rig/target comparisons with unchanged score. An initial default-seek attempt lacked usable hips; a subsequent harness race was fixed to wait for accepted tracking rather than any raw worker result. The replay now clears stale targets on rig reset and counts ambiguous frames. An initial browser run was invalidated by a source-triggered page reload; another exposed a brittle counter-reset assertion, corrected to allow new-session delayed frames. Final isolated checks passed. These results do not establish identity recognition or real-world pose accuracy.

## Evaluated: cricket-specific checkpoint

The user resumed the full goal and asked to continue technical work without waiting prematurely for live testing. Evaluate the available cricket-specific YOLOv5 checkpoint locally against the public annotated source, preserving the real-camera gates as open. Inspect checkpoint architecture and use restricted tensor loading, not arbitrary checkpoint deserialization. Keep dependencies, weights, source footage and per-frame results outside the repository. Verify label semantics, preprocessing and positive controls, measure box overlap/coverage separately from endpoints and assess whether a browser-compatible route is viable. Do not ship a checkpoint merely because it detects a box; actual grip/tip/face tracking, confidence, lifecycle and gameplay acceptance remain required. Commit verified implementation or findings, preserving `.gitignore`. The restricted evaluator loaded the older YOLOv5s model and passed a training-image positive control (bat IoU 0.776, confidence 0.688). On 23 independently labeled public-video samples, it detected a bat in 15 but matched IoU ≥0.5 in only two. No runtime selection or endpoint claims follow. Full configuration, evaluator limits and local-file references are in `CAMERA_BATTING.md`; no app code/dependencies changed. Continue independent reliability work while live feedback is pending.

## Evaluated: second public cricket clip smoke

Downloaded and inspected a second Pexels clip locally: 1080×1920, 120 fps, 5.15 seconds, different player and rear/side angle with netting, other people and bat occlusion. EfficientDet-Lite0 emitted zero baseball-bat boxes in six source-indexed one-second samples at confidence ≥0.2, while emitting person boxes in each. The cricket-specific YOLOv5 checkpoint also emitted zero bat boxes on these six samples; its separate training-image positive control was previously successful, and its custom inference parity remains unverified. Without independent labels this is a cross-scene smoke check, not accuracy or false-positive evidence; source, checksum and limits are in `CAMERA_BATTING.md`. The clip remains outside the repo and user-camera validation remains open.

## Inspected: bat-corner model lead

A publicly linked cricket bat corner repository and its notebook were inspected as data. Its training code uses DETR object detection and its linked dataset declares only a cricket-bat class; named endpoints are not established. Its linked checkpoint was not executed and repository license was not found. A separate indexed bat-toe dataset could not be inspected because the service returned HTTP 403; label semantics and rights remain unknown. No model was selected. Details and source links are in `CAMERA_BATTING.md`.

## Evaluated: cropped bat keypoint prototype

Trained a spatial heatmap prototype on annotated bat-box crops in frames 0–99, excluded 100–119, and evaluated frames 120–183. With oracle boxes, median/p90 worst-point error was 108.5/321.7 pixels and 0/64 frames had all four within 50 pixels. EfficientDet supplied boxes for 12/64; those had 0/12 within 50 pixels and 11 target points outside their expanded crops. The missing 52 are end-to-end failures. This single-clip prototype is not suitable for integration; model, images and results stay outside the repo. Details are in `CAMERA_BATTING.md`.

## Evaluated: spatial heatmap bat keypoint prototype

Fine-tuned a spatial heatmap head and the last pretrained MobileNetV3-Small blocks on frames 0–99, excluded 100–119, and evaluated 120–183. Median/p90 worst-point error was 418.5/489.4 pixels and 0/64 frames placed all points within 50 pixels. This improves on the constant baseline but remains unusable on the holdout. The single stroke cannot validate generalization, browser performance, confidence or gameplay readiness. Model and frame outputs remain outside the repo; configuration and limits are in `CAMERA_BATTING.md`.

## Evaluated: fine-tuned bat keypoint prototype

Fine-tuned the final three pretrained MobileNetV3-Small feature blocks and four-point head on frames 0–99, excluded 100–119 and evaluated 120–183. On 64 holdout frames, median/p90 worst-point error was 792.1/822.7 source pixels and 0/64 had all points within 50 pixels; the constant baseline median was 995.1. This single-clip fixed configuration is not a runtime candidate. Checkpoint and per-frame output remain outside the repo; method and limits are in `CAMERA_BATTING.md`.

## Evaluated: frozen pretrained features for bat keypoints

A local CPU experiment used the official ImageNet MobileNetV3-Small frozen backbone and a ridge head trained on labeled frames 0–99, with frames 100–119 excluded and 120–183 held out. All four predicted endpoints were within 50 source pixels in 0/64 holdout frames; median worst-point error was 1034 pixels versus 995 for the training-mean baseline. This single-stroke test rejects only this simple configuration; it does not establish learned-model generalization limits. Model and frame outputs stay outside the repo. Source hash, restricted loading, split and limitations are in `CAMERA_BATTING.md`.

## Evaluated: segmentation with annotated bat boxes

OpenCV GrabCut with oracle annotated boxes and oracle endpoint ordering was evaluated on 23 sampled frames. Six produced no usable foreground; none of the 17 remaining frames placed both endpoints within 50 pixels. Median/p90 worst-endpoint error was 205.8/413.7 source pixels. This single-stroke generic baseline is unsuitable for integration; it does not establish that learned segmentation fails. Method and limits are in `CAMERA_BATTING.md`.

## Evaluated: endpoint estimates from detector boxes

An optimistic oracle analysis chose the best detector box and corner assignment using known human endpoints. Only 3/35 detected-box frames placed both endpoints within 50 pixels; even among the 30 boxes with IoU ≥0.5, median worst-endpoint error was 99.2 pixels. Ground-truth boxes under the same oracle selection passed 173/177, confirming detector box inaccuracy dominates this particular corner method. This single-stroke result does not assess segmentation or learned keypoint methods; see `CAMERA_BATTING.md`.

## Evaluated: optical-flow bat endpoint tracking

Initialized both endpoints from the first labeled frame and tracked subsequent frames with pyramidal Lucas–Kanade flow and a forward/backward consistency gate, with no annotation feedback or recovery. Both points stayed active for 22/176 labeled frames; the toe then dropped. The handle stayed active for 104 labels but had median/p90 error 55.9/289.7 pixels, demonstrating that consistency alone did not prevent drift. This one-stroke oracle-initialized experiment is not suitable for gameplay; full method and limits are in `CAMERA_BATTING.md`.

## Evaluated: simple bat endpoint template tracking

Initialized handle top and toe from the first annotated frame, then followed both points using fixed quarter-resolution grayscale correlation templates without later annotation feedback. Across 176 later annotated frames both were within 50 source pixels in 27; median handle/toe error was 192.7/135.5 pixels. This single-stroke, no-recovery experiment shows that this simple tracker drifts too much for runtime, not that all optical-flow or learned tracking methods fail. The script and per-frame output stay in `/private/tmp`; `CAMERA_BATTING.md` records method and limits.

## Evaluated: cricket-specific detector across all annotated frames

The isolated PyTorch environment remained available, allowing the cricket-specific YOLO checkpoint to be evaluated on all 177 labeled frames. At confidence ≥0.2 it emitted bat boxes in 121 frames, with 28 reaching IoU ≥0.5; mean best IoU including misses was 0.254. Median local CPU forward time was 51.8 ms (not browser or end-to-end latency). This one-stroke box evaluation is not endpoint accuracy or generalization, and the custom inference parity limitation remains. No model was selected for integration; details are in `CAMERA_BATTING.md`.

## Real-bat detector candidate: evaluated and rejected

Evaluate an existing on-device object-detector candidate against public human-labeled cricket-bat footage before adding a runtime model or gameplay integration. Verify source, label semantics and annotation/video alignment. Keep downloaded weights, footage, annotations and experimental outputs outside the repository. Record sampled box coverage, overlap, false candidates and processing time separately from bat endpoint accuracy; reject a candidate if the evidence is insufficient. The public single-stroke fixture cannot establish generalization or replace live user-device validation. No new camera controls or scoring behavior are authorized by a passing benchmark alone. Evaluated EfficientDet-Lite0 int8 on 23 sampled human-labeled public cricket-bat frames: zero bat detections at confidence ≥0.2, while the person positive control was detected on all 23 frames. Rejected the candidate for integration. Inspected a separate cricket-specific YOLO checkpoint lead without executing it; it supplies boxes, not endpoints. Source links, checksums, full-frame results, exact scope and local timing are recorded in `CAMERA_BATTING.md`. No application code changed in this investigation. The prior 126-test/build and browser baseline is unchanged; actual user-camera posture and representative bat validation remain open.

## Correct torso straightening pivot

The skinned rig straightens the model by rotating its spine, but previously calculated that correction using a hips-to-shoulders vector. It now measures from the actual spine pivot to the shoulders. A browser regression checks the rendered spine-to-shoulder direction after neutral calibration; the stricter check failed with the previous pivot and passed with the correction. Synthetic bend and camera lifecycle checks also passed, as did 120 unit tests and production build. The user's full-body replay passed with all segments exercised. Two separate replay runs showed a modest reduction in average model lean during frames whose 2D torso appeared upright, but their samples differ, the recorded preview has overlays, and image-plane posture is not 3D ground truth. Live review remains necessary. One full browser run timed out later in the hand-intensity check; an isolated rerun passed.

## Delayed full-body calibration from the November 12 recording

The recording shows full-body movement with a strongly hunched character while the player is mostly upright, and the player approaches the computer to operate controls. A cancellable five-second calibration now allows stepping back before capturing the reference and requires recent visible head, shoulders, hips, ankles and toe landmarks. Stopping tracking or changing mode cancels the countdown. The existing immediate calibration remains available. The recording does not establish whether calibration is the sole cause of the posture mismatch; live review remains necessary.

A cropped, mirrored-back section of the supplied screen recording was replayed locally through the pose worker and rig: both feet were visible in 131 processed frames, and all twelve limb segments were exercised with 8,279 confident rendered target comparisons and no mismatches over the 10-degree tolerance. An earlier seek position failed calibration; a later position passed. The source already has pose overlays and another person enters the scene, so the clip is not independent ground truth and cannot establish real-world accuracy. The recording stays outside the repository. Verified with 120 unit tests, production build and the camera browser regression covering the countdown, missing-body rejection, successful capture and cancellation. A browser test initially raced a fresh result after restart; after waiting for visible landmarks the rerun passed.

## Limb directions with invalid depth

Rendered limb direction calculations now fall back to a complete screen-coordinate pair when either world landmark is missing or non-finite, rather than treating a visible limb as lost. The 2D and 3D estimates can still differ. Verified with 120 unit tests including mirrored arm and foot cases and recovery, production build and camera browser regression. Actual foot fidelity remains unverified on full-body camera footage.

## Movement smoothing across frame rates

Pose smoothing scales up when frames arrive more slowly than the 15 fps worker cap, with catch-up bounded to three nominal frames. This applies to facing, head, offsets, limb directions and joint-angle smoothing; actual performance and jitter still require camera testing. Verified with 119 unit tests (including synthetic response at different frame intervals and mirrored input), production build, camera browser regression and the user's recorded-motion replay. The replay made 4,000 confident pose-target comparisons with no mismatches; lower legs and feet were not visible, and model-target agreement is not real-world accuracy.

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
