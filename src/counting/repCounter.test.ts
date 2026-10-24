import { describe, it, expect } from 'vitest';
import { countSequence, RepCounter } from './repCounter';
import type { AngleSample } from '../types';

/**
 * Helpers to synthesize angle sequences. Default config: flexEnter 70,
 * extendEnter 150, minVisibility 0.6, lostFramesThreshold 5, smoothingWindow 5.
 * Samples are emitted at 100ms spacing with full visibility unless stated.
 */
let t = 0;
function seq(angles: number[], visibility = 1): AngleSample[] {
  return angles.map((angle) => ({ tsMs: (t += 100), angle, minVisibility: visibility }));
}
function hold(angle: number, n: number): number[] {
  return Array.from({ length: n }, () => angle);
}
// Reset the shared clock before each test for readable timestamps.
function freshClock() {
  t = 0;
}

describe('RepCounter', () => {
  it('counts a single full extension-flexion-extension cycle once', () => {
    freshClock();
    const samples = seq([
      ...hold(160, 6), // extended
      ...hold(50, 6), // flexed
      ...hold(160, 6), // back to extended -> 1 rep
    ]);
    const snap = countSequence(samples);
    expect(snap.count).toBe(1);
    expect(snap.reps).toHaveLength(1);
    expect(snap.reps[0].index).toBe(1);
  });

  it('counts three consecutive reps', () => {
    freshClock();
    const one = [...hold(160, 6), ...hold(45, 6), ...hold(160, 6)];
    const snap = countSequence(seq([...one, ...one.slice(6), ...one.slice(6)]));
    // start extended once, then 3 down-up cycles
    expect(snap.count).toBe(3);
  });

  it('does NOT count a partial flex that never returns to extension', () => {
    freshClock();
    const samples = seq([
      ...hold(160, 6),
      ...hold(50, 6),
      ...hold(110, 8), // only partially extends, below extendEnter
    ]);
    const snap = countSequence(samples);
    expect(snap.count).toBe(0);
  });

  it('does NOT count a partial rep that never reaches flexion', () => {
    freshClock();
    const samples = seq([
      ...hold(160, 6),
      ...hold(100, 6), // never below flexEnter 70
      ...hold(160, 6),
    ]);
    const snap = countSequence(samples);
    expect(snap.count).toBe(0);
  });

  it('is immune to jitter around the flex threshold (hysteresis + smoothing)', () => {
    freshClock();
    // Oscillate right around 70 without a real flex-to-extension cycle.
    const jitter: number[] = [];
    for (let i = 0; i < 40; i++) jitter.push(i % 2 === 0 ? 68 : 74);
    const samples = seq([...hold(160, 6), ...jitter, ...hold(160, 6)]);
    const snap = countSequence(samples);
    // A genuine flex (median dips <=70) then extension may count at most once,
    // never once-per-oscillation.
    expect(snap.count).toBeLessThanOrEqual(1);
  });

  it('declares tracking lost after sustained low confidence and discards the in-progress cycle', () => {
    const c = new RepCounter();
    let ts = 0;
    const push = (angle: number | null, vis: number) =>
      c.push({ tsMs: (ts += 100), angle, minVisibility: vis });

    let snap = c.snapshot();
    for (let i = 0; i < 6; i++) snap = push(160, 1); // extended, good
    for (let i = 0; i < 4; i++) snap = push(50, 1); // start flexing, good (mid-rep)
    for (let i = 0; i < 6; i++) snap = push(50, 0.2); // low confidence -> lost
    for (let i = 0; i < 6; i++) snap = push(160, 1); // recover & return to extension

    // The in-progress cycle was discarded on tracking loss, so returning to
    // extension does not complete a rep.
    expect(snap.count).toBe(0);
    expect(snap.trackingLost).toBe(false); // recovered by the end
  });

  it('reports trackingLost in the live snapshot while confidence is low', () => {
    const c = new RepCounter();
    let ts = 0;
    const push = (angle: number | null, vis: number) =>
      c.push({ tsMs: (ts += 100), angle, minVisibility: vis });

    let snap = c.snapshot();
    for (let i = 0; i < 6; i++) snap = push(160, 1);
    for (let i = 0; i < 6; i++) snap = push(160, 0.1); // below minVisibility 0.6
    expect(snap.trackingLost).toBe(true);
  });

  it('ignores non-increasing timestamps so replay cannot duplicate reps', () => {
    freshClock();
    const samples = seq([...hold(160, 6), ...hold(45, 6), ...hold(160, 6)]);
    const c = new RepCounter();
    let snap = c.snapshot();
    for (const s of samples) snap = c.push(s);
    expect(snap.count).toBe(1);

    // Re-feed the exact same samples (same timestamps) == replay.
    for (const s of samples) snap = c.push(s);
    expect(snap.count).toBe(1); // unchanged
  });

  it('records a timestamp for each completed rep', () => {
    freshClock();
    const samples = seq([...hold(160, 6), ...hold(45, 6), ...hold(160, 6)]);
    const snap = countSequence(samples);
    expect(snap.reps[0].tsMs).toBeGreaterThan(0);
  });

  it('treats a null angle as low confidence', () => {
    freshClock();
    const c = new RepCounter();
    let snap = c.snapshot();
    const nulls: AngleSample[] = Array.from({ length: 6 }, () => ({
      tsMs: (t += 100),
      angle: null,
      minVisibility: 0,
    }));
    for (const s of nulls) snap = c.push(s);
    expect(snap.trackingLost).toBe(true);
  });
});

