/**
 * Compares confirmed rep counts between arms. Pure; reports only the counts,
 * never form quality or injury risk.
 */
export type BalanceTone = 'even' | 'uneven' | 'one-sided';

export interface BalanceNote {
  tone: BalanceTone;
  /** Arm with more reps, when the counts differ. */
  stronger: 'left' | 'right' | null;
  diff: number;
  text: string;
}

export function armBalance(right: number, left: number): BalanceNote | null {
  if (right === 0 && left === 0) return null;
  if (right === 0 || left === 0) {
    const side = right > 0 ? 'right' : 'left';
    const n = Math.max(right, left);
    return {
      tone: 'one-sided',
      stronger: side,
      diff: n,
      text: `Only your ${side} arm did reps (${n}), so this saves as a one-arm set for your ${side} arm.`,
    };
  }
  if (right === left) {
    return { tone: 'even', stronger: null, diff: 0, text: `Even: ${right} reps on each arm.` };
  }
  const stronger = right > left ? 'right' : 'left';
  const weaker = stronger === 'right' ? 'left' : 'right';
  const diff = Math.abs(right - left);
  return {
    tone: 'uneven',
    stronger,
    diff,
    text: `Your ${stronger} arm did ${diff} more rep${diff === 1 ? '' : 's'} than your ${weaker} (${Math.max(right, left)} vs ${Math.min(right, left)}).`,
  };
}

/**
 * How a set counted in both-arm mode is saved. If only one arm did reps, it
 * was a one-arm set: saving it as both arms would log min(right, left) = 0
 * reps and drive progression from that.
 */
export function bothArmSave(
  right: number,
  left: number,
): { mode: 'one'; side: 'left' | 'right'; reps: number } | { mode: 'both'; reps: number } {
  if ((right === 0) !== (left === 0)) {
    return right > 0 ? { mode: 'one', side: 'right', reps: right } : { mode: 'one', side: 'left', reps: left };
  }
  return { mode: 'both', reps: progressionReps(right, left) };
}

/** Reps that drive progression for a both-arm set: the weaker arm. */
export function progressionReps(right: number, left: number): number {
  return Math.min(right, left);
}
