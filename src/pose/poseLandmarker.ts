import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * WASM is copied from node_modules into /public/mediapipe/wasm by
 * scripts/copy-mediapipe-wasm.mjs, so the runtime always matches the installed
 * JS package version and works offline.
 */
const WASM_ROOT = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_PATH = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

async function create(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  let vision;
  try {
    vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  } catch {
    throw new Error('Could not load the pose engine files. Reload the page and try again.');
  }
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

/** Load the Pose Landmarker once (VIDEO mode, single pose). GPU first, CPU fallback. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    try {
      return await create('GPU');
    } catch {
      try {
        return await create('CPU');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        throw new Error(
          msg.startsWith('Could not load')
            ? msg
            : 'Could not load the pose model. Check that the page finished loading and retry.',
        );
      }
    }
  })();

  landmarkerPromise.catch(() => {
    landmarkerPromise = null; // allow retry
  });
  return landmarkerPromise;
}

/**
 * MediaPipe VIDEO mode requires strictly increasing timestamps for the whole
 * lifetime of the landmarker, not just within one video. Each analysis run gets
 * a clock that maps media time onto a timeline that continues after the
 * previous run, so analyzing a second clip (or the same clip again) never
 * sends an older timestamp.
 */
let lastTimestampMs = 0;

export function createTimestampClock(): (mediaTimeMs: number) => number {
  const base = lastTimestampMs + 1;
  return (mediaTimeMs: number) => {
    const ts = Math.max(lastTimestampMs + 1, base + Math.round(mediaTimeMs));
    lastTimestampMs = ts;
    return ts;
  };
}
