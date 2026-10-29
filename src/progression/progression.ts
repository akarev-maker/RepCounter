import type { ProgressionSettings, SessionSummary, Suggestion, Unit } from '../types';

export const DEFAULT_PROGRESSION: ProgressionSettings = {
  repRangeMin: 5,
  repRangeMax: 8,
  increment: 5,
  unit: 'lb',
};

/** Local calendar day of a set, e.g. "2026-10-28". Sets on the same day are one workout. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sets grouped into workouts (one per day), newest workout first, sets oldest first within a workout. */
export function groupWorkouts(history: SessionSummary[]): SessionSummary[][] {
  const byDay = new Map<string, SessionSummary[]>();
  for (const s of [...history].sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO))) {
    const k = dayOf(s.dateISO);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, sets]) => sets);
}

/**
 * The sets the next target is based on: the latest workout's sets at its
 * heaviest weight (in the unit of its last set), oldest first. Null with no history.
 */
export function workingSets(history: SessionSummary[]): { sets: SessionSummary[]; weight: number; unit: Unit } | null {
  const workout = groupWorkouts(history)[0];
  if (!workout) return null;
  const unit = workout[workout.length - 1].unit;
  const sameUnit = workout.filter((s) => s.unit === unit);
  const weight = Math.max(...sameUnit.map((s) => s.weight));
  return { sets: sameUnit.filter((s) => s.weight === weight), weight, unit };
}

/** How many reps short of the bottom of the range counts as "far below": the weight drops. */
const FAR_BELOW = 3;

/**
 * Transparent double progression over workouts. Pure: no storage, no React, no LLM.
 *
 * Uses the most recent workout (all sets of the exercise saved that day) and
 * its working sets: the sets at the heaviest weight used that day, so lighter
 * warm-up sets don't hold progress back. "Reps" is the weaker arm for
 * both-arm sets.
 *
 * Reps first, then weight: the target never asks for fewer reps than your
 * best set at the same weight.
 *
 *  1. Best working set far below the range (3+ reps short of the bottom):
 *     drop one increment and aim for the bottom of the range.
 *  2. Best working set reached the top of the range, none marked Failed:
 *     add one increment and start again at the bottom.
 *  3. Best set at the top but a set marked Failed: same weight, aim for
 *     the top again.
 *  4. Otherwise: same weight, one more rep than the best set.
 *
 * The increment is applied in the unit of the most recent set.
 * Returns null when there is no history.
 */
export function suggestNext(history: SessionSummary[], settings: ProgressionSettings): Suggestion | null {
  const basis = workingSets(history);
  if (!basis) return null;
  const { sets: working, weight: w, unit } = basis;
  const best = Math.max(...working.map((s) => s.reps));
  const failed = working.some((s) => s.effort === 'failed');

  const { repRangeMin: lo, repRangeMax: hi, increment } = settings;
  const load = formatLoad(w, unit);
  const range = `${lo}\u2013${hi}`;
  const both = working.some((s) => s.perArm);
  const eachArm = both ? ' on each arm' : '';
  const did = `${setsPhrase(working)} at ${load}`;
  const round = (n: number) => Math.round(n * 100) / 100;

  // Rule 1: far below the range -> go lighter (when there is weight to take off).
  const lighter = round(w - increment);
  if (best <= lo - FAR_BELOW && lighter > 0) {
    return {
      weight: lighter,
      unit,
      reps: lo,
      reason: `You did ${did}, well below your ${range} range. Drop to ${formatLoad(lighter, unit)} and aim for ${lo} reps${eachArm}.`,
    };
  }

  // Rule 2: best set reached the top -> add weight (unless a set was marked Failed).
  if (best >= hi && !failed) {
    const next = round(w + increment);
    return {
      weight: next,
      unit,
      reps: lo,
      reason: `You did ${did}: your best set reached the top of your ${range} range${both ? ' on both arms' : ''}. Add ${increment} ${unit} and start again at ${lo} reps.`,
    };
  }

  // Rule 3: Failed at the top -> same weight, hit the top again.
  if (best >= hi) {
    return {
      weight: w,
      unit,
      reps: hi,
      reason: `You did ${did}, but a set was marked Failed. Stay at ${load} and aim for ${hi} reps${eachArm} again before adding weight.`,
    };
  }

  // Rule 4: below or inside the range -> same weight, beat the best set by one rep.
  const aim = best + 1;
  const where = best < lo ? `below your ${range} range` : `inside your ${range} range`;
  return {
    weight: w,
    unit,
    reps: aim,
    reason: `You did ${did}, ${where}. Keep the weight and aim for ${aim} reps${eachArm}, one more than your best set.`,
  };
}

/**
 * The weight field as a number, or null if it can't be saved: empty, not a
 * number, negative, or 0 for an exercise that has no bodyweight option.
 */
export function parseWeight(raw: string, allowBodyweight: boolean): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0 && !allowBodyweight) return null;
  return n;
}

/** "25 lb", or "bodyweight" for a weight of 0. */
export function formatLoad(weight: number, unit: string): string {
  return weight === 0 ? 'bodyweight' : `${weight} ${unit}`;
}

/** "9 reps", "1 set of 9 reps", or "3 sets (12, 10, 9 reps)"; both-arm sets use the weaker arm. */
function setsPhrase(sets: SessionSummary[]): string {
  if (sets.length === 1) {
    const s = sets[0];
    if (!s.perArm) return `${s.reps} rep${s.reps === 1 ? '' : 's'}`;
    const { left, right } = s.perArm;
    if (left === right) return `${s.reps} reps on each arm`;
    return `${s.reps} reps on your weaker (${left < right ? 'left' : 'right'}) arm`;
  }
  const weaker = sets.some((s) => s.perArm) ? ', weaker arm' : '';
  return `${sets.length} sets (${sets.map((s) => s.reps).join(', ')} reps${weaker})`;
}
