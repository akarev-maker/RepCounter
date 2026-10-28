import { describe, it, expect } from 'vitest';
import type { NormPoint, PoseFrame } from '../types';
import { EXERCISES, LM } from '../exercises/registry';
import { scoreFrames } from './scoreFrames';

// Synthetic poses for the lateral raise and pull-up. Thresholds were tuned on
// RepCount-A clips (see manual-test-notes.md); these tests pin the counting
// logic, in particular the flip for exercises that rest at a small angle.
const FPS = 15;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Linear keyframes [seconds, value] sampled at FPS. */
function trace(keys: [number, number][]): { tMs: number; v: number }[] {
  const out: { tMs: number; v: number }[] = [];
  const end = keys[keys.length - 1][0];
  for (let i = 0; i <= Math.round(end * FPS); i++) {
    const t = i / FPS;
    const j = Math.max(1, keys.findIndex(([s]) => s >= t - 1e-9));
    const [s0, v0] = keys[j - 1];
    const [s1, v1] = keys[j];
    out.push({ tMs: Math.round(t * 1000), v: v0 + (v1 - v0) * (s1 === s0 ? 1 : (t - s0) / (s1 - s0)) });
  }
  return out;
}

const blank = (): NormPoint[] => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));

/**
 * Front view, upper arm raised `right` / `left` degrees out from the side of
 * the body (0 = hanging down, 90 = horizontal).
 */
function raisePose(tMs: number, right: number, left: number): PoseFrame {
  const lms = blank();
  const arm = (hip: number, shoulder: number, elbow: number, x: number, dir: number, deg: number) => {
    lms[hip] = { x, y: 0.6, visibility: 0.95 };
    lms[shoulder] = { x, y: 0.3, visibility: 0.95 };
    lms[elbow] = { x: x + dir * 0.15 * Math.sin(rad(deg)), y: 0.3 + 0.15 * Math.cos(rad(deg)), visibility: 0.95 };
  };
  arm(LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, 0.4, -1, right);
  arm(LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, 0.6, 1, left);
  return { tMs, lms };
}

/** Both elbows at `deg` (180 = straight arms overhead, hanging from a bar). */
function pullPose(tMs: number, deg: number): PoseFrame {
  const lms = blank();
  const arm = (shoulder: number, elbow: number, wrist: number, x: number, dir: number) => {
    lms[shoulder] = { x, y: 0.5, visibility: 0.95 };
    lms[elbow] = { x: x + dir * 0.1, y: 0.4, visibility: 0.95 };
    // Forearm = the elbow->shoulder direction rotated by `deg`, so the angle
    // at the elbow is exactly `deg`.
    const ux = -dir * Math.SQRT1_2;
    const uy = Math.SQRT1_2;
    const a = rad(deg) * dir;
    lms[wrist] = {
      x: x + dir * 0.1 + 0.14 * (ux * Math.cos(a) - uy * Math.sin(a)),
      y: 0.4 + 0.14 * (ux * Math.sin(a) + uy * Math.cos(a)),
      visibility: 0.95,
    };
  };
  arm(LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, 0.4, -1);
  arm(LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, 0.6, 1);
  return { tMs, lms };
}

describe('lateral raise (rests low, counted on the way back down)', () => {
  const raise = EXERCISES['lateral-raise'];
  const reps = (n: number, top: number): [number, number][] => {
    const k: [number, number][] = [[0, 10], [1, 10]];
    for (let i = 0; i < n; i++) k.push([1.8 + 2 * i, top], [2.2 + 2 * i, top], [3 + 2 * i, 10]);
    k.push([k[k.length - 1][0] + 1, 10]);
    return k;
  };
  const run = (keys: [number, number][], side: 'left' | 'right', otherArm = 10) =>
    scoreFrames(trace(keys).map(({ tMs, v }) => raisePose(tMs, side === 'right' ? v : otherArm, side === 'left' ? v : otherArm)), raise, side, 1);

  it('3 raises to shoulder height: 3', () => {
    expect(run(reps(3, 85), 'right').count).toBe(3);
  });

  it('counts only the working arm', () => {
    const frames = trace(reps(3, 85)).map(({ tMs, v }) => raisePose(tMs, v, 10));
    expect(scoreFrames(frames, raise, 'right', 1).count).toBe(3);
    expect(scoreFrames(frames, raise, 'left', 1).count).toBe(0);
  });

  it('small lifts to 45 deg are not reps', () => {
    expect(run(reps(3, 45), 'left').count).toBe(0);
  });

  it('a clip that starts with the arm up does not count the first lowering', () => {
    expect(run([[0, 85], [0.5, 85], [1.3, 10], [2, 10], [2.8, 85], [3.2, 85], [4, 10], [5, 10]], 'right').count).toBe(1);
  });

  it('the overlay shows the real shoulder angle, not the flipped value', () => {
    const r = run(reps(1, 85), 'right');
    expect(r.frames[5].label).toBe('10\u00b0');
  });
});

describe('shoulder press (rests bent, counted when the dumbbells come back down)', () => {
  const press = EXERCISES['shoulder-press'];
  const run = (keys: [number, number][]) => scoreFrames(trace(keys).map(({ tMs, v }) => pullPose(tMs, v)), press, null, 1);
  const reps = (n: number, top: number): [number, number][] => {
    const k: [number, number][] = [[0, 80], [1, 80]];
    for (let i = 0; i < n; i++) k.push([1.8 + 2 * i, top], [2.2 + 2 * i, top], [3 + 2 * i, 80]);
    k.push([k[k.length - 1][0] + 1, 80]);
    return k;
  };

  it('3 presses from the shoulders, ending at the shoulders: 3', () => {
    expect(run(reps(3, 170)).count).toBe(3);
  });

  it('half presses that stop at 130 deg are not counted', () => {
    expect(run(reps(3, 130)).count).toBe(0);
  });

  it('a clip that starts with the arms locked out does not count the first lowering', () => {
    expect(run([[0, 170], [0.5, 170], [1.3, 80], [2, 80], [2.8, 170], [3.2, 170], [4, 80], [5, 80]]).count).toBe(1);
  });
});

describe('pull-up (elbow angle, both arms)', () => {
  const pull = EXERCISES['pull-up'];
  const run = (keys: [number, number][]) => scoreFrames(trace(keys).map(({ tMs, v }) => pullPose(tMs, v)), pull, null, 1);

  it('3 full pull-ups from a dead hang: 3', () => {
    expect(run([[0, 170], [1, 170], [2, 60], [3, 170], [4, 60], [5, 170], [6, 60], [7, 170], [8, 170]]).count).toBe(3);
  });

  it('half reps that never bend past 110 deg are not counted', () => {
    expect(run([[0, 170], [1, 170], [2, 110], [3, 170], [4, 110], [5, 170], [6, 170]]).count).toBe(0);
  });

  it('starting at the top (chin over the bar) does not count the first lowering', () => {
    expect(run([[0, 60], [0.5, 60], [1.5, 170], [2.5, 60], [3.5, 170], [4.5, 170]]).count).toBe(1);
  });
});
