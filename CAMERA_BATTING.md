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

The initial category-filtered run also found zero bats; the unfiltered run above established that inference was functioning by detecting the person in every sample. These timings are for this local desktop/headless experiment, exclude capture and rendering, and are not mobile performance measurements. The candidate is rejected for integration based on this fixture. No bat endpoints, face orientation or swing accuracy were demonstrated, and zero emitted bat boxes provides no meaningful estimate of false-positive behavior on other scenes.

Reproducibility identifiers: model [EfficientDet-Lite0 int8](https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite), SHA-256 `0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb`; source video SHA-256 `5bd6ddce3a13375918e0827ad96f3172a1b2cd24bbb9075f323271b45945151b`; annotation JSON SHA-256 `7d3ac6d62aa39fa46caa4efb036f40c4780e0ed9a06c2135a81698808c08c292`. The disposable evaluation script and detailed local results are `/private/tmp/hardhit-evaluate-bat.mjs` and `/private/tmp/hardhit-bat-candidate-results.json`; they may disappear with temporary-file cleanup.

The [Kushal Dev cricket detector repository](https://github.com/kushaldev75/Bat-Ball-Tracking-System) is another lead: its public file tree contains a roughly 14.4 MB `results/best.pt` checkpoint and its training configuration names `yolov5s.pt`, despite the README describing a larger model. It predicts bat/ball boxes rather than endpoint keypoints. This checkpoint has not been executed, converted, benchmarked or approved as a runtime dependency; a repository licence alone is not treated here as verification of every underlying asset's licence. The other indexed webcam-analysis repository inspected returned 404, so search snippets were not accepted as usable implementation evidence.

### Cricket-specific YOLOv5 checkpoint follow-up

The resumed goal prompted evaluation of the previously untested cricket checkpoint. Its SHA-256 is `6edc0649f2b4ccdaba9e8e8bd635b905adaa4cc5c2e9f3b92839f7bee25834c2`; the inspected repository tree was `9adcc88299977fc33ba066fa2922d1416e17fca7`. Restricted PyTorch loading identified 7,066,239 parameters, classes `ball` and `bat`, and the older Focus/SPP YOLOv5s architecture. The evaluation environment and checkpoint remain outside the project. No checkpoint-provided Python implementation was imported and unrestricted pickle loading was not used; known module types were allowlisted and inference operations were supplied by the local evaluator.

A labeled training-image positive control produced one bat detection at confidence 0.688 and box intersection-over-union 0.776. On the same 23 sampled Pexels frames used above, RGB input letterboxed to 640×640 with confidence threshold 0.2 and nonmaximum suppression at IoU 0.45 produced bat detections in 15 frames, but only two had bat-box IoU ≥0.5. Mean best-box IoU over all 23 frames, treating missing detections as zero, was 0.209. Median local CPU forward-pass time was about 53 ms; this is neither browser nor capture-to-display timing. This is useful feasibility evidence but insufficient for selecting the checkpoint for runtime grip/tip tracking. No endpoint or bat-face output exists in this checkpoint. The local evaluator has not been parity-checked against a complete historical YOLOv5 runtime, so the positive control supports operation without proving exact implementation equivalence.

Local files: `/private/tmp/hardhit-evaluate-cricket.py`, `/private/tmp/hardhit-cricket-candidate-results.json`, `/private/tmp/hardhit-cricket-control.py`. Further model work remains possible; live validation is not a reason to stop unrelated implementation. The next bounded reliability change rejects frames where multiple people are detected, rather than applying the first pose to the calibrated player.

Next evidence needed remains representative full-body/actual-bat footage and live review of the corrected posture. The public single-stroke sample can support later bat experiments but does not close those gates. Physical-bat inference and camera scoring remain unimplemented.

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
