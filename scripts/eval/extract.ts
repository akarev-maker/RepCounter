// Runs the app's own pose pass (analyzeVideo) on a video URL and returns the
// raw landmarks. Loaded by extract.html in headless Chrome; see run.mjs.
import { analyzeVideo } from '../../src/analysis/analyzeVideo';
import { getPoseLandmarker } from '../../src/pose/poseLandmarker';
import { EXERCISES } from '../../src/exercises/registry';

async function extractPoses(url: string) {
  const video = document.getElementById('v') as HTMLVideoElement;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`cannot decode ${url}`));
    video.src = url;
  });
  // The exercise only affects the live preview, which is off here.
  const r = await analyzeVideo(video, { exercise: EXERCISES.squat, previewSides: [] });
  return {
    frames: r.poseFrames,
    w: video.videoWidth,
    h: video.videoHeight,
    durationMs: Math.round(video.duration * 1000),
  };
}

declare global {
  interface Window {
    extractPoses: typeof extractPoses;
    extractReady: Promise<unknown>;
  }
}
window.extractPoses = extractPoses;
window.extractReady = getPoseLandmarker();
