import type { ProgressionSettings, SessionSummary, Suggestion } from '../types';

export const DEFAULT_PROGRESSION: ProgressionSettings = {
  repRangeMin: 8,
  repRangeMax: 12,
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
 *  1. Best working set far below the range (3+ reps short of the bottom):
 *     drop one increment and aim for the bottom of the range.
 *  2. Any set marked Failed, or the weakest set below the range: keep the
 *     weight, aim for one more rep on the weakest set (up to the bottom).
 *  3. Every working set reached the top of the range: add one increment and
 *     start again at the bottom.
 *  4. Otherwise (inside the range): keep the weight, one more rep on the
 *     weakest set.
 *
 * The increment is applied in the unit of the most recent set.
 * Returns null when there is no history.
 */
export function suggestNext(history: SessionSummary[], settings: ProgressionSettings): Suggestion | null {
  const workout = groupWorkouts(history)[0];
  if (!workout) return null;

  const unit = workout[workout.length - 1].unit;
  const sameUnit = workout.filter((s) => s.unit === unit);
  const w = Math.max(...sameUnit.map((s) => s.weight));
  const working = sameUnit.filter((s) => s.weight === w);
  const reps = working.map((s) => s.reps);
  const worst = Math.min(...reps);
  const best = Math.max(...reps);
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

  // Rule 2: failed, or below the range -> same weight, build up.
  if (failed || worst < lo) {
    const aim = Math.min(Math.max(worst + 1, 1), worst < lo ? lo : hi);
    const why = failed ? `a set at ${load} was marked Failed` : `you did ${did}, below your ${range} range`;
    return {
      weight: w,
      unit,
      reps: aim,
      reason: `Stay at ${load} and aim for ${aim} reps${eachArm} on every set, because ${why}.`,
    };
  }

  // Rule 3: every working set at the top -> add weight.
  if (worst >= hi) {
    const next = round(w + increment);
    return {
      weight: next,
      unit,
      reps: lo,
      reason: `You did ${did}: every set reached the top of your ${range} range${both ? ' on both arms' : ''}. Add ${increment} ${unit} and start again at ${lo} reps.`,
    };
  }

  // Rule 4: inside the range -> add a rep to the weakest set.
  const aim = Math.min(worst + 1, hi);
  return {
    weight: w,
    unit,
    reps: aim,
    reason: `You did ${did}, inside your ${range} range. Keep the weight and aim for ${aim} reps${eachArm} on every set.`,
  };
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
