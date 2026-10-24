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
  // Sided exercises measure one fixed limb. Others (squat) measure whichever
  // side is more visible in each frame: from the side, the far leg is hidden
  // and MediaPipe guesses it, so the near leg is the one to trust.
  const triplets = exercise.sided
    ? [tripletFor(exercise, side)]
    : [exercise.landmarks.left, exercise.landmarks.right];
  const counter = new RepCounter({
    flexEnter: exercise.flexEnter,
    fullDepth: exercise.fullDepth,
    minRepMs: exercise.minRepMs,
    extendEnter: exercise.extendEnter,
    minVisibility: MIN_VISIBILITY,
  });

  const measure = (pf: PoseFrame, [iA, iB, iC]: [number, number, number]) => {
    const a = pf.lms?.[iA];
    const b = pf.lms?.[iB];
    const c = pf.lms?.[iC];
    if (!a || !b || !c) return null;
    const pts: [Pt, Pt, Pt] = [a, b, c];
    const deg = jointAngle(a, b, c, aspect);
    const angle = Number.isNaN(deg) ? null : deg;
    const value = exercise.measure === 'hipHeight' ? hipHeight(a, b, c) : angle;
    return { pts, angle, value, vis: minVisibility(pts) };
  };

  const score = (pf: PoseFrame): AnalyzedFrame => {
    // When both limbs are clearly visible, average their angles: from the
    // front, one knee often reads 10-15 deg straighter than the other.
    // Otherwise use the most visible limb (if that is below the visibility
    // bar, the counter treats the frame as low confidence).
    const ms = triplets.map((t) => measure(pf, t)).filter((m) => m !== null);
    const good = ms.filter((m) => m.value !== null && m.vis >= MIN_VISIBILITY);
    const best = ms.reduce<(typeof ms)[number] | null>((b, m) => (!b || m.vis > b.vis ? m : b), null);
    const pts = best?.pts ?? null;
    const value =
      good.length > 1 ? good.reduce((sum, m) => sum + m.value!, 0) / good.length : (best?.value ?? null);
    const vis = best?.vis ?? 0;
    const snap = counter.push({ tsMs: pf.tMs, angle: value, minVisibility: vis });
    let label: string | null = null;
    if (value !== null) {
      label = exercise.measure === 'hipHeight' && exercise.depth ? `${exercise.depth.format(value)} depth` : `${Math.round(value)}\u00b0`;
    }
    return {
      tMs: pf.tMs,
      pts,
      angle: best?.angle ?? null,
      label,
      confident: value !== null && vis >= MIN_VISIBILITY,
      trackingLost: snap.trackingLost,
      count: snap.count,
    };
  };
  return { score, reps: (): RepEvent[] => counter.snapshot().reps };
}

/**
 * Hip height above the knee as a percentage of shin length, from vertical
 * image positions only (y grows downward). Null when the shin is too short
 * on screen to measure, e.g. the legs are out of frame or the person is lying down.
 */
export function hipHeight(hip: Pt, knee: Pt, ankle: Pt): number | null {
  const shin = ankle.y - knee.y;
  if (shin < 0.02) return null;
  return ((knee.y - hip.y) / shin) * 100;
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
