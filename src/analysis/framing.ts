import type { NormPoint, PoseFrame, Side } from '../types';
import { tripletFor, type ExerciseDef } from '../exercises/registry';
import { MIN_VISIBILITY } from './scoreFrames';

/**
 * Framing: are the body points an exercise is measured from actually in view?
 * Used live in the camera (before and during recording) and after a scan to
 * say exactly what to change. Same visibility bar as counting.
 */

/** Advice after a scan names a point only if it was missing in at least this share of frames. */
const ADVICE_MIN_SHARE = 0.2;

const NAMES: Record<number, string> = {
  11: 'left shoulder', 12: 'right shoulder', 13: 'left elbow', 14: 'right elbow',
  15: 'left wrist', 16: 'right wrist', 23: 'left hip', 24: 'right hip',
  25: 'left knee', 26: 'right knee', 27: 'left ankle', 28: 'right ankle',
};
const pointName = (i: number) => NAMES[i] ?? 'body';

/**
 * Point triplets that must be in view. Sided exercises need every counted
 * arm. Others are measured from whichever side is visible, so one side is
 * enough (a side-view squat hides the far leg).
 */
export interface FramingNeed {
  triplets: [number, number, number][];
  /** True: every triplet must be visible. False: any one is enough. */
  all: boolean;
}

export function framingNeed(ex: ExerciseDef, sides: (Side | null)[]): FramingNeed {
  if (ex.sided) return { triplets: sides.map((s) => tripletFor(ex, s)), all: true };
  return { triplets: [ex.landmarks.left, ex.landmarks.right], all: false };
}

type PointState = 'ok' | 'out' | 'hidden';

/**
 * Same test as counting: visible enough is fine, wherever it is. A point
 * that isn't is "out" when the model places it past the frame edge.
 */
function pointState(p: NormPoint | undefined): PointState {
  if (!p) return 'hidden';
  if ((p.visibility ?? 0) >= MIN_VISIBILITY) return 'ok';
  return p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ? 'out' : 'hidden';
}

export type FramingStatus =
  | { kind: 'ok' }
  | { kind: 'nobody' }
  /** The first point to fix, and why. */
  | { kind: 'fix'; point: number; why: 'out' | 'hidden' };

/** One frame: in view, nobody found, or the first missing point. */
export function checkFrame(lms: NormPoint[] | null, need: FramingNeed): FramingStatus {
  if (!lms) return { kind: 'nobody' };
  const missing = need.triplets.map((t) => t.filter((i) => pointState(lms[i]) !== 'ok'));
  const done = need.all ? missing.every((m) => m.length === 0) : missing.some((m) => m.length === 0);
  if (done) return { kind: 'ok' };
  // Report from the triplet closest to working (fewest missing points).
  const pick = need.all
    ? missing.find((m) => m.length > 0)!
    : missing.reduce((a, b) => (b.length < a.length ? b : a));
  const point = pick[0];
  return { kind: 'fix', point, why: pointState(lms[point]) === 'out' ? 'out' : 'hidden' };
}

/** Short text for the live camera pill. */
export function framingLabel(s: FramingStatus): string {
  if (s.kind === 'ok') return 'In frame';
  if (s.kind === 'nobody') return 'Step into the frame';
  const name = pointName(s.point);
  return s.why === 'out' ? `Step back · ${name} out of frame` : `${cap(name)} hidden · face the phone`;
}

/**
 * After a scan: the point that was missing most often, and a sentence on
 * what to change. Null when tracking was fine for most of the clip.
 */
export function framingAdvice(frames: PoseFrame[], need: FramingNeed): string | null {
  if (!frames.length) return null;
  let nobody = 0;
  const counts = new Map<number, { out: number; hidden: number }>();
  for (const f of frames) {
    const s = checkFrame(f.lms, need);
    if (s.kind === 'nobody') nobody++;
    if (s.kind !== 'fix') continue;
    const c = counts.get(s.point) ?? { out: 0, hidden: 0 };
    c[s.why]++;
    counts.set(s.point, c);
  }
  if (nobody > frames.length / 2) {
    return 'No one was found in most of the clip. Prop the phone a few steps away so your whole body is in frame.';
  }
  const worst = [...counts.entries()].sort((a, b) => b[1].out + b[1].hidden - (a[1].out + a[1].hidden))[0];
  if (!worst || worst[1].out + worst[1].hidden < frames.length * ADVICE_MIN_SHARE) return null;
  const [point, c] = worst;
  const name = pointName(point);
  const keep = need.all || need.triplets.length === 1
    ? listPoints(need.triplets.flat())
    : `your ${need.triplets[0].map((i) => pointName(i).split(' ')[1]).join(', ').replace(/, ([^,]*)$/, ' and $1')} on at least one side`;
  if (c.out >= c.hidden) {
    return `Your ${name} was out of frame for much of the clip. Move the phone back so ${keep} stay in view for every rep.`;
  }
  return `Your ${name} was hidden or hard to see for much of the clip. Keep it clear of your body and anything in front of it, and add light.`;
}

/** "your right shoulder, elbow and wrist", or "both shoulders, elbows and wrists". */
function listPoints(points: number[]): string {
  const names = [...new Set(points)].map(pointName);
  const sides = [...new Set(names.map((n) => n.split(' ')[0]))];
  const joints = [...new Set(names.map((n) => n.split(' ')[1]))];
  const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  if (sides.length > 1) return `both ${and(joints.map((j) => `${j}s`))}`;
  return `your ${sides[0]} ${and(joints)}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
