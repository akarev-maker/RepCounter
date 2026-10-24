import { describe, it, expect } from 'vitest';
import type { NormPoint, PoseFrame } from '../types';
import { EXERCISES } from '../exercises/registry';
import { scoreFrames } from './scoreFrames';

// Synthetic front-view poses for cases the recorded clips don't cover:
// walking toward or away from the phone, a jumpy ankle, and single steps.
const squat = EXERCISES.squat;
const FPS = 15;

interface Body {
  /** Hip-to-ankle height on screen when standing (0..1 of frame height). */
  size: number;
  /** How far the hips have dropped, as a fraction of standing height. */
  drop: number;
  /** Extra lift of each ankle (fraction of size), e.g. a step. */
  liftL?: number;
  liftR?: number;
  /** Ankle y error for one frame (fraction of frame height). */
  ankleGlitch?: number;
  visible?: boolean;
}

function frame(tMs: number, b: Body): PoseFrame {
  const lms: NormPoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const vis = b.visible === false ? 0.1 : 0.95;
  const ankleY = 0.9;
  const hipY = ankleY - b.size * (1 - b.drop);
  const kneeY = ankleY - b.size * 0.5 * (1 - b.drop / 2);
  const legs: [number, number, number, number, number][] = [
    [23, 25, 27, 0.45, b.liftL ?? 0],
    [24, 26, 28, 0.55, b.liftR ?? 0],
  ];
  for (const [h, k, a, x, lift] of legs) {
    lms[h] = { x, y: hipY, visibility: vis };
    lms[k] = { x: x + 0.01, y: kneeY - lift * b.size * 0.5, visibility: vis };
    lms[a] = { x, y: ankleY - lift * b.size + (b.ankleGlitch ?? 0), visibility: vis };
  }
  return { tMs, lms };
}

/** Linear keyframes: [seconds, partial body]. Missing fields carry over. */
function clip(keys: [number, Partial<Body>][]): PoseFrame[] {
  const out: PoseFrame[] = [];
  const end = keys[keys.length - 1][0];
  let state: Body = { size: 0.5, drop: 0 };
  const full = keys.map(([t, k]) => [t, (state = { ...state, ...k })] as const);
  for (let i = 0; i <= Math.round(end * FPS); i++) {
    const t = i / FPS;
    const j = full.findIndex(([s]) => s >= t - 1e-9);
    const [s1, b1] = full[Math.max(0, j)];
    const [s0, b0] = full[Math.max(0, j - 1)];
    const f = s1 === s0 ? 1 : (t - s0) / (s1 - s0);
    const lerp = (a = 0, b = 0) => a + (b - a) * f;
    out.push(
      frame(Math.round(t * 1000), {
        size: lerp(b0.size, b1.size),
        drop: lerp(b0.drop, b1.drop),
        liftL: lerp(b0.liftL, b1.liftL),
        liftR: lerp(b0.liftR, b1.liftR),
        visible: b1.visible,
      }),
    );
  }
  return out;
}

/** n squats starting at `t0`, 2.5 s each, dropping by `drop`. */
function squats(t0: number, n: number, drop = 0.5): [number, Partial<Body>][] {
  const k: [number, Partial<Body>][] = [];
  for (let i = 0; i < n; i++) {
    const s = t0 + i * 2.5;
    k.push([s, { drop: 0 }], [s + 1, { drop }], [s + 1.4, { drop }], [s + 2.4, { drop: 0 }]);
  }
  return k;
}

const count = (frames: PoseFrame[]) => scoreFrames(frames, squat, null, 0.5625);