describe('RepCounter end-of-video completion', () => {
  function unfinished(tail: number[]) {
    freshClock();
    const counter = new RepCounter();
    for (const sample of seq([...hold(160, 8), ...hold(60, 12), ...tail])) counter.push(sample);
    return counter;
  }

  it.each([[160, 60, 60], [60, 60, 160]])('does not finish from a single raw spike: %j', (...tail) => {
    const counter = unfinished(tail);
    expect(counter.snapshot().count).toBe(0);
    expect(counter.finish().count).toBe(0);
  });

  it('finishes a terminal extension before the median catches up, only once', () => {
    const counter = unfinished([155, 160]);
    expect(counter.snapshot().count).toBe(0);
    expect(counter.finish().count).toBe(1);
    expect(counter.finish().count).toBe(1);
  });

  it('does not finish using stale extension evidence after low-confidence frames', () => {
    const counter = unfinished([155, 160]);
    counter.push({ tsMs: t + 100, angle: null, minVisibility: 0 });
    expect(counter.finish().count).toBe(0);
  });

  it('does not join extension samples across a tracking gap', () => {
    const counter = unfinished([155]);
    counter.push({ tsMs: t + 100, angle: null, minVisibility: 0 });
    counter.push({ tsMs: t + 200, angle: 160, minVisibility: 1 });
    expect(counter.finish().count).toBe(0);
  });
});

describe('RepCounter start-of-clip and recovery', () => {
  it('does not count a cycle that was already flexed when the clip starts', () => {
    const c = new RepCounter();
    let ts = 0;
    let snap = c.snapshot();
    for (let i = 0; i < 6; i++) snap = c.push({ tsMs: (ts += 100), angle: 40, minVisibility: 1 });
    for (let i = 0; i < 6; i++) snap = c.push({ tsMs: (ts += 100), angle: 165, minVisibility: 1 });
    expect(snap.count).toBe(0);
    // A full cycle afterwards still counts.
    for (let i = 0; i < 6; i++) snap = c.push({ tsMs: (ts += 100), angle: 40, minVisibility: 1 });
    for (let i = 0; i < 6; i++) snap = c.push({ tsMs: (ts += 100), angle: 165, minVisibility: 1 });
    expect(snap.count).toBe(1);
  });

  it('needs a fresh extension after tracking is regained mid-flex', () => {
    const c = new RepCounter();
    let ts = 0;
    const push = (angle: number, vis = 1) => c.push({ tsMs: (ts += 100), angle, minVisibility: vis });
    let snap = c.snapshot();
    for (let i = 0; i < 6; i++) snap = push(165);
    for (let i = 0; i < 6; i++) snap = push(120, 0.1); // lost while lowering
    for (let i = 0; i < 6; i++) snap = push(40); // regained already flexed
    for (let i = 0; i < 6; i++) snap = push(165);
    expect(snap.count).toBe(0);
  });
});

