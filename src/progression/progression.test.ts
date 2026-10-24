import { describe, it, expect } from 'vitest';
import { suggestNext, DEFAULT_PROGRESSION } from './progression';
import type { SessionSummary } from '../types';

const base = {
  exerciseId: 'dumbbell-curl',
  exerciseLabel: 'Dumbbell Curl',
  side: 'right' as const,
  unit: 'lb' as const,
  effort: 'just-right' as const,
};

function sess(partial: Partial<SessionSummary> & { reps: number; weight: number }): SessionSummary {
  return {
    id: Math.random().toString(36).slice(2),
    dateISO: new Date().toISOString(),
    ...base,
    ...partial,
  };
}

// Dates increasing so ordering is deterministic.
function dated(day: number, s: SessionSummary): SessionSummary {
  return { ...s, dateISO: `2026-01-${String(day).padStart(2, '0')}T10:00:00Z` };
}

const settings = { ...DEFAULT_PROGRESSION }; // 8-12, +5, need 2 successes

describe('suggestNext (double progression)', () => {
  it('returns null with no history', () => {
    expect(suggestNext([], settings)).toBeNull();
  });

  it('below range -> repeat same weight', () => {
    const s = suggestNext([sess({ reps: 6, weight: 25 })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/below your 8.12 range/);
  });

  it('effort failed -> repeat same weight even if reps were high', () => {
    const s = suggestNext([sess({ reps: 12, weight: 25, effort: 'failed' })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toMatch(/Failed/);
  });

  it('inside range -> same weight, add one rep', () => {
    const s = suggestNext([sess({ reps: 9, weight: 25 })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reps).toBe(10);
  });

  it('single top-of-range set does NOT raise weight (needs 2)', () => {
    const s = suggestNext([sess({ reps: 12, weight: 25 })], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toMatch(/1 more time/);
  });

  it('two consecutive top-of-range sets -> add increment, restart low', () => {
    const history = [
      dated(1, sess({ reps: 12, weight: 25 })),
      dated(2, sess({ reps: 12, weight: 25 })),
    ];
    const s = suggestNext(history, settings);
    expect(s?.weight).toBe(30);
    expect(s?.reps).toBe(8);
    expect(s?.reason).toMatch(/Add 5 lb/);
    expect(s?.unit).toBe('lb');
  });

  it('weight change resets the streak', () => {
    const history = [
      dated(1, sess({ reps: 12, weight: 20 })), // older, different weight
      dated(2, sess({ reps: 12, weight: 25 })), // most recent, only 1 at 25
    ];
    const s = suggestNext(history, settings);
    expect(s?.weight).toBe(25); // not enough streak at 25 lb
  });

  it('applies the increment in the unit of the last set', () => {
    const history = [
      dated(1, sess({ reps: 12, weight: 10, unit: 'kg' })),
      dated(2, sess({ reps: 12, weight: 10, unit: 'kg' })),
    ];
    const s = suggestNext(history, { ...settings, increment: 2.5 });
    expect(s?.weight).toBe(12.5);
    expect(s?.unit).toBe('kg');
  });

  it('respects successSetsRequired = 1', () => {
    const s = suggestNext([sess({ reps: 12, weight: 25 })], {
      ...settings,
      successSetsRequired: 1,
    });
    expect(s?.weight).toBe(30);
  });
});

describe('suggestNext with both-arm sets (reps = weaker arm)', () => {
  const both = (day: number, right: number, left: number, weight = 20) =>
    dated(day, sess({ reps: Math.min(right, left), weight, side: null, mode: 'both', perArm: { left, right } }));

  it('progresses from the weaker arm and names it', () => {
    const s = suggestNext([both(1, 9, 8)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(9);
    expect(s?.reason).toContain('8 reps on your weaker (left) arm');
    expect(s?.reason).toContain('aim for 9 on each arm');
  });

  it('does not add weight while one arm is still below the top', () => {
    const s = suggestNext([both(1, 12, 11), both(2, 12, 11)], settings);
    expect(s?.weight).toBe(20);
    expect(s?.reps).toBe(12);
  });

  it('adds weight once both arms reach the top twice in a row', () => {
    const s = suggestNext([both(1, 12, 12), both(2, 13, 12)], settings);
    expect(s?.weight).toBe(25);
    expect(s?.reason).toContain('on both arms');
  });
});
