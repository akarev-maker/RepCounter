import type { AnalyzedFrame, PoseFrame, RepEvent, Side } from '../types';
import { RepCounter } from '../counting/repCounter';
import { jointAngle, minVisibility, type Pt } from '../pose/landmarks';
import { tripletFor, type ExerciseDef } from '../exercises/registry';

export const MIN_VISIBILITY = 0.6;
/**
 * Low-confidence frames in a row (at 15 fps, about 0.67 s) before a rep in
 * progress is dropped. On RepCount-A pull-ups, 10 instead of 5 found 161 of
 * 162 test reps instead of 152, with squats and raises unchanged.
 */
export const LOST_FRAMES = 10;

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
  // that rest at a small angle (raises), feed it 180 - angle so rest is the
  // high end. Thresholds in the registry stay in real angles.
  const flip = !!exercise.restsLow;
  const counter = new RepCounter({
    flexEnter: flip ? 180 - exercise.flexEnter : exercise.flexEnter,
    fullDepth: flip && exercise.fullDepth !== undefined ? 180 - exercise.fullDepth : exercise.fullDepth,
    minRepMs: exercise.minRepMs,
    extendEnter: flip ? 180 - exercise.extendEnter : exercise.extendEnter,
    minVisibility: MIN_VISIBILITY,
    lostFramesThreshold: LOST_FRAMES,
  });

  // Standing-height reference per limb, for 'hipDrop'.
  const standing = triplets.map(() => new StandingHeight());

  const measure = (pf: PoseFrame, [iA, iB, iC]: [number, number, number], limb: number) => {
    const a = pf.lms?.[iA];
    const b = pf.lms?.[iB];
    const c = pf.lms?.[iC];
    if (!a || !b || !c) return null;
    const pts: [Pt, Pt, Pt] = [a, b, c];
    const deg = jointAngle(a, b, c, aspect);
    const angle = Number.isNaN(deg) ? null : deg;
    const vis = minVisibility(pts);
    if (exercise.measure !== 'hipDrop') return { pts, angle, value: angle, vis, settled: false };
    const { value, settled } = standing[limb].push(pf.tMs, a, b, c, vis >= MIN_VISIBILITY);
    return { pts, angle, value, vis, settled };
  };

  const score = (pf: PoseFrame): AnalyzedFrame => {
    // When both limbs are clearly visible, average their angles: from the
    // front, one knee often reads 10-15 deg straighter than the other.
    // Otherwise use the most visible limb (if that is below the visibility
    // bar, the counter treats the frame as low confidence).
    const ms = triplets.map((t, i) => measure(pf, t, i)).filter((m) => m !== null);
    // The standing reference just changed: a rep in progress was measured
    // against the old one, so it can't be trusted.
    if (ms.some((m) => m.settled)) counter.rearm();
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
      label = exercise.measure === 'hipDrop' && exercise.depth
        ? `${exercise.depth.format(value)}${exercise.depth.suffix}`
        : `${Math.round(value)}\u00b0`;
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
  return {
    score,
    /** Call after the last frame; counts a rep the video ended right after. */
    finish: (): RepEvent[] => counter.finish().reps,
    reps: (): RepEvent[] => counter.snapshot().reps,
  };
}

/** Recent history used to detect a stable change of camera distance. */
export const HIP_DROP_WINDOW_MS = 6000;
/** Standing still this long, below the reference, makes it the new reference. */
export const HIP_DROP_SETTLE_MS = 2000;

/**
 * Standing height for one leg, for the 'hipDrop' measure: a retained
 * reference from clearly visible hip-to-ankle heights (y grows downward).
 * Expiring recent samples never lowers the reference: a bottom hold or slow
 * descent must not become "standing" just because time has passed.
 * - Heights are median-smoothed before they can become the reference, so a
 *   one-frame ankle glitch can't inflate it.
 * - If the height holds steady below the reference for HIP_DROP_SETTLE_MS
 *   while the legs look straight (the person stepped back from the phone),
 *   the older, taller heights are dropped and `push` reports `settled` so
 *   the in-progress rep is discarded. "Straight" means the knee sits at
 *   least 30% of the way from ankle to hip, so a squat held at the bottom
 *   doesn't settle. When the knee is badly placed (phone low and in front),
 *   a long bottom hold can still settle and lose that rep (an undercount,
 *   never a false rep).
 */
export class StandingHeight {
  private recent: { tMs: number; h: number; kneeFraction: number }[] = [];
  private raw: number[] = [];
  private referenceHeight = 0;

  /** Value = current on-screen height as a percentage of the standing reference. */
  push(tMs: number, hip: Pt, knee: Pt, ankle: Pt, visible: boolean): { value: number | null; settled: boolean } {
    const h = ankle.y - hip.y;
    if (h < 0.02) return { value: null, settled: false };
    let settled = false;
    if (visible) {
      this.raw.push(h);
      if (this.raw.length > 5) this.raw.shift();
      const smooth = [...this.raw].sort((a, b) => a - b)[Math.floor(this.raw.length / 2)];
      this.referenceHeight = Math.max(this.referenceHeight, smooth);
      this.recent.push({ tMs, h: smooth, kneeFraction: (knee.y - hip.y) / h });
      while (this.recent[0].tMs < tMs - HIP_DROP_WINDOW_MS) this.recent.shift();
      settled = this.settle(tMs);
      // A short pause after stepping back can also establish a new scale,
      // but needs stricter posture and stability evidence. Always rearm the
      // counter on recalibration; a changed denominator cannot finish a rep.
      if (!settled) settled = this.settle(tMs, 400, 0.48, 0.02);
    }
    if (!this.recent.length) return { value: null, settled };
    return { value: (h / this.referenceHeight) * 100, settled };
  }

  private settle(tMs: number, duration = HIP_DROP_SETTLE_MS, kneeFraction = 0.3, tolerance = 0.05): boolean {
    const from = tMs - duration;
    const i = this.recent.findIndex((r) => r.tMs >= from);
    // Need visible frames covering the whole settle period.
    if (i <= 0 || this.recent[i].tMs - from > 200) return false;
    const span = this.recent.slice(i);
    if (!span.every((r) => r.kneeFraction >= kneeFraction)) return false;
    let lo = Infinity;
    let hi = 0;
    for (const r of span) {
      lo = Math.min(lo, r.h);
      hi = Math.max(hi, r.h);
    }
    if ((hi - lo) / hi > tolerance || hi > this.referenceHeight * 0.92) return false;
    this.recent = span;
    this.referenceHeight = hi;
    return true;
  }
}

export function scoreFrames(
  poseFrames: PoseFrame[],
  exercise: ExerciseDef,
  side: Side | null,
  aspect: number,
): ScoredResult {
  const scorer = createScorer(exercise, side, aspect);
  const frames = poseFrames.map(scorer.score);
  const reps = scorer.finish();
  // A rep finished by `finish` happens after the last frame's count was taken.
  const last = frames[frames.length - 1];
  if (last && last.count < reps.length) frames[frames.length - 1] = { ...last, count: reps.length };
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
