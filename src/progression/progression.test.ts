import { describe, it, expect } from 'vitest';
import { suggestNext, groupWorkouts, DEFAULT_PROGRESSION } from './progression';
import type { SessionSummary } from '../types';

const base = {
  exerciseId: 'dumbbell-curl',
  exerciseLabel: 'Dumbbell Curl',
  side: 'right' as const,
  unit: 'lb' as const,
  effort: 'just-right' as const,
};

let n = 0;
/** A set on day `day` (January 2026), `minute` minutes after 10:00 local time. */
function set(day: number, reps: number, weight: number, extra: Partial<SessionSummary> = {}, minute = n++): SessionSummary {
  const d = new Date(2026, 0, day, 10, minute);
  return { id: `s${n}`, dateISO: d.toISOString(), ...base, reps, weight, ...extra };
}

const settings = { ...DEFAULT_PROGRESSION }; // 5-8, +5 lb
const wide = { ...settings, repRangeMin: 8, repRangeMax: 12 };

describe('groupWorkouts', () => {
  it('groups sets by day, newest workout first, sets in order', () => {
    const w = groupWorkouts([set(2, 10, 25, {}, 5), set(1, 9, 25, {}, 1), set(2, 12, 25, {}, 1)]);
    expect(w.map((sets) => sets.map((s) => s.reps))).toEqual([[12, 10], [9]]);
  });
});

describe('suggestNext (one workout = all sets that day)', () => {
  it('returns null with no history', () => {
    expect(suggestNext([], settings)).toBeNull();
  });

  it('defaults to a 5-8 range', () => {
    expect([settings.repRangeMin, settings.repRangeMax]).toEqual([5, 8]);
  });

  it('far below the range: go lighter (2 reps at 25 lb -> 20 lb x 5)', () => {
    const s = suggestNext([set(1, 2, 25)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(5);
    expect(s?.reason).toMatch(/well below your 5.8 range. Drop to 20 lb/);
  });

  it('far below but no weight to take off (bodyweight): stay and build up', () => {
    const s = suggestNext([set(1, 2, 0, { side: null })], settings);
    expect(s?.weight).toBe(0);
    expect(s?.reps).toBe(3);
  });

  it('below the range: same weight, one more rep than the best set', () => {
    const s = suggestNext([set(1, 4, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(5);
  });

  it('inside the range: beat the best set by one rep, never aim lower than it', () => {
    const s = suggestNext([set(1, 7, 25), set(1, 6, 25), set(1, 5, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toContain('3 sets (7, 6, 5 reps)');
    expect(s?.reason).toContain('one more than your best set');
  });

  it('best set at the top: add weight, even if later sets dropped (12, 10, 9 in 8-12)', () => {
    const s = suggestNext([set(1, 12, 25), set(1, 10, 25), set(1, 9, 25)], wide);
    expect(s?.weight).toBe(30);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/best set reached the top of your 8.12 range. Add 5 lb/);
  });

  it('inside a wider range: aim above the best set (11, 10, 9 in 8-12 -> 12)', () => {
    const s = suggestNext([set(1, 11, 25), set(1, 10, 25), set(1, 9, 25)], wide);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(12);
  });

  it('a Failed set blocks the weight increase and aims for the top again', () => {
    const s = suggestNext([set(1, 8, 25), set(1, 8, 25, { effort: 'failed' })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/Failed/);
  });

  it('only the latest workout counts', () => {
    const s = suggestNext([set(1, 8, 25), set(1, 8, 25), set(2, 6, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(7);
  });

  it('lighter warm-up sets are ignored', () => {
    const s = suggestNext([set(1, 15, 10), set(1, 8, 25), set(1, 6, 25)], settings);
    expect(s?.weight).toBe(30);
  });

  it('applies the increment in the unit of the last set', () => {
    const s = suggestNext([set(1, 8, 10, { unit: 'kg' })], { ...settings, increment: 2.5 });
    expect(s?.weight).toBe(12.5);
    expect(s?.unit).toBe('kg');
  });
});

describe('suggestNext with both-arm sets (reps = weaker arm)', () => {
  const both = (day: number, right: number, left: number, weight = 20) =>
    set(day, Math.min(right, left), weight, { side: null, mode: 'both', perArm: { left, right } });

  it('progresses from the weaker arm and names it', () => {
    const s = suggestNext([both(1, 9, 8)], wide);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(9);
    expect(s?.reason).toContain('8 reps on your weaker (left) arm');
    expect(s?.reason).toContain('on each arm');
  });

  it('does not add weight while the weaker arm is below the top', () => {
    const s = suggestNext([both(1, 12, 11)], wide);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(12);
  });

  it('adds weight once both arms reach the top', () => {
    const s = suggestNext([both(1, 12, 12), both(1, 13, 11)], wide);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toContain('on both arms');
  });
});