describe('squat counting: movement that is not a squat', () => {
  it('baseline: 3 squats standing still count 3', () => {
    expect(count(clip([[0, {}], [1, {}], ...squats(1, 3), [9, {}]])).count).toBe(3);
  });

  it('walking away from the phone, standing still 2.5 s, then squatting: 3', () => {
    // Shrinks to 60% on screen over 3 s, as when stepping back after
    // starting a recording, then stands still and does 3 squats.
    const r = count(clip([[0, { size: 0.6 }], [1, {}], [4, { size: 0.36 }], [6.5, {}], ...squats(6.5, 3), [14.5, {}]]));
    expect(r.count).toBe(3);
  });

  it('walking away and squatting straight away: may miss reps, never adds one', () => {
    const r = count(clip([[0, { size: 0.6 }], [1, {}], [4, { size: 0.36 }], [4.5, {}], ...squats(4.5, 3), [12.5, {}]]));
    expect(r.count).toBeLessThanOrEqual(3);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });

  it('paused squats (3 s hold at the bottom) still count', () => {
    const k: [number, Partial<Body>][] = [[0, {}], [1, {}]];
    for (let i = 0; i < 3; i++) {
      const s = 1 + i * 5;
      k.push([s, { drop: 0 }], [s + 1, { drop: 0.5 }], [s + 4, { drop: 0.5 }], [s + 5, { drop: 0 }]);
    }
    k.push([17, {}]);
    expect(count(clip(k)).count).toBe(3);
  });

  it('does not count standing back up while the person is still holding the bottom', () => {
    const r = count(clip([[0, {}], [1, {}], [2, { drop: 0.5 }], [12, {}]]));
    expect(r.count).toBe(0);
    expect(r.frames.every((f) => f.count === 0)).toBe(true);
  });

  it('counts a long paused squat only after the person actually stands up', () => {
    const r = count(clip([[0, {}], [1, {}], [2, { drop: 0.5 }], [12, {}], [13, { drop: 0 }], [14, {}]]));
    expect(r.count).toBe(1);
    expect(r.reps[0].tsMs).toBeGreaterThan(12_000);
    expect(r.frames.filter((f) => f.tMs <= 12_000).every((f) => f.count === 0)).toBe(true);
  });

  it('preserves the standing reference through a slow descent', () => {
    const r = count(clip([[0, {}], [1, {}], [10, { drop: 0.5 }], [11, {}], [20, { drop: 0 }], [21, {}]]));
    expect(r.count).toBe(1);
    expect(r.reps[0].tsMs).toBeGreaterThan(18_000);
  });

  it('walking toward the phone after the set: no extra rep', () => {
    const r = count(clip([[0, {}], [1, {}], ...squats(1, 3), [9, {}], [12, { size: 0.8 }], [13, {}]]));
    expect(r.count).toBe(3);
  });

  it('walking in place / stepping (one ankle lifts at a time): no reps', () => {
    const steps: [number, Partial<Body>][] = [];
    for (let i = 0; i < 8; i++) {
      const s = 1 + i * 0.8;
      steps.push([s, { liftL: i % 2 ? 0 : 0.25, liftR: i % 2 ? 0.25 : 0 }], [s + 0.4, { liftL: 0, liftR: 0 }]);
    }
    expect(count(clip([[0, {}], ...steps, [8, {}]])).count).toBe(0);
  });

  it('one-frame ankle glitches during a set: still 3', () => {
    const frames = clip([[0, {}], [1, {}], ...squats(1, 3), [9, {}]]);
    // The ankle jumps 15% of the frame lower on a few single frames.
    for (const i of [20, 50, 80, 110]) {
      const lms = frames[i].lms!;
      lms[27] = { ...lms[27], y: lms[27].y + 0.15 };
      lms[28] = { ...lms[28], y: lms[28].y + 0.15 };
    }
    expect(count(frames).count).toBe(3);
  });

  it('legs leave the frame and come back mid-set: only full squats seen count', () => {
    const r = count(
      clip([[0, {}], [1, {}], ...squats(1, 2), [6, {}], [6.1, { visible: false }], [8, { visible: false }], [8.1, { visible: true }], [9, {}], ...squats(9, 2), [14, {}]]),
    );
    expect(r.count).toBe(4);
  });
});
