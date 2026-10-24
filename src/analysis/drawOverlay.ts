import type { AnalyzedFrame, NormPoint } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where an `object-fit: contain` video actually paints inside its box.
 * Landmarks are normalized to the video frame, not the element, so they must
 * be mapped into this rect or they drift whenever the box and clip aspect
 * ratios differ.
 */
export function containRect(boxW: number, boxH: number, vw: number, vh: number): Rect {
  if (!vw || !vh || !boxW || !boxH) return { x: 0, y: 0, w: boxW, h: boxH };
  const s = Math.min(boxW / vw, boxH / vh);
  const w = vw * s;
  const h = vh * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Colors per arm. Right uses the app accent; left a contrasting blue. */
export const ARM_COLORS = {
  right: { solid: '#ff5a1f', fill: 'rgba(255,90,31,0.28)' },
  left: { solid: '#3b9eff', fill: 'rgba(59,158,255,0.28)' },
} as const;

/** Color for an arm; exercises without sides use the right-arm (accent) color. */
export const armColor = (side: 'left' | 'right' | null) => ARM_COLORS[side === 'left' ? 'left' : 'right'];

const DIM = 'rgba(255,255,255,0.55)';

export interface OverlayLimb {
  frame: AnalyzedFrame | null;
  color: { solid: string; fill: string };
}

/** Clear the canvas and draw every tracked limb. Sizes are in CSS pixels. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  limbs: OverlayLimb[],
  rect: Rect,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  for (const limb of limbs) drawLimb(ctx, limb, rect);
}

function drawLimb(ctx: CanvasRenderingContext2D, { frame, color }: OverlayLimb, rect: Rect): void {
  if (!frame?.pts) return;

  const map = (p: NormPoint) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h });
  const [a, b, c] = frame.pts.map(map);
  const stroke = frame.confident ? color.solid : DIM;
  const unit = Math.max(1, Math.min(rect.w, rect.h) / 400);

  // Bones with a dark halo so they read on bright and dark footage.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 8 * unit;
  ctx.stroke();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4 * unit;
  ctx.stroke();

  // Angle arc at the joint.
  const ta = Math.atan2(a.y - b.y, a.x - b.x);
  const tc = Math.atan2(c.y - b.y, c.x - b.x);
  let delta = tc - ta;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  const arcR = 22 * unit;
  if (frame.angle !== null) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.arc(b.x, b.y, arcR, ta, ta + delta, delta < 0);
    ctx.closePath();
    ctx.fillStyle = frame.confident ? color.fill : 'rgba(255,255,255,0.18)';
    ctx.fill();
  }

  // Joints.
  for (const [p, r] of [
    [a, 5],
    [c, 5],
    [b, 7],
  ] as const) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * unit, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 3 * unit;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  // Label (angle or depth), placed outside the angle so it never covers the limb.
  if (frame.label) {
    const out = ta + delta / 2 + Math.PI;
    const dist = arcR + 26 * unit;
    const lx = b.x + Math.cos(out) * dist;
    const ly = b.y + Math.sin(out) * dist;
    const label = frame.label;
    const fontPx = Math.round(13 * unit);
    ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const padX = 7 * unit;
    const h = fontPx + 9 * unit;
    const x = Math.min(Math.max(lx - tw / 2 - padX, rect.x + 4), rect.x + rect.w - tw - 2 * padX - 4);
    const y = Math.min(Math.max(ly - h / 2, rect.y + 4), rect.y + rect.h - h - 4);
    ctx.beginPath();
    ctx.roundRect(x, y, tw + 2 * padX, h, h / 2);
    ctx.fillStyle = 'rgba(12,12,12,0.78)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + padX, y + h / 2 + 0.5);
  }
}
