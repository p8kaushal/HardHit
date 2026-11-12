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
