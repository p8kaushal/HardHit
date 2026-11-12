# Camera-batting implementation and evidence

The user authorized autonomous stage/phase transitions on November 12, 2026. Follow the project work protocol, update `plan.md` and `TODO.md` for each increment, and commit verified work. Personal approval between implementation stages is no longer required. Unrelated workspace changes must be preserved. Merge and deployment authorization remain separate.

## Remaining stages and acceptance

| Stage | Required behavior and evidence |
| --- | --- |
| Body movement | Neutral posture, facing, bends, arms, legs, head and mirrored motion agree with independent full-body observations. Confirm short occlusion recovery and device responsiveness. Current synthetic/replay checks cover implementation consistency, with live fidelity still open. |
| Physical bat | Locate the actual bat and distinguish grip and blade/tip, associate it with the tracked player, reject uncertain/occluded frames, and constrain the rendered grip without inventing bat orientation from wrists alone. Benchmark against annotated actual-bat frames, including fast swings and confusing background objects. |
| Swing inference | Associate a swing with one player and one uninterrupted session; reject ordinary walking, arm movement, stale frames, multiple people and false starts. Independently annotate swing onset, relevant contact proxy and follow-through. Derive shot type and field direction from a calibrated coordinate convention, and test both handedness and mirror settings. |
| Strength and timing | Compare repeatable gentle/strong swings on real devices; define a measured proxy rather than claiming physical power. Measure capture/processing delay and its uncertainty. Peak wrist speed is not observed bat-ball contact. |
| Practice input | Explicit opt-in; keep manual controls available. Use timestamped input rather than the manual animation lead, bound any inference grace period before adjudication, accept at most one shot per delivery, and invalidate on pause, mode changes, loss, exit or a new delivery. No match progression writes. |
| Match input | Reuse the verified practice input contract; test both innings orders, extras/free hits, late results, interruptions, rematch and saved progression. Physical-device validation and measured accuracy remain necessary before declaring the whole feature complete. |

These are acceptance requirements, not claims of implemented behavior. The existing hand-motion preview has no gameplay effect.

## Bat-tracking dependency

The installed pose model estimates 33 human body landmarks; it does not supply bat endpoints. See Google's [Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker). Google's separate [Object Detector guide](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector) describes category bounding boxes. A detected rectangle alone does not identify bat grip, tip, face orientation or contact. That is an implementation inference from the documented outputs, not a tested bat solution.

Before selecting or training a bat-specific model, evaluate appropriately licensed candidates against representative local cricket-bat footage and record the model licence, size, runtime cost, missed detections and false positives. Do not silently introduce a paid service, upload user recordings or require physical markers. No bat-specific model has been selected or validated. Live posture feedback and full-body footage with an actual bat are pending.

### Candidate evaluation — November 12, 2026

