/** Pure geometry helpers for pose landmarks. */
import type { NormPoint } from '../types';

export type Pt = NormPoint;

/**
 * Interior angle (degrees) at point `b` formed by segments b->a and b->c.
 * Coordinates are normalized [0..1]; x is scaled by the frame aspect ratio
 * (width / height) so the angle matches the on-screen geometry.
 */
export function jointAngle(a: Pt, b: Pt, c: Pt, aspect = 1): number {
  const ax = (a.x - b.x) * aspect;
  const ay = a.y - b.y;
  const cx = (c.x - b.x) * aspect;
  const cy = c.y - b.y;

  const magA = Math.hypot(ax, ay);
  const magC = Math.hypot(cx, cy);
  if (magA === 0 || magC === 0) return NaN;

  const cos = Math.max(-1, Math.min(1, (ax * cx + ay * cy) / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function minVisibility(pts: Pt[]): number {
  let m = 1;
  for (const p of pts) m = Math.min(m, p.visibility ?? 0);
  return m;
}
