import type { AnalyzedFrame, PoseFrame, RepEvent, Side } from '../types';
import { RepCounter } from '../counting/repCounter';
import { jointAngle, minVisibility, type Pt } from '../pose/landmarks';
import { tripletFor, type ExerciseDef } from '../exercises/registry';

export const MIN_VISIBILITY = 0.6;

export interface ScoredResult {
  frames: AnalyzedFrame[];
  reps: RepEvent[];
  count: number;
  /** Fraction of frames where the tracked joint was confidently visible [0..1]. */
  trackedFraction: number;
  everLostTracking: boolean;
}

/**
 * Turns raw pose frames into per-frame overlay data plus a rep count for ONE
 * side. Pure apart from the RepCounter state it owns; no DOM or MediaPipe.
 */
export function createScorer(exercise: ExerciseDef, side: Side | null, aspect: number) {
  const [iA, iB, iC] = tripletFor(exercise, side);
  const counter = new RepCounter({
    flexEnter: exercise.flexEnter,
    extendEnter: exercise.extendEnter,
    minVisibility: MIN_VISIBILITY,
  });

  const score = (pf: PoseFrame): AnalyzedFrame => {
    const a = pf.lms?.[iA];
    const b = pf.lms?.[iB];
    const c = pf.lms?.[iC];
    let pts: [Pt, Pt, Pt] | null = null;
    let angle: number | null = null;
    let vis = 0;
    if (a && b && c) {
      pts = [a, b, c];
      const deg = jointAngle(a, b, c, aspect);
      angle = Number.isNaN(deg) ? null : deg;
      vis = minVisibility(pts);
    }
    const snap = counter.push({ tsMs: pf.tMs, angle, minVisibility: vis });
    return {
      tMs: pf.tMs,
      pts,
      angle,
      confident: angle !== null && vis >= MIN_VISIBILITY,
      trackingLost: snap.trackingLost,
      count: snap.count,
    };
  };
  return { score, reps: (): RepEvent[] => counter.snapshot().reps };
}

export function scoreFrames(
  poseFrames: PoseFrame[],
  exercise: ExerciseDef,
  side: Side | null,
  aspect: number,
): ScoredResult {
  const scorer = createScorer(exercise, side, aspect);
  const frames = poseFrames.map(scorer.score);
  const reps = scorer.reps();
  const confident = frames.filter((f) => f.confident).length;
  return {
    frames,
    reps,
    count: reps.length,
    trackedFraction: frames.length ? confident / frames.length : 0,
    everLostTracking: frames.some((f) => f.trackingLost),
  };
}

export type OtherSideHint =
  /** The other arm did the work: offer to switch arms. */
  | { kind: 'switch'; side: Side; count: number }
  /** Both arms did reps: offer both-arm mode. */
  | { kind: 'both'; side: Side; count: number };

/**
 * In one-arm mode, look at the arm that is NOT being counted and suggest a
 * better setting. Nothing from the other arm is ever added to the result.
 */
export function otherSideHint(
  poseFrames: PoseFrame[],
  exercise: ExerciseDef,
  side: Side,
  aspect: number,
  current: ScoredResult,
): OtherSideHint | null {
  if (!exercise.sided) return null;
  const other: Side = side === 'left' ? 'right' : 'left';
  const r = scoreFrames(poseFrames, exercise, other, aspect);
  if (r.trackedFraction < 0.5 || r.count === 0) return null;
  if (current.count >= 2 && r.count >= 2) return { kind: 'both', side: other, count: r.count };
  if (r.count > current.count) return { kind: 'switch', side: other, count: r.count };
  return null;
}
