import { describe, expect, it } from 'vitest';
import { armBalance, bothArmSave, progressionReps } from './balance';

describe('armBalance', () => {
  it('flags a one-rep difference and names the arm with more reps', () => {
    const b = armBalance(9, 8);
    expect(b?.tone).toBe('uneven');
    expect(b?.stronger).toBe('right');
    expect(b?.diff).toBe(1);
    expect(b?.text).toBe('Your right arm did 1 more rep than your left (9 vs 8).');
  });

  it('works the other way round and pluralizes', () => {
    const b = armBalance(5, 8);
    expect(b?.stronger).toBe('left');
    expect(b?.text).toContain('3 more reps');
  });

  it('reports even counts', () => {
    expect(armBalance(8, 8)?.tone).toBe('even');
  });

  it('calls out a set where only one arm moved', () => {
    const b = armBalance(6, 0);
    expect(b?.tone).toBe('one-sided');
    expect(b?.text).toContain('Only your right arm');
  });

  it('returns null when neither arm did reps', () => {
    expect(armBalance(0, 0)).toBeNull();
  });
});

describe('bothArmSave', () => {
  it('saves a set where only one arm moved as a one-arm set for that arm', () => {
    expect(bothArmSave(6, 0)).toEqual({ mode: 'one', side: 'right', reps: 6 });
    expect(bothArmSave(0, 4)).toEqual({ mode: 'one', side: 'left', reps: 4 });
  });
  it('keeps both-arm sets as the weaker arm', () => {
    expect(bothArmSave(9, 8)).toEqual({ mode: 'both', reps: 8 });
    expect(bothArmSave(0, 0)).toEqual({ mode: 'both', reps: 0 });
  });
});

describe('progressionReps', () => {
  it('uses the weaker arm', () => {
    expect(progressionReps(9, 8)).toBe(8);
    expect(progressionReps(7, 12)).toBe(7);
  });
});
