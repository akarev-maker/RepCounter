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

const settings = { ...DEFAULT_PROGRESSION }; // 8-12, +5 lb

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

  it('far below the range: go lighter (3 reps at 25 lb -> 20 lb x 8)', () => {
    const s = suggestNext([set(1, 3, 25)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/well below your 8.12 range. Drop to 20 lb/);
  });

  it('far below but no weight to take off (bodyweight): stay and build up', () => {
    const s = suggestNext([set(1, 3, 0, { side: null })], settings);
    expect(s?.weight).toBe(0);
    expect(s?.reps).toBe(4);
  });

  it('slightly below the range: same weight, one more rep', () => {
    const s = suggestNext([set(1, 6, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(7);
  });

  it('one good set counts: no lighter weight if any working set is close to the range', () => {
    const s = suggestNext([set(1, 7, 25), set(1, 4, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(5);
  });

  it('a Failed set keeps the weight even with high reps', () => {
    const s = suggestNext([set(1, 12, 25), set(1, 12, 25, { effort: 'failed' })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toMatch(/Failed/);
  });

  it('inside the range: aim for one more rep on the weakest set', () => {
    const s = suggestNext([set(1, 12, 25), set(1, 10, 25), set(1, 9, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(10);
    expect(s?.reason).toContain('3 sets (12, 10, 9 reps)');
  });

  it('every set at the top in one workout: add weight', () => {
    const s = suggestNext([set(1, 12, 25), set(1, 12, 25), set(1, 13, 25)], settings);
    expect(s?.weight).toBe(30);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/Add 5 lb/);
  });

  it('a single set at the top is enough (one workout)', () => {
    expect(suggestNext([set(1, 12, 25)], settings)?.weight).toBe(30);
  });

  it('only the latest workout counts', () => {
    const s = suggestNext([set(1, 12, 25), set(1, 12, 25), set(2, 9, 25)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(10);
  });

  it('lighter warm-up sets are ignored', () => {
    const s = suggestNext([set(1, 15, 10), set(1, 12, 25), set(1, 12, 25)], settings);
    expect(s?.weight).toBe(30);
  });

  it('applies the increment in the unit of the last set', () => {
    const s = suggestNext([set(1, 12, 10, { unit: 'kg' })], { ...settings, increment: 2.5 });
    expect(s?.weight).toBe(12.5);
    expect(s?.unit).toBe('kg');
  });
});

describe('suggestNext with both-arm sets (reps = weaker arm)', () => {
  const both = (day: number, right: number, left: number, weight = 20) =>
    set(day, Math.min(right, left), weight, { side: null, mode: 'both', perArm: { left, right } });

  it('progresses from the weaker arm and names it', () => {
    const s = suggestNext([both(1, 9, 8)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(9);
    expect(s?.reason).toContain('8 reps on your weaker (left) arm');
    expect(s?.reason).toContain('on each arm');
  });

  it('does not add weight while one arm is below the top', () => {
    const s = suggestNext([both(1, 12, 11)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(12);
  });

  it('adds weight once both arms reach the top', () => {
    const s = suggestNext([both(1, 12, 12), both(1, 13, 12)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toContain('on both arms');
  });
});
