import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../types';
import { shareCardLines } from './shareCard';

const base: SessionSummary = {
  id: 'x',
  dateISO: '2026-10-28T15:00:00.000Z',
  exerciseId: 'dumbbell-curl',
  exerciseLabel: 'Dumbbell Curl',
  side: 'right',
  mode: 'one',
  weight: 25,
  unit: 'lb',
  reps: 10,
  effort: 'just-right',
};

describe('shareCardLines', () => {
  it('one-arm set: count, arm and load', () => {
    const t = shareCardLines(base);
    expect(t.count).toBe('10');
    expect(t.unit).toBe('reps');
    expect(t.title).toBe('Dumbbell Curl · right arm');
    expect(t.detail).toMatch(/^25 lb per dumbbell · /);
  });

  it('both-arm set shows each arm, right first', () => {
    const t = shareCardLines({ ...base, side: null, mode: 'both', perArm: { right: 5, left: 4 }, reps: 4 });
    expect(t.count).toBe('5 · 4');
    expect(t.unit).toBe('reps, right · left');
    expect(t.title).toBe('Dumbbell Curl');
  });

  it('bodyweight squat, one rep', () => {
    const t = shareCardLines({ ...base, exerciseId: 'squat', exerciseLabel: 'Squat', side: null, weight: 0, reps: 1 });
    expect(t.unit).toBe('rep');
    expect(t.title).toBe('Squat');
    expect(t.detail).toMatch(/^Bodyweight · /);
  });

  it('an exercise that no longer exists keeps its saved name and gets no suffix', () => {
    const t = shareCardLines({ ...base, exerciseId: 'leg-press', exerciseLabel: 'Leg Press', side: null, weight: 200 });
    expect(t.detail).toMatch(/^200 lb · /);
  });
});