describe('RepCounter on a real clip (recorded pose output)', () => {
  // Elbow angles captured from RepCounter running MediaPipe on a real video.
  // The person curls with their LEFT arm 4 times; the right arm rests on the knee.
  type Row = [number, number | null, number];
  const toSamples = (rows: Row[]): AngleSample[] =>
    rows.map(([tsMs, angle, minVisibility]) => ({ tsMs, angle, minVisibility }));

  it('counts 4 reps on the working (left) arm', async () => {
    const fx = (await import('./__fixtures__/pexels-seated-curl.json')).default as unknown as { left: Row[] };
    const snap = countSequence(toSamples(fx.left));
    expect(snap.count).toBe(4);
    // From the raw angles: each curl leaves extension at about 4.6s, 8.1s,
    // 12.0s, 15.9s and is back above 150 degrees at about 6.1s, 9.9s, 13.3s,
    // 17.1s. Smoothing may delay detection by a few frames.
    const near = (got: number[], want: number[], tol: number) =>
      got.length === want.length && got.every((g, i) => Math.abs(g / 1000 - want[i]) <= tol);
    expect(near(snap.reps.map((r) => r.startMs), [4.6, 8.1, 12.0, 15.9], 0.6)).toBe(true);
    expect(near(snap.reps.map((r) => r.tsMs), [6.1, 9.9, 13.3, 17.1], 0.5)).toBe(true);
    for (const r of snap.reps) expect(r.startMs).toBeLessThan(r.tsMs);
  });

  it('counts 0 reps on the resting (right) arm', async () => {
    const fx = (await import('./__fixtures__/pexels-seated-curl.json')).default as unknown as { right: Row[] };
    expect(countSequence(toSamples(fx.right)).count).toBe(0);
  });
});

describe('RepCounter on the user\'s own iPhone clip (recorded pose output)', () => {
  // IMG_6342.MOV: seated, filmed from the front, 6 curls with the RIGHT arm.
  // The left arm rests on the knee; the clip starts and ends with the person
  // walking to and from the phone.
  type Row = [number, number | null, number];
  const toSamples = (rows: Row[]): AngleSample[] =>
    rows.map(([tsMs, angle, minVisibility]) => ({ tsMs, angle, minVisibility }));
  const load = async () =>
    (await import('./__fixtures__/user-seated-curl-front.json')).default as unknown as {
      left: Row[];
      right: Row[];
    };

  it('counts 6 reps on the working (right) arm, starting at the right moments', async () => {
    const snap = countSequence(toSamples((await load()).right));
    expect(snap.count).toBe(6);
    // Hand-read from the angle trace: each curl leaves extension at about
    // 2.4s, 4.1s, 5.9s, 7.8s, 9.6s and 11.7s.
    const starts = snap.reps.map((r) => r.startMs / 1000);
    [2.4, 4.1, 5.9, 7.8, 9.6, 11.7].forEach((want, i) => expect(Math.abs(starts[i] - want)).toBeLessThan(0.4));
  });

  it('counts 0 reps on the resting (left) arm, including when standing up at the end', async () => {
    expect(countSequence(toSamples((await load()).left)).count).toBe(0);
  });
});

