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
  /**
   * Optional stricter angle for a full-depth rep. Reps that pass `flexEnter`
   * but never reach this still count, flagged `shallow`.
   */
  fullDepth?: number;
  /**
   * Optional shortest rep (ms, from leaving the top to returning). Faster
   * dips are ignored, e.g. a knee bending mid-stride while walking.
   */
  minRepMs?: number;
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
  /** Lowest smoothed angle since the current cycle started. */
  private cycleMin = Infinity;
  /** Last consecutive confident raw (unsmoothed) samples, for `finish`. */
  private lastRaw: { tsMs: number; angle: number }[] = [];

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
    this.cycleMin = Infinity;
    this.lastRaw = [];
  }

  /**
   * Call once after the last frame. The median smoother lags about two
   * frames, so a video that stops the moment the user is back at the top
   * would leave the last rep unfinished. Require two consecutive terminal
   * samples at the top, so one raw spike cannot bypass the smoother.
   */
  finish(): RepCounterSnapshot {
    if (this.state === 'flexed' && this.lastRaw.length >= 2) {
      const top = this.lastRaw.slice(-2).every((s) => s.angle >= this.cfg.extendEnter);
      const tsMs = this.lastRaw[this.lastRaw.length - 1].tsMs;
      if (top && tsMs - this.lastExtendedMs >= (this.cfg.minRepMs ?? 0)) {
        this.completeRep(tsMs);
        this.state = 'extended';
      }
    }
    return this.snapshot();
  }

  private completeRep(tsMs: number): void {
    this.count += 1;
    const bottom = Math.round(this.cycleMin);
    this.reps.push({
      index: this.count,
      tsMs,
      startMs: this.lastExtendedMs,
      bottomAngle: bottom,
      shallow: this.cfg.fullDepth !== undefined && bottom > this.cfg.fullDepth,
    });
  }

  /**
   * Discard any rep in progress (keeping the count). The next rep needs a
   * fresh extension, as after lost tracking.
   */
  rearm(): void {
    this.state = 'unknown';
    this.smoother.reset();
    this.lastRaw = [];
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
      // Finalization must not bridge a visibility gap, even a brief one.
      this.lastRaw = [];
      this.lowConfidenceRun += 1;
      if (this.lowConfidenceRun >= this.cfg.lostFramesThreshold) {
        // Discard any in-progress cycle. A new rep needs a fresh extension.
        this.trackingLost = true;
        this.state = 'unknown';
        this.smoother.reset();
        this.lastRaw = [];
      }
      return this.snapshot();
    }

    // Recovered confidence.
    this.lowConfidenceRun = 0;
    this.trackingLost = false;

    const a = this.smoother.push(sample.angle);
    this.lastRaw.push({ tsMs: sample.tsMs, angle: sample.angle });
    if (this.lastRaw.length > 3) this.lastRaw.shift();

    if (this.state === 'unknown') {
      if (a >= this.cfg.extendEnter) {
        this.state = 'extended';
        this.lastExtendedMs = sample.tsMs;
        this.cycleMin = a;
      }
    } else if (this.state === 'extended') {
      this.cycleMin = Math.min(this.cycleMin, a);
      if (a >= this.cfg.extendEnter) {
        this.lastExtendedMs = sample.tsMs;
        // Still at the top: the next rep's bottom is measured from here.
        this.cycleMin = a;
      } else if (a <= this.cfg.flexEnter) this.state = 'flexed';
    } else {
      this.cycleMin = Math.min(this.cycleMin, a);
      if (a >= this.cfg.extendEnter && sample.tsMs - this.lastExtendedMs < (this.cfg.minRepMs ?? 0)) {
        // Too quick to be a rep: treat it as never having left the top.
        this.state = 'extended';
        this.lastExtendedMs = sample.tsMs;
        this.cycleMin = a;
      } else if (a >= this.cfg.extendEnter) {
        // flexed -> back to extension completes the rep.
        this.completeRep(sample.tsMs);
        this.state = 'extended';
        this.lastExtendedMs = sample.tsMs;
        this.cycleMin = a;
      }
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
