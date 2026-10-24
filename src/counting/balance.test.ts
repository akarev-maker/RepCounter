import { describe, expect, it } from 'vitest';
import { armBalance, progressionReps } from './balance';

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

describe('progressionReps', () => {
  it('uses the weaker arm', () => {
    expect(progressionReps(9, 8)).toBe(8);
    expect(progressionReps(7, 12)).toBe(7);
  });
});