describe('RepCounter on the user\'s gym test clips (recorded pose output)', () => {
  // Rep counts in each clip's filename were counted by the user.
  type Row = [number, number | null, number];
  type Fixture = { left: Row[]; right: Row[] };
  const toSamples = (rows: Row[]): AngleSample[] =>
    rows.map(([tsMs, angle, minVisibility]) => ({ tsMs, angle, minVisibility }));
  const count = (rows: Row[]) => countSequence(toSamples(rows));

  it('alternating curls: 5 right and 4 left, counted separately and interleaved in time', async () => {
    const fx = (await import('./__fixtures__/alternating-curl-front.json')).default as unknown as Fixture;
    const right = count(fx.right);
    const left = count(fx.left);
    expect(right.count).toBe(5);
    expect(left.count).toBe(4);
    // Alternating: every left rep starts between two right reps.
    const r = right.reps.map((x) => x.startMs);
    left.reps.forEach((l, i) => {
      expect(l.startMs).toBeGreaterThan(r[i]);
      expect(l.startMs).toBeLessThan(r[i + 1]);
    });
  });

  it('side view: 6 reps on the near (right) arm, 0 on the hidden far arm', async () => {
    const fx = (await import('./__fixtures__/curl-side-view.json')).default as unknown as Fixture;
    expect(count(fx.right).count).toBe(6);
    expect(count(fx.left).count).toBe(0);
  });

  it('quick curls about 1.2 s apart: all 5 counted', async () => {
    const fx = (await import('./__fixtures__/quick-curls.json')).default as unknown as Fixture;
    expect(count(fx.right).count).toBe(5);
    expect(count(fx.left).count).toBe(0);
  });

  it('moving close-up camera: tracking fails, and no reps are invented from the noise', async () => {
    // 7 real reps, but the torso is out of frame and the pose data is unusable.
    // The app reports low visibility instead of a confident wrong number.
    const fx = (await import('./__fixtures__/moving-camera-closeup.json')).default as unknown as Fixture;
    const right = count(fx.right);
    const left = count(fx.left);
    expect(right.count + left.count).toBe(0);
    expect(right.reps).toHaveLength(0);
  });
});

describe('RepCounter depth: counted reps that could go deeper', () => {
  // Squat-style settings: counts from 140 deg, full depth at 110 deg or lower.
  const cfg = { flexEnter: 140, fullDepth: 110, extendEnter: 155, minRepMs: 600 };
  const rep = (bottom: number, t0: number, frames = 10, stepMs = 100) => {
    const out: AngleSample[] = [];
    let t = t0;
    for (let i = 0; i < 5; i++) out.push({ tsMs: (t += stepMs), angle: 170, minVisibility: 0.9 });
    for (let i = 0; i < frames; i++) out.push({ tsMs: (t += stepMs), angle: bottom, minVisibility: 0.9 });
    for (let i = 0; i < 5; i++) out.push({ tsMs: (t += stepMs), angle: 170, minVisibility: 0.9 });
    return out;
  };

  it('counts a rep that bottoms at 130 deg and flags it as shallow, with the measured angle', () => {
    const snap = countSequence(rep(130, 0), cfg);
    expect(snap.count).toBe(1);
    expect(snap.reps[0].shallow).toBe(true);
    expect(snap.reps[0].bottomAngle).toBe(130);
  });

  it('does not flag a rep that reaches full depth', () => {
    const snap = countSequence(rep(95, 0), cfg);
    expect(snap.count).toBe(1);
    expect(snap.reps[0].shallow).toBe(false);
    expect(snap.reps[0].bottomAngle).toBe(95);
  });

  it('flags each rep on its own: deep, shallow, deep', () => {
    const snap = countSequence([...rep(95, 0), ...rep(128, 3000), ...rep(100, 6000)], cfg);
    expect(snap.reps.map((r) => r.shallow)).toEqual([false, true, false]);
  });

  it('does not count a bend that never reaches 140 deg', () => {
    expect(countSequence(rep(145, 0), cfg).count).toBe(0);
  });

  it('ignores a dip quicker than the shortest rep, such as a step while walking', () => {
    // Bends to 130 for 3 frames: long enough to get through smoothing, but
    // the whole dip lasts about half a second.
    const dip = rep(130, 0, 3);
    expect(countSequence(dip, { ...cfg, minRepMs: undefined }).count).toBe(1);
    expect(countSequence(dip, cfg).count).toBe(0);
  });

  it('exercises without a full-depth angle never flag reps (curls)', () => {
    const snap = countSequence(rep(40, 0), { flexEnter: 70, extendEnter: 150 });
    expect(snap.count).toBe(1);
    expect(snap.reps[0].shallow).toBe(false);
  });
});
