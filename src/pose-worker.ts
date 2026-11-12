import { PoseLandmarker } from '@mediapipe/tasks-vision';

type Request = { type: 'init'; modelUrl: string } | { type: 'frame'; bitmap: ImageBitmap; timestamp: number };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };
let landmarker: PoseLandmarker | null = null;

scope.onmessage = event => {
  if (event.data.type === 'init') {
    const modelUrl = event.data.modelUrl;
    void (async () => {
      try {
        const wasmLoaderPath = new URL('../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js', import.meta.url).href;
        const wasmBinaryPath = new URL('../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm', import.meta.url).href;
        landmarker = await PoseLandmarker.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
          baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1, canvas: new OffscreenCanvas(1, 1)
        });
        scope.postMessage({ type: 'ready' });
      } catch (error) {
        scope.postMessage({ type: 'error', detail: error instanceof Error ? error.message : String(error) });
      }
    })();
    return;
  }
  const { bitmap, timestamp } = event.data;
  try {
    if (!landmarker) throw new Error('Pose tracker is not initialized');
    const result = landmarker.detectForVideo(bitmap, timestamp);
    scope.postMessage({ type: 'result', landmarks: result.landmarks[0] ?? [], worldLandmarks: result.worldLandmarks[0] ?? [], timestamp });
  } catch (error) {
    scope.postMessage({ type: 'error', detail: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