The public [Train Matricx cricket-bat keypoint dataset](https://huggingface.co/datasets/trainmatricx/cricket-bat-keypoint-detection) supplies 177 human-labeled frames from one stroke, with handle-top, splice, blade-middle and toe annotations. Its source is Gokuldham Nar's [Pexels cricket practice clip](https://www.pexels.com/video/dynamic-cricket-practice-session-outdoors-32928952/). Annotations/code are declared MIT by their publisher; video use is governed separately by the [Pexels licence](https://www.pexels.com/license/). The clip, annotations and model were downloaded only to `/private/tmp` for local investigation, without adding them to the game or repository. The first-frame image and annotation positions were inspected for rough alignment; all 177 annotations contain four points, all declared visible and inside the image. This is not a complete annotation-quality audit.

Tested Google's EfficientDet-Lite0 int8 object detector against every eighth annotated image (23 frames), seeking by the source's `30000/1001` fps frame index and using the original 1080×1920 image. The installed MediaPipe 1.2.2 runtime ran CPU inference in local headless Chromium. The model's official [label map](https://storage.googleapis.com/mediapipe-tasks/object_detector/labelmap.txt) includes `baseball bat`, without a separate cricket-bat category. Generalization to a cricket bat was an experiment, not assumed support.

| Measure | Local experimental result |
| --- | --- |
| Person positive control at confidence ≥0.2 | 23/23 sampled frames |
| Bat detection at confidence ≥0.2 | 0/23 |
| Bat detection at confidence ≥0.5 | 0/23 |
| Bat box match at intersection-over-union ≥0.5 | 0/23 |
| Median synchronous detector call | Approximately 51 ms |
| Maximum detector call, including startup effects | Approximately 305 ms |

The unfiltered run above established that inference was functioning by detecting the person in every sample. A later full-frame benchmark below found intermittent bat boxes, showing that the original 23-frame stride missed detections. These timings are for the initial local desktop/headless sample, exclude capture and rendering, and are not mobile performance measurements. Neither pass demonstrated endpoints, face orientation or swing accuracy.

Reproducibility identifiers: model [EfficientDet-Lite0 int8](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite), SHA-256 `0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb`; source video SHA-256 `5bd6ddce3a13375918e0827ad96f3172a1b2cd24bbb9075f323271b45945151b`; annotation JSON SHA-256 `7d3ac6d62aa39fa46caa4efb036f40c4780e0ed9a06c2135a81698808c08c292`. The disposable sampled evaluation script and results are `/private/tmp/hardhit-evaluate-bat.mjs` and `/private/tmp/hardhit-bat-candidate-results.json`; the full-frame evaluation is `/private/tmp/hardhit-evaluate-bat-all.mjs` with outputs in `/private/tmp/hardhit-bat-candidate-all-results.json`. These local files may disappear with temporary-file cleanup.

The [Kushal Dev cricket detector repository](https://github.com/kushaldev75/Bat-Ball-Tracking-System) is another lead: its public file tree contains a roughly 14.4 MB `results/best.pt` checkpoint and its training configuration names `yolov5s.pt`, despite the README describing a larger model. It predicts bat/ball boxes rather than endpoint keypoints. This checkpoint has not been executed, converted, benchmarked or approved as a runtime dependency; a repository licence alone is not treated here as verification of every underlying asset's licence. The other indexed webcam-analysis repository inspected returned 404, so search snippets were not accepted as usable implementation evidence.

### Pose-wrist association against annotated bat handle

To test whether existing body wrists can support a two-hand association constraint, ran the actual MediaPipe Pose Landmarker worker on 23 frames from the Train Matricx/Pexels clip (every eighth frame). The source has 184 indexed frames; FFmpeg extracted all of them as 1080×1920 PNGs, and the evaluator loaded PNGs by the annotation `video_frame` index. This bypasses browser video seek timing. An earlier attempt to seek in an HTML video produced repeated landmarks for different annotation frames and was discarded. A `requestVideoFrameCallback` follow-up timed out at the first timestamp near zero, so those results were also discarded.

For each frame, measured the image-plane distance from each pose wrist to the human-annotated line between handle-top and splice, divided by the distance between shoulder and hip midpoints. This only asks whether a visible wrist is near the annotated handle; wrist output is not independently labeled truth, and handle labels are used as an oracle. With worker wrist visibility ≥0.5: pose and torso were available in all 23 frames; both wrists met that visibility threshold in 15 frames. Left-wrist distance had median 0.217, 90th percentile 0.581 and maximum 0.666 torso lengths (23 samples). Right-wrist distance had median 0.105, 90th percentile 0.166 and maximum 0.332 (15 samples). The worst of both wrists in frames with both visible had median 0.150, 90th percentile 0.581 and maximum 0.666 (15 samples). The large spread and eight frames missing one wrist mean these data do not establish a robust two-hand distance threshold. They support further measurement only; they do not locate bat endpoints, prove which hand grips the bat, validate face orientation, or establish fast-swing/mobile/general performance.

The first source clip is a single side-on stroke with gloves and pads. Keep the video, 184 extracted PNGs, annotations and frame measurements outside the repository. The local disposable evaluator was `/private/tmp/hardhit-bat-grip-eval.mjs`; it is not a maintained project command. This is preliminary feasibility evidence, not an application implementation or bat-tracking accuracy result.

### Endpoint template-tracking feasibility

A local experiment initialized handle-top and toe from the first human annotation, then tracked the two image points without using subsequent labels or reinitializing. It used fixed 15×15 grayscale normalized cross-correlation templates on quarter-resolution frames with an ±18-pixel search radius per annotated step. Against the next 176 labeled frames, both endpoints were within 50 source pixels in 27 frames. Median errors were 192.7 pixels for handle top and 135.5 pixels for toe; 90th-percentile errors were 592.9 and 1175.9 pixels respectively. Processing the sequence took 5.4 seconds locally, including image loading; this is not a camera-to-display measurement.

This experiment used a human oracle only for initialization, a single side-on stroke, and no recovery or confidence gate. The labels omit some source frames, so search steps may span gaps. It demonstrates severe drift for this particular simple template method, not a bound on optical flow or trained trackers. It cannot supply a reliable runtime bat direction and is not integrated. Disposable script and per-frame errors: `/private/tmp/hardhit-template-bat.py` and `/private/tmp/hardhit-template-bat-results.json`; footage remains local.

### Generic segmentation with an oracle box

A local feasibility experiment ran OpenCV GrabCut on every eighth labeled frame (23 frames), using the human-annotated bat box as the initial rectangle. It resized frames to 540×960, ran three GrabCut iterations, fitted the foreground's principal axis, and used the first/99th projection percentiles as endpoints. Human labels selected the better endpoint ordering, making this an optimistic experiment rather than a deployable bat detector. Six frames produced fewer than ten foreground pixels. Of the 17 producing endpoints, none placed both within 50 source pixels; median/p90 worst-endpoint error was 205.8/413.7 pixels. Total local processing including image loading was 9.3 seconds; it is not a real-time or mobile measurement.

This is a single side-on stroke, an oracle box and one generic segmentation configuration. It does not establish that learned segmentation or other image methods fail. The script and per-frame output remain outside the repo at `/private/tmp/hardhit-grabcut-bat.py` and `/private/tmp/hardhit-grabcut-bat-results.json`; no model or runtime dependency was added.

### Endpoint estimates from detector-box corners

A local oracle analysis tested whether an axis-aligned detector box could serve as a direct endpoint estimate. For each frame it chose whichever detector candidate and diagonal-corner assignment minimized the worse error between handle-top and toe, using the human labels to make that choice. This is an optimistic upper bound for that specific corner method, not an implementable selection algorithm. Of the 35 frames with EfficientDet bat boxes at confidence ≥0.2, both endpoints could be placed within 50 source pixels in only 3; median/p90 worst-endpoint error was 106.8/161.0 pixels. Restricting to the 30 frames whose box matched IoU ≥0.5 still gave only 3 within 50 pixels, with median/p90 99.2/131.7 pixels. As a control, using the human-annotated bat box instead of detector output gave 173/177 within 50 pixels and median/p90 21.5/37.9 pixels under the same oracle corner selection. These observations apply to one stroke and do not evaluate image segmentation or a learned endpoint model. Detector boxes do not supply adequate endpoint estimates here, even with oracle corner assignment. Disposable analysis: `/private/tmp/hardhit-box-endpoint-upper-bound.py`.

### Optical-flow endpoint tracking experiment

A second local experiment initialized handle top and toe from the first human-labeled frame and tracked all subsequent video frames with half-resolution pyramidal Lucas–Kanade flow (21-pixel window, three pyramid levels). It marked a point lost permanently when forward/backward inconsistency exceeded three source pixels or either flow failed; no later annotations or recovery were used. Of 176 subsequent labeled frames, both points remained active for 22. The toe was marked lost at source frame 23; its 22 active labels had median/p90 errors of 13.4/18.6 source pixels. The handle remained active on 104 labels before being marked lost at frame 106; its median/p90 errors were 55.9/289.7 pixels, with 50/104 within 50 pixels. A forward/backward check therefore did not prevent large handle drift. Processing took 5.6 seconds locally including image loading; this is not camera-to-display or mobile latency.

This is one side-on stroke initialized with oracle points and has no reacquisition, bat-face estimate, identity check or independently varied evaluation. It is not a runtime candidate. OpenCV 5.0.0 was installed under `/private/tmp/hardhit-cv2`, outside the project; the disposable script and aggregate results are `/private/tmp/hardhit-lk-bat.py` and `/private/tmp/hardhit-lk-bat-results.json`.

### Full-frame EfficientDet-Lite0 follow-up

To check whether every-eighth-frame sampling missed detections, ran the same local MediaPipe EfficientDet-Lite0 int8 runtime on all 177 annotation frames. FFmpeg extracted the video frames by index; the browser loaded each PNG directly, avoiding seek timing. Input remained 1080×1920 RGB, threshold 0.2, max 20 results, CPU delegate. Compared emitted `baseball bat` boxes with human bat boxes using intersection-over-union.

| Threshold | Frames with bat box | Boxes with IoU ≥0.5 | Unmatched candidates (IoU <0.5) |
| --- | ---: | ---: | ---: |
| 0.2 | 35/177 | 30/177 | 6 |
| 0.5 | 4/177 | 4/177 | 0 |

Maximum score was 0.547. Other output labels across the frame set included person (184), baseball glove (27), tennis racket (54), bench (4), and toilet (1); per-frame category totals can exceed the number of frames. Median synchronous detector call was 45.1 ms, maximum 125.4 ms, in local desktop headless Chromium. These times exclude camera capture and rendering and are not mobile latency measurements.

This supersedes the impression from the 23-frame stride: EfficientDet intermittently emits boxes on this one stroke, but high-confidence coverage is only 4/177. A box does not distinguish grip and toe or provide bat-face direction, and detections on one clip do not validate generalization or false-positive rates across scenes. The candidate remains unsuitable for gameplay integration. Extracted frames and per-frame outputs remain in `/private/tmp`; the experiment was an investigation, not an application dependency.

### Cricket-specific YOLOv5 checkpoint follow-up

The resumed goal prompted evaluation of the previously untested cricket checkpoint. Its SHA-256 is `6edc0649f2b4ccdaba9e8e8bd635b905adaa4cc5c2e9f3b92839f7bee25834c2`; the inspected repository tree was `9adcc88299977fc33ba066fa2922d1416e17fca7`. Restricted PyTorch loading identified 7,066,239 parameters, classes `ball` and `bat`, and the older Focus/SPP YOLOv5s architecture. The evaluation environment and checkpoint remain outside the project. No checkpoint-provided Python implementation was imported and unrestricted pickle loading was not used; known module types were allowlisted and inference operations were supplied by the local evaluator.

A labeled training-image positive control produced one bat detection at confidence 0.688 and box intersection-over-union 0.776. On the same 23 sampled Pexels frames used above, RGB input letterboxed to 640×640 with confidence threshold 0.2 and nonmaximum suppression at IoU 0.45 produced bat detections in 15 frames, but only two had bat-box IoU ≥0.5. Mean best-box IoU over all 23 frames, treating missing detections as zero, was 0.209. Median local CPU forward-pass time was about 53 ms; this is neither browser nor capture-to-display timing. This is useful feasibility evidence but insufficient for selecting the checkpoint for runtime grip/tip tracking. No endpoint or bat-face output exists in this checkpoint. The local evaluator has not been parity-checked against a complete historical YOLOv5 runtime, so the positive control supports operation without proving exact implementation equivalence.

A follow-up in the existing isolated PyTorch 2.15 environment evaluated all 177 annotated frames, selected by source frame index. At confidence ≥0.2 and NMS IoU 0.45, 121 frames emitted a bat box and 28 reached IoU ≥0.5; mean best-box IoU including missed detections was 0.254 (median 0.265). Median local CPU model forward time was 51.8 ms, maximum 74.5 ms, excluding preprocessing, camera capture and display. The full-frame data remain one stroke and do not validate generalization or endpoint accuracy. This is not a browser or mobile benchmark. The evaluator retains the previously documented limitation that its reimplemented inference has not been parity-checked with the historical YOLOv5 runtime. Full results and script are `/private/tmp/hardhit-cricket-all-results.json` and `/private/tmp/hardhit-evaluate-cricket-all.py`. This broader pass does not change the decision against selecting the box-only checkpoint for gameplay.

Local files: `/private/tmp/hardhit-evaluate-cricket.py`, `/private/tmp/hardhit-cricket-candidate-results.json`, `/private/tmp/hardhit-cricket-control.py`. Further model work remains possible; live validation is not a reason to stop unrelated implementation. The next bounded reliability change rejects frames where multiple people are detected, rather than applying the first pose to the calibrated player.

Next evidence needed remains representative full-body/actual-bat footage and live review of the corrected posture. The public single-stroke sample can support later bat experiments but does not close those gates. Physical-bat inference and camera scoring remain unimplemented.

## Bat reference scoring contract

`scripts/bat-reference.mjs` validates the annotator's version 1 JSON: manual label source, image dimensions, declared frame rate, canonical point order, strictly increasing frame times and four normalized named coordinates per frame. `scoreBatReference(reference, predictions, maxErrorPixels)` compares an ordered four-point prediction array per annotated frame. Predictions carry normalized x/y and confidence; confidence below 0.5, invalid/out-of-frame coordinates, or absent points count as missing. It reports point coverage and pixel error using source width and height independently, and passes only when all points are present and within the explicit caller tolerance. This supplies the evaluation contract for future endpoint detectors; no detector output is currently connected. Three behavior tests cover valid scores/tolerance boundary, malformed schemas, and missing/low-confidence endpoints. `npm test` passes 129 tests.

### Scoring local prediction files

`npm run score:bat-reference -- /path/to/reference.json /path/to/predictions.json MAX_ERROR_PIXELS` validates the reference and scores a local prediction file. Prediction JSON uses `{ "version": 1, "width": ..., "height": ..., "frames": [{ "frame": ..., "time": ..., "points": [...] }] }`. Each frame must match the reference's index and time exactly and contain four entries in canonical order; each entry is `{ "name": "handle-top", "x": 0.5, "y": 0.5, "confidence": 1 }` with the corresponding point name, or `null` for a missing point. The command prints aggregate scores and exits nonzero on failed coverage/tolerance or malformed input. Use outputs from the exact same decoded source frames; matching metadata alone cannot prove the model processed the intended image. A synthetic reference-to-prediction smoke passed; no detector accuracy follows.

## Local bat keypoint annotation tool

`scripts/bat-annotator.html` opens as a local static page. Select a clip, enter its nominal frame rate, set a frame stride, and click the bat points in order: handle top, splice, blade middle, toe. Press Enter to save the frame; A/D or arrow keys move by the selected stride. Export produces a JSON file with source dimensions, declared frame rate, frame index/time, and named normalized points. Video remains in the browser tab and is not uploaded. The exporter was exercised in headless Chromium with the local Pexels clip: frame-zero load, four clicks, save, and downloaded JSON checks passed at 1080×1920/30 fps with all four names and no browser errors. This verifies tool operation only; the clicks were synthetic and do not constitute human bat labels.

The annotator clamps the frame index at the end of a clip; a browser check stepped beyond the end and confirmed the exported index/time stayed within the clip. The frame index is calculated from a user-entered nominal FPS, and the video is seeked by time. Variable-frame-rate sources or inaccurate FPS declarations can therefore mislabel frame indices/times; verify source timing and annotate decoded frames consistently before using the references for accuracy claims. The tool is not yet connected to a detector scorer. Keep source footage and exports outside the repository.

## Reference-harness frame-zero seek fix

The annotated pose browser harness now skips a seek when the video is already within one 30 fps frame of the requested time. This avoids waiting forever for `seeked` when a tiny positive time (for example 0.0001 s) is clamped to the current 0 s position. After an actual seek, it checks the resulting `currentTime` against the requested time. A real-worker run at 0.0001 s on the existing synthetic smoke reference processed one frame and passed its deliberately loose 1000-pixel tolerance. This verifies the harness boundary only; it is not pose accuracy evidence. The requested time is still a media-time position, not a measured exposure timestamp.

## Multi-person ambiguity handling

The worker requests up to two poses and emits no player landmarks when it detects more than one person. This immediately resets movement, clears the overlay and cancels delayed calibration and pending hand-motion samples; returning to one detected person requires recalibration. The change passed development/production camera browser tests, a real-worker fixture with two composited people, 126 unit tests and production build. The existing full-body recording replay from 12 seconds processed 30 single-person frames and rejected 63 ambiguous frames, with 1,625 confident rig/target comparisons and no score changes. Comparison with the model's targets is not accuracy ground truth. A second person is visibly present later in that source segment.

This is an ambiguity check, not identity recognition. Missed people and sequential player replacement remain possible. A second pose can increase processing time; representative real-device measurements are still needed. The recording begins too close to the camera for calibration, so replay calibration must use a suitable seek point rather than assuming the first frame is valid.

## Independent image-point validation

`npm run test:pose-reference` accepts a local unmirrored, pre-cropped WebM and its local JSON reference. It seeks to annotated times, runs the real pose worker sequentially and compares image points in source pixels. It does not run the rig or verify 3D accuracy, dynamic latency, bat detection or shot classification. Browser seeking selects the decoded frame at the requested media time; timestamps are not independent exposure measurements. Annotate the same decoded source frames.

```sh
HARDHIT_POSE_REPLAY=/path/to/camera.webm \
HARDHIT_POSE_REFERENCE=/path/to/manual-reference.json \
npm run test:pose-reference
```

Reference shape (example coordinates and tolerance only, not a calibrated fixture):

```json
{
  "version": 1,
  "annotationSource": "manual",
  "mirrored": false,
  "width": 1280,
  "height": 720,
  "maxErrorPixels": 12,
  "frames": [
    { "time": 2, "points": [
      { "index": 11, "x": 0.4, "y": 0.3 },
      { "index": 15, "x": 0.35, "y": 0.5 }
    ] }
  ]
}
```

Use normalized unmirrored image coordinates; source dimensions must match exactly. Landmark indices are MediaPipe's indices (for example 11/12 shoulders, 15/16 wrists, 23/24 hips, 27/28 ankles and 31/32 foot indices). Frame times must increase, and each frame needs unique point indices. Select a pixel tolerance from annotation uncertainty and the intended task before evaluating the model. The example tolerance is not a universal accuracy target.

All annotated points must be detected within tolerance with visibility at least 0.5; missing, out-of-image, non-finite and uncertain results fail rather than disappearing from coverage. Reports contain aggregate counts and pixel errors only. Reference files and recordings stay outside the repository, with no upload by this harness.

`annotationSource: "manual"` is a declaration by the annotator, not automated proof of independence. Do not generate manual reference coordinates from the pose model being evaluated. Use `"synthetic-smoke"` for synthetic/model-derived fixtures; their output explicitly says they are not accuracy evidence. Existing overlaid screen recordings also have limitations and cannot establish independent 3D ground truth.
