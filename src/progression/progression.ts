import type { ProgressionSettings, SessionSummary, Suggestion } from '../types';

export const DEFAULT_PROGRESSION: ProgressionSettings = {
  repRangeMin: 8,
  repRangeMax: 12,
  increment: 5,
  unit: 'lb',
  // A single successful set does NOT raise the weight.
  successSetsRequired: 2,
};

/**
 * Transparent double progression. Pure: no storage, no React, no LLM.
 *
 * Rules, evaluated against confirmed history for one exercise (and side):
 *  1. Last set below the range, or effort "failed" -> repeat the weight.
 *  2. Last set reached the top of the range -> add `increment` only if the
 *     most recent `successSetsRequired` sets at this weight all reached the top
 *     and none failed; otherwise repeat the weight to confirm.
 *  3. Inside the range -> same weight, one more rep.
 *
 * The increment is applied in the unit of the most recent set.
 * For both-arm sets, `reps` is the weaker arm's count, so weight only goes up
 * once both arms reach the top of the range.
 * Returns null when there is no history.
 */
export function suggestNext(
  history: SessionSummary[],
  settings: ProgressionSettings,
): Suggestion | null {
  if (history.length === 0) return null;

  const sorted = [...history].sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO));
  const last = sorted[0];
  const w = last.weight;
  const unit = last.unit;
  const load = formatLoad(w, unit);
  const { repRangeMin, repRangeMax, increment, successSetsRequired } = settings;
  const range = `${repRangeMin}\u2013${repRangeMax}`;
  const both = !!last.perArm;
  const eachArm = both ? ' on each arm' : '';

  // Rule 1: below range or failed -> repeat.
  if (last.effort === 'failed' || last.reps < repRangeMin) {
    const why =
      last.effort === 'failed'
        ? `your last set at ${load} was marked Failed`
        : `your last set was ${repsPhrase(last)}, below your ${range} range`;
    return {
      weight: w,
      unit,
      reps: repRangeMin,
      reason: `Stay at ${load} and aim for at least ${repRangeMin} reps${eachArm}, because ${why}.`,
    };
  }

  // Rule 2: reached the top of the range.
  if (last.reps >= repRangeMax) {
    let streak = 0;
    for (const s of sorted) {
      if (s.weight !== w || s.unit !== unit) break;
      if (s.effort === 'failed' || s.reps < repRangeMax) break;
      streak += 1;
    }

    if (streak >= successSetsRequired) {
      const next = Math.round((w + increment) * 100) / 100;
      return {
        weight: next,
        unit,
        reps: repRangeMin,
        reason: `You reached ${repRangeMax}+ reps${both ? ' on both arms' : ''} at ${load} in your last ${streak} set${streak === 1 ? '' : 's'}. Add ${increment} ${unit} and start again at ${repRangeMin} reps.`,
      };
    }
    const need = successSetsRequired - streak;
    return {
      weight: w,
      unit,
      reps: repRangeMax,
      reason: `You reached the top of your range${both ? ' on both arms' : ''} at ${load}. Repeat it ${need} more time${need === 1 ? '' : 's'} before adding ${increment} ${unit}.`,
    };
  }

  // Rule 3: inside the range -> add a rep.
  const target = Math.min(last.reps + 1, repRangeMax);
  return {
    weight: w,
    unit,
    reps: target,
    reason: `You did ${repsPhrase(last)} at ${load}, inside your ${range} range. Keep the weight and aim for ${target}${eachArm}.`,
  };
}

/** "25 lb", or "bodyweight" for a weight of 0. */
export function formatLoad(weight: number, unit: string): string {
  return weight === 0 ? 'bodyweight' : `${weight} ${unit}`;
}

/** "9 reps", or for both-arm sets "8 reps on your weaker (left) arm". */
function repsPhrase(s: SessionSummary): string {
  if (!s.perArm) return `${s.reps} reps`;
  const { left, right } = s.perArm;
  if (left === right) return `${s.reps} reps on each arm`;
  return `${s.reps} reps on your weaker (${left < right ? 'left' : 'right'}) arm`;
}
