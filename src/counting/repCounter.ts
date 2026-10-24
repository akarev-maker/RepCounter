import type { AngleSample, RepEvent } from '../types';
import { MedianSmoother } from './smoothing';

/**
 * Pure rep-counting state machine. Imports NOTHING from React or MediaPipe so
 * it can be unit tested with plain angle sequences.
 *
 * A rep for a flex-based movement (e.g. curl) is a full cycle:
 *   extended -> flexed -> extended
 * The counter starts in `unknown` and only arms itself after it has seen a
 * real extension, so a clip that begins mid-rep (or regains tracking while
 * the joint is bent) cannot count a cycle it never saw start. Separate
 * flex/extend thresholds (hysteresis) stop jitter from toggling states.
 */

export type RepState = 'unknown' | 'extended' | 'flexed';

export interface RepCounterConfig {
  /** Angle at/below which we consider the joint flexed (bottom of movement). */
  flexEnter: number;
  /** Angle at/above which we consider the joint extended (top of movement). */
  extendEnter: number;
  /** Min landmark visibility to trust a frame [0..1]. */
  minVisibility: number;
  /** Consecutive low-confidence frames before we declare tracking lost. */
  lostFramesThreshold: number;
  /** Median smoothing window (frames). */
  smoothingWindow: number;
}

export const DEFAULT_CONFIG: RepCounterConfig = {
  flexEnter: 70,
  extendEnter: 150,
  minVisibility: 0.6,
  lostFramesThreshold: 5,
  smoothingWindow: 5,
};

export interface RepCounterSnapshot {
  count: number;
  state: RepState;
  reps: RepEvent[];
  trackingLost: boolean;
}

export class RepCounter {
  private readonly cfg: RepCounterConfig;
  private smoother: MedianSmoother;

  private state: RepState = 'unknown';
  private count = 0;
  private reps: RepEvent[] = [];

  private lowConfidenceRun = 0;
  /** Last timestamp seen in the extended position; marks where a rep starts. */
  private lastExtendedMs = 0;
  private trackingLost = false;
  private lastTsMs = -Infinity;

  constructor(config: Partial<RepCounterConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.smoother = new MedianSmoother(this.cfg.smoothingWindow);
  }

  reset(): void {
    this.smoother.reset();
    this.state = 'unknown';
    this.count = 0;
    this.reps = [];
    this.lowConfidenceRun = 0;
    this.lastExtendedMs = 0;
    this.trackingLost = false;
    this.lastTsMs = -Infinity;
  }

  /**
   * Feed one frame. Idempotent on timestamp: a sample whose tsMs is not
   * strictly greater than the previous one is ignored, so replaying or
   * re-emitting the same frame cannot duplicate reps.
   */
  push(sample: AngleSample): RepCounterSnapshot {
    if (sample.tsMs <= this.lastTsMs) return this.snapshot();
    this.lastTsMs = sample.tsMs;

    // Confidence gate.
    if (sample.angle === null || sample.minVisibility < this.cfg.minVisibility) {
      this.lowConfidenceRun += 1;
      if (this.lowConfidenceRun >= this.cfg.lostFramesThreshold) {
        // Discard any in-progress cycle. A new rep needs a fresh extension.
        this.trackingLost = true;
        this.state = 'unknown';
        this.smoother.reset();
      }
      return this.snapshot();
    }

    // Recovered confidence.
    this.lowConfidenceRun = 0;
    this.trackingLost = false;

    const a = this.smoother.push(sample.angle);

    if (this.state === 'unknown') {
      if (a >= this.cfg.extendEnter) {
        this.state = 'extended';
        this.lastExtendedMs = sample.tsMs;
      }
    } else if (this.state === 'extended') {
      if (a >= this.cfg.extendEnter) this.lastExtendedMs = sample.tsMs;
      else if (a <= this.cfg.flexEnter) this.state = 'flexed';
    } else if (a >= this.cfg.extendEnter) {
      // flexed -> back to extension completes the rep.
      this.count += 1;
      this.reps.push({ index: this.count, tsMs: sample.tsMs, startMs: this.lastExtendedMs });
      this.state = 'extended';
      this.lastExtendedMs = sample.tsMs;
    }

    return this.snapshot();
  }

  snapshot(): RepCounterSnapshot {
    return {
      count: this.count,
      state: this.state,
      reps: [...this.reps],
      trackingLost: this.trackingLost,
    };
  }
}

/**
 * Convenience for tests / batch analysis: run a whole sequence and return the
 * final snapshot.
 */
export function countSequence(
  samples: AngleSample[],
  config: Partial<RepCounterConfig> = {},
): RepCounterSnapshot {
  const c = new RepCounter(config);
  let snap = c.snapshot();
  for (const s of samples) snap = c.push(s);
  return snap;
}
