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
  // The counter expects reps to start and end at a high value. For movements
  // that rest bent, feed it 180 - angle so "bent" becomes the high end.
  const flip = !!exercise.startsBent;
  const counter = new RepCounter({
    flexEnter: flip ? 180 - exercise.extendEnter : exercise.flexEnter,
    fullDepth: flip && exercise.fullDepth !== undefined ? 180 - exercise.fullDepth : exercise.fullDepth,
    minRepMs: exercise.minRepMs,
    extendEnter: flip ? 180 - exercise.flexEnter : exercise.extendEnter,
    minVisibility: MIN_VISIBILITY,
  });

  // Recent clearly visible hip-to-ankle heights per limb, for 'hipDrop'.
  const heights = triplets.map(() => [] as { tMs: number; h: number }[]);

  const measure = (pf: PoseFrame, [iA, iB, iC]: [number, number, number], limb: number) => {
    const a = pf.lms?.[iA];
    const b = pf.lms?.[iB];
    const c = pf.lms?.[iC];
    if (!a || !b || !c) return null;
    const pts: [Pt, Pt, Pt] = [a, b, c];
    const deg = jointAngle(a, b, c, aspect);
    const angle = Number.isNaN(deg) ? null : deg;
    const vis = minVisibility(pts);
    const value = exercise.measure === 'hipDrop' ? hipDrop(heights[limb], pf.tMs, a, c, vis >= MIN_VISIBILITY) : angle;
    return { pts, angle, value, vis };
  };

  const score = (pf: PoseFrame): AnalyzedFrame => {
    // When both limbs are clearly visible, average their angles: from the
    // front, one knee often reads 10-15 deg straighter than the other.
    // Otherwise use the most visible limb (if that is below the visibility
    // bar, the counter treats the frame as low confidence).
    const ms = triplets.map((t, i) => measure(pf, t, i)).filter((m) => m !== null);
    const good = ms.filter((m) => m.value !== null && m.vis >= MIN_VISIBILITY);
    const best = ms.reduce<(typeof ms)[number] | null>((b, m) => (!b || m.vis > b.vis ? m : b), null);
    const pts = best?.pts ?? null;
    const value =
      good.length > 1 ? good.reduce((sum, m) => sum + m.value!, 0) / good.length : (best?.value ?? null);
    const vis = best?.vis ?? 0;
    const fed = value !== null && flip ? 180 - value : value;
    const snap = counter.push({ tsMs: pf.tMs, angle: fed, minVisibility: vis });
    let label: string | null = null;
    if (value !== null) {
      label = exercise.measure === 'hipDrop' && exercise.depth ? `${exercise.depth.format(value)} depth` : `${Math.round(value)}\u00b0`;
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

/** How far back 'hipDrop' looks for the standing height. */
export const HIP_DROP_WINDOW_MS = 6000;

/**
 * Hip-to-ankle height (vertical image position, y grows downward) as a
 * percentage of the tallest clearly visible height for this limb in the last
 * HIP_DROP_WINDOW_MS. Standing reads about 100 and parallel about 50, for
 * any camera height or distance. `recent` is this limb's history; only
 * clearly visible frames are added to it. Null when the legs are too short
 * on screen to measure or there is no history yet.
 */
export function hipDrop(
  recent: { tMs: number; h: number }[],
  tMs: number,
  hip: Pt,
  ankle: Pt,
  visible: boolean,
): number | null {
  const h = ankle.y - hip.y;
  if (h < 0.02) return null;
  if (visible) recent.push({ tMs, h });
  while (recent.length && recent[0].tMs < tMs - HIP_DROP_WINDOW_MS) recent.shift();
  if (!recent.length) return null;
  const tallest = recent.reduce((m, r) => Math.max(m, r.h), 0);
  return (h / tallest) * 100;
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
