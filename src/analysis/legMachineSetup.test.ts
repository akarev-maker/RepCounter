import { describe, it, expect } from 'vitest';
import type { NormPoint, PoseFrame } from '../types';
import { EXERCISES } from '../exercises/registry';
import { scoreFrames } from './scoreFrames';

// Synthetic side-view poses of a whole machine set, including getting on and
// off: the phone is usually started before sitting down and stopped after
// standing up, so those movements must not count.
const FPS = 15;
const SEG = 0.18;

/** One keyframe: seconds, thigh direction (0 = forward, 90 = down, -40 = up and forward), knee angle, hip angle. */
type Key = [t: number, thighDeg: number, knee: number, hip: number];

function pose(tMs: number, thighDeg: number, knee: number, hipAngle: number, shoulders = true): PoseFrame {
  const lms: NormPoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (from: { x: number; y: number }, deg: number) => ({ x: from.x + SEG * Math.cos(rad(deg)), y: from.y + SEG * Math.sin(rad(deg)) });
  const hip = { x: 0.4, y: 0.5 };
  const k = at(hip, thighDeg);
  const a = at(k, thighDeg + 180 - knee);
  // Torso at `hipAngle` from the thigh, on whichever side puts the shoulder higher.
  const s1 = at(hip, thighDeg + hipAngle);
  const s2 = at(hip, thighDeg - hipAngle);
  const sh = s1.y < s2.y ? s1 : s2;
  for (const [s, h, kn, an] of [[11, 23, 25, 27], [12, 24, 26, 28]]) {
    lms[s] = { ...sh, visibility: shoulders ? 0.95 : 0.1 };
    lms[h] = { ...hip, visibility: 0.95 };
    lms[kn] = { ...k, visibility: 0.95 };
    lms[an] = { ...a, visibility: 0.95 };
  }
  return { tMs, lms };
}

function clip(keys: Key[], shoulders = true): PoseFrame[] {
  const out: PoseFrame[] = [];
  const end = keys[keys.length - 1][0];
  for (let i = 0; i <= Math.round(end * FPS); i++) {
    const t = i / FPS;
    const j = Math.max(0, keys.findIndex(([s]) => s >= t - 1e-9));
    const b = keys[j];
    const a = keys[Math.max(0, j - 1)];
    const f = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
    const v = (n: 1 | 2 | 3) => a[n] + (b[n] - a[n]) * f;
    out.push(pose(Math.round(t * 1000), v(1), v(2), v(3), shoulders));
  }
  return out;
}

/** Walking for `secs`: each step bends the knee to 115 deg. */
function walk(t0: number, secs: number): Key[] {
  const k: Key[] = [[t0, 90, 175, 175]];
  for (let s = 0; s < secs; s += 1) k.push([t0 + s + 0.5, 75, 115, 160], [t0 + s + 1, 90, 175, 175]);
  return k;
}

/** n reps between knee angles kneeA and kneeB, 2 s each. */
function reps(t0: number, n: number, thigh: number, kneeA: number, kneeB: number, hipA: number, hipB: number): Key[] {
  const k: Key[] = [];
  for (let i = 0; i < n; i++) {
    const s = t0 + i * 2;
    k.push([s, thigh, kneeA, hipA], [s + 1, thigh, kneeB, hipB], [s + 2, thigh, kneeA, hipA]);
  }
  return k;
}

const count = (id: string, frames: PoseFrame[]) => scoreFrames(frames, EXERCISES[id], null, 1).count;

describe('leg press: getting on and off the machine', () => {
  // Reclined. The hip angle on the real clip stayed at 43-89 deg.
  it('starts at the top (legs out), 3 presses: 3', () => {
    const k: Key[] = [[0, -40, 165, 85], [1, -40, 165, 85], ...reps(1, 3, -40, 165, 90, 85, 50), [8, -40, 165, 85]];
    expect(count('leg-press', clip(k))).toBe(3);
  });

  it('walk up, sit, unrack, 3 presses, rack, feet down, stand up and walk off: 3', () => {
    const k: Key[] = [
      ...walk(0, 3),
      [4, 0, 90, 95], // sit on the seat
      [5, 0, 90, 95],
      [6, -40, 100, 55], // lean back, feet on the platform, sled racked
      [7, -40, 100, 55],
      [8, -40, 165, 85], // press it off the rack
      ...reps(8, 3, -40, 165, 90, 85, 50),
      [15, -40, 165, 85], // rack it at the top
      [16, -40, 90, 50], // bring the feet down off the platform
      [17, 0, 90, 95], // sit up
      [18, 90, 175, 175], // stand up
      ...walk(18, 3),
    ];
    expect(count('leg-press', clip(k))).toBe(3);
  });

  it('same, with the shoulders out of frame: the stand-up is not caught (documents the limit)', () => {
    const k: Key[] = [
      [0, -40, 165, 85], [1, -40, 165, 85], ...reps(1, 3, -40, 165, 90, 85, 50),
      [8, -40, 90, 50], [9, 0, 90, 95], [10, 90, 175, 175], [11, 90, 175, 175],
    ];
    // Feet down then standing up looks like a 4th press without the hip check.
    expect(count('leg-press', clip(k, false))).toBe(4);
    expect(count('leg-press', clip(k, true))).toBe(3);
  });

  it('shoulders out of frame: still counts presses (no hip check possible)', () => {
    const k: Key[] = [[0, -40, 165, 85], [1, -40, 165, 85], ...reps(1, 3, -40, 165, 90, 85, 50), [8, -40, 165, 85]];
    expect(count('leg-press', clip(k, false))).toBe(3);
  });
});

describe('leg extension: getting on and off the machine', () => {
  it('walk up, sit down, 3 lifts, stand up and walk off: 3', () => {
    const k: Key[] = [
      ...walk(0, 3),
      [4, 0, 90, 100], // sit, knees bent under the pad
      [5, 0, 90, 100],
      ...reps(5, 3, 0, 90, 165, 100, 100),
      [12, 0, 90, 100],
      [13, 90, 175, 175], // stand up
      ...walk(13, 3),
    ];
    expect(count('leg-extension', clip(k))).toBe(3);
  });

  it('video stops right as the last lift is lowered: still 3', () => {
    const k: Key[] = [[0, 0, 90, 100], [1, 0, 90, 100], ...reps(1, 3, 0, 90, 165, 100, 100)];
    expect(count('leg-extension', clip(k))).toBe(3);
  });
});
