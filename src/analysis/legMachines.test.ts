import { describe, it, expect } from 'vitest';
import type { NormPoint, PoseFrame } from '../types';
import { EXERCISES } from '../exercises/registry';
import { scoreFrames } from './scoreFrames';

type Lm = [number, number, number];
type Fixture = { aspect: number; frames: [number, Lm[] | null][] };
const IDS = [23, 24, 25, 26, 27, 28];
const blank = (): NormPoint[] => Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));

function toPoseFrames(fx: Fixture): PoseFrame[] {
  return fx.frames.map(([tMs, pts]) => {
    if (!pts) return { tMs, lms: null };
    const lms = blank();
    pts.forEach(([x, y, visibility], i) => (lms[IDS[i]] = { x, y, visibility }));
    return { tMs, lms };
  });
}

/** A seated side-view pose with both knees at `deg` (thigh horizontal, shin swinging). */
function seated(tMs: number, deg: number): PoseFrame {
  const lms = blank();
  const knee = { x: 0.5, y: 0.5 };
  const phi = ((180 - deg) * Math.PI) / 180;
  const pts = {
    hip: { x: knee.x - 0.2, y: knee.y },
    knee,
    ankle: { x: knee.x + 0.2 * Math.cos(phi), y: knee.y + 0.2 * Math.sin(phi) },
  };
  for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) {
    lms[h] = { ...pts.hip, visibility: 0.95 };
    lms[k] = { ...pts.knee, visibility: 0.95 };
    lms[a] = { ...pts.ankle, visibility: 0.95 };
  }
  return { tMs, lms };
}

/** Knee angle keyframes [seconds, degrees], sampled at 15 fps with linear ramps. */
function trace(keys: [number, number][]): PoseFrame[] {
  const out: PoseFrame[] = [];
  const end = keys[keys.length - 1][0];
  for (let t = 0; t <= end + 1e-9; t += 1 / 15) {
    const i = keys.findIndex(([s]) => s >= t);
    const [s1, d1] = keys[Math.max(0, i)];
    const [s0, d0] = keys[Math.max(0, i - 1)];
    const deg = s1 === s0 ? d1 : d0 + ((d1 - d0) * (t - s0)) / (s1 - s0);
    out.push(seated(Math.round(t * 1000), deg));
  }
  return out;
}

describe('leg press on a real clip (recorded pose output)', () => {
  it('side view: counts the 5 presses that start in the clip, each around its bottom', async () => {
    const fx = (await import('../counting/__fixtures__/leg-press-side.json')).default as unknown as Fixture;
    const r = scoreFrames(toPoseFrames(fx), EXERCISES['leg-press'], null, fx.aspect);
    // Six presses by eye; the clip starts mid-descent, so the first has no start.
    expect(r.count).toBe(5);
    [5.1, 9.8, 14.3, 18.6, 23.3].forEach((bottom, i) => {
      expect(r.reps[i].startMs / 1000).toBeLessThan(bottom);
      expect(r.reps[i].tsMs / 1000).toBeGreaterThan(bottom);
    });
    expect(r.trackedFraction).toBeGreaterThan(0.9);
  });
});

describe('leg extension (synthetic: no real clip tested yet)', () => {
  const ext = EXERCISES['leg-extension'];
  const run = (keys: [number, number][]) => scoreFrames(trace(keys), ext, null, 1);

  it('starts seated and bent: 3 extensions count 3, each ending back at the bottom', () => {
    const r = run([
      [0, 90], [1, 90],
      [2, 165], [3, 90],
      [4, 165], [5, 90],
      [6, 165], [7, 90], [8, 90],
    ]);
    expect(r.count).toBe(3);
    // Each rep spans one lift: starts before the top, ends after it.
    [2, 4, 6].forEach((top, i) => {
      expect(r.reps[i].startMs / 1000).toBeLessThan(top);
      expect(r.reps[i].tsMs / 1000).toBeGreaterThan(top);
    });
  });

  it('the overlay label shows the real knee angle, not the flipped value', () => {
    const r = run([[0, 90], [1, 90]]);
    expect(r.frames[5].label).toBe('90\u00b0');
  });

  it('partial lifts that never straighten to 145 deg do not count', () => {
    const r = run([
      [0, 90], [1, 90],
      [2, 135], [3, 90],
      [4, 135], [5, 90],
    ]);
    expect(r.count).toBe(0);
  });

  it('a clip that starts with the legs straight does not count that first lowering', () => {
    const r = run([
      [0, 165], [1, 165],
      [2, 90], [3, 90],
      [4, 165], [5, 90], [6, 90],
    ]);
    expect(r.count).toBe(1);
  });
});
