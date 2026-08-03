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

/** Rectángulo del slot del producto, en píxeles del lienzo 1024×1024. */
export type ProductSlot = { x: number; y: number; w: number; h: number };

/** Slot por defecto = layout histórico (para plantillas sin geometría propia). */
export const DEFAULT_PRODUCT_SLOT: ProductSlot = { x: 177, y: 224, w: 670, h: 670 };

/**
 * Construye el slot del producto a partir de los campos de una plantilla,
 * cayendo al default cuando falten (plantillas viejas / composición sin plantilla).
 */
export function productSlotOf(t?: { productX?: number | null; productY?: number | null; productW?: number | null; productH?: number | null } | null): ProductSlot {
  return {
    x: t?.productX ?? DEFAULT_PRODUCT_SLOT.x,
    y: t?.productY ?? DEFAULT_PRODUCT_SLOT.y,
    w: t?.productW ?? DEFAULT_PRODUCT_SLOT.w,
    h: t?.productH ?? DEFAULT_PRODUCT_SLOT.h,
  };
}

/** A layout value as a percentage of the canvas, for CSS positioning in previews. */
export function pct(v: number): string {
  return `${(v / LAYOUT.canvas) * 100}%`;
}
