/**
 * Image templates: a reusable background (canvas) + cover (frame) pair. Each
 * product supplies its own product-image URL. Final composition, bottom → top:
 *   1. background  (fills the 1024×1024 canvas)
 *   2. product     (670×670, centered, bottom-aligned to the cover's bottom)
 *   3. cover       (670×763, centered — a frame drawn on top)
 * Product images are always 1:1; if larger they scale down centered to fit 670×670.
 */
export const LAYOUT = {
  canvas: 1024,
  product: { x: 177, y: 223.5, w: 670, h: 670 },
  cover: { x: 177, y: 130.5, w: 670, h: 763 },
} as const;

/** A layout value as a percentage of the canvas, for CSS positioning in previews. */
export function pct(v: number): string {
  return `${(v / LAYOUT.canvas) * 100}%`;
}
