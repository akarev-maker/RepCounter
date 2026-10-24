/**
 * Pure smoothing helpers. No DOM, no framework imports.
 * A small running median window rejects single-frame spikes well while a
 * final light mean smooths the remaining noise.
 */
export class MedianSmoother {
  private readonly window: number;
  private readonly buf: number[] = [];

  constructor(window = 5) {
    // Odd window keeps a true middle element.
    this.window = window % 2 === 0 ? window + 1 : window;
  }

  reset(): void {
    this.buf.length = 0;
  }

  push(value: number): number {
    this.buf.push(value);
    if (this.buf.length > this.window) this.buf.shift();
    const sorted = [...this.buf].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
}
