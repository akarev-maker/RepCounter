export type Unit = 'lb' | 'kg';
export type Side = 'left' | 'right';
export type Effort = 'easy' | 'just-right' | 'hard' | 'failed';
/** 'one' = a single working arm; 'both' = each arm counted separately (together or alternating). */
export type ArmMode = 'one' | 'both';

export interface SessionSummary {
  id: string;
  dateISO: string;
  exerciseId: string;
  exerciseLabel: string;
  /** Working arm for one-arm sets; null for both-arm sets. */
  side: Side | null;
  /** Missing on sets saved before both-arm mode existed; treat as 'one'. */
  mode?: ArmMode;
  weight: number;
  unit: Unit;
  /**
   * Reps used for progression. One-arm sets: the confirmed count.
   * Both-arm sets: the weaker arm's count, min(left, right).
   */
  reps: number;
  /** Confirmed count per arm, for both-arm sets only. */
  perArm?: { left: number; right: number };
  /** Reps that were counted but did not reach full depth (squats). */
  shallowReps?: number;
  effort: Effort;
}

export interface RepEvent {
  index: number;
  /** Media time the rep completed (returned to extension). */
  tsMs: number;
  /** Media time the rep began (last extended frame before flexing). */
  startMs: number;
  /**
   * Lowest (smoothed) value reached during the rep, in the exercise's
   * measure: degrees for curls, hip height for squats (see registry).
   */
  bottomAngle: number;
  /** Counted, but did not reach the exercise's full-depth value. */
  shallow: boolean;
}

/** One sampled frame of analysis input, consumed by the pure rep counter. */
export interface AngleSample {
  tsMs: number;
  /** Joint angle in degrees, or null when it could not be computed. */
  angle: number | null;
  /** Lowest visibility among the three tracked landmarks [0..1]. */
  minVisibility: number;
}

/** Landmark in normalized image coordinates [0..1]. */
export interface NormPoint {
  x: number;
  y: number;
  visibility?: number;
}

/** Raw pose for one sampled frame: all 33 landmarks, or null if no person found. */
export interface PoseFrame {
  tMs: number;
  lms: NormPoint[] | null;
}

/** Overlay data for one tracked arm. `side` is null for exercises without sides. */
export interface ArmTrack {
  side: Side | null;
  frames: AnalyzedFrame[];
}

/** Stored result for one analyzed frame. Replayed by the overlay; never re-counted. */
export interface AnalyzedFrame {
  /** Media time in ms. */
  tMs: number;
  /** Normalized [proximal, joint, distal] points, or null if no pose. */
  pts: [NormPoint, NormPoint, NormPoint] | null;
  angle: number | null;
  /** Text drawn next to the joint, e.g. "92°" or "45% depth". */
  label: string | null;
  confident: boolean;
  trackingLost: boolean;
  /** Reps completed up to and including this frame. */
  count: number;
}

export interface ProgressionSettings {
  repRangeMin: number;
  repRangeMax: number;
  increment: number;
  unit: Unit;
  successSetsRequired: number;
}

export interface Suggestion {
  weight: number;
  /** Unit of the set the suggestion is based on. */
  unit: Unit;
  reps: number;
  reason: string;
}
