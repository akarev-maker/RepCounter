import type { SessionSummary } from '../types';
import { lookupExercise } from '../exercises/registry';
import { formatLoad } from '../progression/progression';

/** Text on the share image for one saved set. Pure, so it can be tested. */
export function shareCardLines(s: SessionSummary): { count: string; unit: string; title: string; detail: string } {
  const perArm = s.mode === 'both' && s.perArm;
  const count = perArm ? `${s.perArm!.right} · ${s.perArm!.left}` : String(s.reps);
  const unit = perArm ? 'reps, right · left' : s.reps === 1 ? 'rep' : 'reps';
  const arm = !perArm && s.side ? ` · ${s.side} arm` : '';
  const load =
    s.weight === 0 ? 'Bodyweight' : `${formatLoad(s.weight, s.unit)}${lookupExercise(s.exerciseId)?.loadSuffix ?? ''}`;
  const date = new Date(s.dateISO).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return { count, unit, title: `${s.exerciseLabel}${arm}`, detail: `${load} · ${date}` };
}

const W = 1080;
const H = 1920;

/** A 1080x1920 (story-sized) PNG of the set, counted by RepCounter. */
export async function renderShareCard(s: SessionSummary, siteLabel: string): Promise<Blob> {
  await Promise.all([800, 600, 400].map((w) => document.fonts.load(`${w} 64px Inter`)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('No canvas');
  const t = shareCardLines(s);

  g.fillStyle = '#f2f2ef';
  g.fillRect(0, 0, W, H);

  // Brand.
  drawLogo(g, 96, 150, 96);
  g.fillStyle = '#121211';
  g.font = '800 58px Inter';
  g.textBaseline = 'middle';
  g.fillText('RepCounter', 220, 198);

  // Card.
  roundRect(g, 72, 420, W - 144, 900, 56);
  g.fillStyle = '#0e0e0d';
  g.fill();
  g.fillStyle = '#ffffff';
  g.textBaseline = 'alphabetic';
  g.font = `800 ${t.count.length > 4 ? 250 : 340}px Inter`;
  g.fillText(t.count, 140, 900);
  g.font = '600 64px Inter';
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(t.unit, 148, 1000);
  g.fillStyle = '#ff5a1f';
  g.font = '700 70px Inter';
  fitText(g, t.title, 140, 1160, W - 280);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '400 52px Inter';
  fitText(g, t.detail, 140, 1240, W - 280);

  // Footer.
  g.fillStyle = '#4a4a44';
  g.font = '400 46px Inter';
  g.fillText('Counted from a video, in the browser.', 96, 1560);
  g.fillStyle = '#121211';
  g.font = '700 50px Inter';
  fitText(g, siteLabel, 96, 1640, W - 192);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

/** Share the image with the system share sheet, or download it where sharing files isn't supported. */
export async function shareSet(s: SessionSummary): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const url = window.location.origin + window.location.pathname;
  const blob = await renderShareCard(s, url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  const file = new File([blob], 'repcounter-set.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `Counted with RepCounter: ${url}` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Fall through to a download if the share sheet failed for another reason.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}

function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  let size = parseInt(g.font.match(/(\d+)px/)?.[1] ?? '48', 10);
  while (g.measureText(text).width > max && size > 24) {
    size -= 2;
    g.font = g.font.replace(/\d+px/, `${size}px`);
  }
  g.fillText(text, x, y);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The app mark (same paths as the header logo, 24-unit grid). */
function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  roundRect(g, x, y, size, size, size * 0.28);
  g.fillStyle = '#121211';
  g.fill();
  const k = (size * 0.6) / 24;
  const ox = x + size * 0.2;
  const oy = y + size * 0.2;
  g.strokeStyle = '#ff5a1f';
  g.lineWidth = 2.6 * k;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(ox + 5 * k, oy + 16.5 * k);
  g.lineTo(ox + 9.5 * k, oy + 10.5 * k);
  g.lineTo(ox + 13.5 * k, oy + 14 * k);
  g.lineTo(ox + 19 * k, oy + 6.5 * k);
  g.stroke();
  g.fillStyle = '#ffffff';
  for (const [cx, cy] of [[9.5, 10.5], [13.5, 14]]) {
    g.beginPath();
    g.arc(ox + cx * k, oy + cy * k, 1.6 * k, 0, Math.PI * 2);
    g.fill();
  }
}
