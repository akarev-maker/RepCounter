import { describe, it, expect } from 'vitest';
import type { NormPoint, PoseFrame } from '../types';
import { EXERCISES } from '../exercises/registry';
import { scoreFrames } from './scoreFrames';

// Leg landmarks recorded from RepCounter running MediaPipe on free Pexels clips.
// True counts were read by eye from frame grids of each clip.
type Lm = [number, number, number];
type Fixture = { aspect: number; frames: [number, Lm[] | null][] };
const IDS = [23, 24, 25, 26, 27, 28];

function toPoseFrames(fx: Fixture): PoseFrame[] {
  return fx.frames.map(([tMs, pts]) => {
    if (!pts) return { tMs, lms: null };
    const lms: NormPoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    pts.forEach(([x, y, visibility], i) => (lms[IDS[i]] = { x, y, visibility }));
    return { tMs, lms };
  });
}

const squat = EXERCISES.squat;
const run = async (name: string) => {
  const fx = (await import(`../counting/__fixtures__/${name}.json`)).default as unknown as Fixture;
  return scoreFrames(toPoseFrames(fx), squat, null, fx.aspect);
};

describe('squat counting on real clips (recorded pose output)', () => {
  it('side view, slow reps: 3 squats, each found at the right time', async () => {
    const r = await run('squat-side-slow');
    expect(r.count).toBe(3);
    // Bottoms at about 3.5 s, 10.3 s and 18 s in the clip.
    [3.5, 10.3, 18].forEach((bottom, i) => {
      expect(r.reps[i].startMs / 1000).toBeLessThan(bottom);
      expect(r.reps[i].tsMs / 1000).toBeGreaterThan(bottom);
    });
    expect(r.trackedFraction).toBeGreaterThan(0.9);
  });

  it('three-quarter view, small in frame: 5 squats', async () => {
    const r = await run('squat-three-quarter');
    expect(r.count).toBe(5);
  });

  it('front view, clip ends mid-rep: counts the 2 finished squats, not the cut-off third', async () => {
    const r = await run('squat-front-cut-off');
    expect(r.count).toBe(2);
  });

  it('one shallow rep: all 3 count, and only the visibly shallow one is flagged', async () => {
    const r = await run('squat-one-shallow');
    expect(r.count).toBe(3);
    expect(r.reps.map((x) => x.shallow)).toEqual([true, false, false]);
  });

  it("user's front-view squats: all 6 count (the knee angle only counted 1)", async () => {
    // From the front the knees read 121-148 deg at the bottom, so most reps
    // never passed a knee-angle threshold. The hips drop clearly on every rep.
    const r = await run('user-squat-front');
    expect(r.count).toBe(6);
    expect(r.trackedFraction).toBeGreaterThan(0.9);
    expect(r.reps.every((x) => !x.shallow)).toBe(true);
  });

  it("user's phone test, phone low and close: all 6 count (hip height counted 0)", async () => {
    // Standing read about 150 on the old hip-height scale (100-130 elsewhere),
    // so no rep ever crossed its line. The phone is placed and picked up at
    // the ends of the clip; neither counts as a rep.
    const r = await run('user-squat-phone-low');
    expect(r.count).toBe(6);
    // Bottoms by eye near 2.0, 3.8, 5.7, 7.4, 9.2 and 10.9 s.
    [2.0, 3.8, 5.7, 7.4, 9.2, 10.9].forEach((bottom, i) => {
      expect(r.reps[i].startMs / 1000).toBeLessThan(bottom);
      expect(r.reps[i].tsMs / 1000).toBeGreaterThan(bottom);
    });
  });

  it("user's one-squat video that stops the moment they're back up: counts 1 (was 0)", async () => {
    const r = await run('user-squat-ends-at-top');
    expect(r.count).toBe(1);
    expect(r.reps[0].shallow).toBe(false);
    // The overlay counter shows the rep on the last frame too.
    expect(r.frames[r.frames.length - 1].count).toBe(1);
  });

  it('a video that ends on the way up does not count that rep', async () => {
    const fx = (await import('../counting/__fixtures__/user-squat-ends-at-top.json')).default as unknown as Fixture;
    // Cut where the hips are only about 70% of the way back up.
    const cut = { ...fx, frames: fx.frames.filter(([t]) => t <= 1467) };
    expect(scoreFrames(toPoseFrames(cut), squat, null, fx.aspect).count).toBe(0);
  });

  it('front view, deep reps: 4 squats, none flagged', async () => {
    const r = await run('squat-front-deep');
    expect(r.count).toBe(4);
    expect(r.reps.every((x) => !x.shallow)).toBe(true);
  });

  it('deep reps on the earlier clips are not flagged', async () => {
    for (const name of ['squat-side-slow', 'squat-three-quarter', 'squat-front-cut-off']) {
      const r = await run(name);
      expect(r.reps.every((x) => !x.shallow)).toBe(true);
    }
  });

  it('knees out of frame: no reps invented, and tracking is reported as poor', async () => {
    const r = await run('squat-knees-out-of-frame');
    expect(r.count).toBe(0);
    expect(r.trackedFraction).toBeLessThan(0.3);
  });
});
