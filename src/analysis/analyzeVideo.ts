import type { AnalyzedFrame, PoseFrame, Side } from '../types';
import { createTimestampClock, getPoseLandmarker } from '../pose/poseLandmarker';
import type { ExerciseDef } from '../exercises/registry';
import { createScorer } from './scoreFrames';

/**
 * Output of the single scan. Counting happens afterwards (scoreFrames), so the
 * arm or arm mode can change without scanning the video again.
 */
export interface AnalysisResult {
  /** Raw landmarks for every sampled frame. */
  poseFrames: PoseFrame[];
  stepMs: number;
  /** Displayed frame aspect ratio (width / height), used for angle math. */
  aspect: number;
}

export interface AnalyzeOptions {
  exercise: ExerciseDef;
  /** Arms to preview on screen while scanning (one entry per arm). */
  previewSides: (Side | null)[];
  /** Analysis sampling rate. 15 fps resolves even quick curls. */
  fps?: number;
  /** Called after each frame with one preview frame per entry in previewSides. */
  onFrame?: (frames: AnalyzedFrame[], progress: number) => void;
  signal?: AbortSignal;
}

/** Longest side of the frame passed to the model. Normalized output is unaffected. */
const MAX_INPUT_SIDE = 640;
const SEEK_TIMEOUT_MS = 3000;

function seekTo(video: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise((resolve) => {
    let timer = 0;
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve(ok);
    };
    const onSeeked = () => done(true);
    video.addEventListener('seeked', onSeeked);
    timer = window.setTimeout(() => done(false), SEEK_TIMEOUT_MS);
    video.currentTime = t;
  });
}

/**
 * Process the whole clip exactly once by seeking to evenly spaced media times.
 * Each frame is drawn to a canvas first: drawImage applies the clip's rotation
 * metadata (iPhone .mov files store landscape pixels plus a rotation flag), so
 * the model sees the same upright frame the user sees and landmark coordinates
 * line up with the displayed video.
 */
export async function analyzeVideo(
  video: HTMLVideoElement,
  opts: AnalyzeOptions,
): Promise<AnalysisResult> {
  const { exercise, previewSides, onFrame, signal } = opts;
  const fps = opts.fps ?? 15;
  const stepMs = 1000 / fps;

  const landmarker = await getPoseLandmarker();
  const nextTs = createTimestampClock();

  const duration = video.duration;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!Number.isFinite(duration) || duration <= 0 || !vw || !vh) {
    throw new Error('This video has no readable frames. Try a different clip.');
  }

  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create a drawing surface for analysis.');

  const aspect = vw / vh;
  const previews = previewSides.map((s) => createScorer(exercise, s, aspect).score);
  const poseFrames: PoseFrame[] = [];

  video.pause();
  // Evenly spaced samples, plus the very last frame: videos often stop the
  // moment the user is back at the top, and that frame finishes the last rep.
  const endMs = Math.max(0, Math.floor(duration * 1000) - 1);
  const total = Math.max(1, Math.floor(endMs / stepMs) + 2);
  let prevMs = -1;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const tMs = Math.min(Math.round(i * stepMs), endMs);
    if (tMs <= prevMs) continue;
    prevMs = tMs;
    if (!(await seekTo(video, tMs / 1000))) continue;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = landmarker.detectForVideo(canvas, nextTs(tMs));
    const lms = result.landmarks?.[0];
    const pf: PoseFrame = {
      tMs,
      lms: lms ? lms.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility })) : null,
    };
    poseFrames.push(pf);
    onFrame?.(
      previews.map((score) => score(pf)),
      (i + 1) / total,
    );
  }

  await seekTo(video, 0);

  if (import.meta.env.DEV) {
    (window as unknown as { __rcPoseFrames?: PoseFrame[] }).__rcPoseFrames = poseFrames;
  }

  return { poseFrames, stepMs, aspect };
}

/** Frame closest to a media time, or null if none within ~1.5 sampling steps. */
export function frameAt(frames: AnalyzedFrame[], tMs: number, stepMs: number): AnalyzedFrame | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tMs < tMs) lo = mid + 1;
    else hi = mid;
  }
  let best = frames[lo];
  if (lo > 0 && Math.abs(frames[lo - 1].tMs - tMs) < Math.abs(best.tMs - tMs)) best = frames[lo - 1];
  return Math.abs(best.tMs - tMs) <= stepMs * 1.5 ? best : null;
}
