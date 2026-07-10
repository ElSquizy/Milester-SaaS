import sharp, { type OverlayOptions } from "sharp";
import { LAYOUT } from "./imageTemplates";

const CANVAS = LAYOUT.canvas; // 1024
const T = { r: 0, g: 0, b: 0, alpha: 0 }; // transparent

// Generated drop shadow (cover PNGs are shadow-free; we cast the shadow ourselves).
export type ShadowConfig = { offsetX: number; offsetY: number; blur: number; opacity: number };
export const DEFAULT_SHADOW: ShadowConfig = { offsetX: -6, offsetY: 18, blur: 20, opacity: 0.5 };

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Builds a soft, realistic drop shadow from the combined silhouette of the
 * cover + product (the cover is a frame with a window; the product fills it, so
 * the union is a solid shape). The silhouette is pre-offset, tinted black at a
 * fixed opacity, and blurred. Returns a full-canvas RGBA PNG, or null if empty.
 */
async function buildShadow(cover: { buf: Buffer } | null, product: { buf: Buffer } | null, s: ShadowConfig): Promise<Buffer | null> {
  if (s.opacity <= 0) return null;
  const parts: OverlayOptions[] = [];
  if (cover) parts.push({ input: cover.buf, left: Math.round(LAYOUT.cover.x) + s.offsetX, top: Math.round(LAYOUT.cover.y) + s.offsetY });
  if (product) parts.push({ input: product.buf, left: Math.round(LAYOUT.product.x) + s.offsetX, top: Math.round(LAYOUT.product.y) + s.offsetY });
  if (parts.length === 0) return null;

  const silhouette = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: T } })
    .composite(parts).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { data, info } = silhouette;
  const a = Math.round(255 * Math.min(1, Math.max(0, s.opacity)));
  const shadow = Buffer.alloc(data.length); // black (0,0,0), alpha from silhouette
  for (let i = 3; i < data.length; i += 4) shadow[i] = data[i] > 10 ? a : 0;

  const img = sharp(shadow, { raw: { width: info.width, height: info.height, channels: 4 } });
  return (s.blur > 0 ? img.blur(s.blur) : img).png().toBuffer();
}

export type ComposeInput = {
  backgroundUrl?: string | null;
  coverUrl?: string | null;
  productUrl?: string | null;
  shadow?: ShadowConfig;
};

/**
 * Composes the product image (1024×1024 PNG). Layer order, bottom → top:
 *   1. background (fills canvas)
 *   2. generated shadow (from cover + product silhouette)
 *   3. product (670×670, centered, bottom-aligned to the cover)
 *   4. cover (670×763 frame, centered)
 */
export async function composeProductImage(input: ComposeInput): Promise<Buffer> {
  const composites: OverlayOptions[] = [];

  if (input.backgroundUrl) {
    const bg = await sharp(await fetchBuffer(input.backgroundUrl))
      .resize(CANVAS, CANVAS, { fit: "cover" }).png().toBuffer();
    composites.push({ input: bg, left: 0, top: 0 });
  }

  const coverBuf = input.coverUrl
    ? await sharp(await fetchBuffer(input.coverUrl)).resize(LAYOUT.cover.w, LAYOUT.cover.h, { fit: "contain", background: T }).ensureAlpha().png().toBuffer()
    : null;
  const productBuf = input.productUrl
    ? await sharp(await fetchBuffer(input.productUrl)).resize(LAYOUT.product.w, LAYOUT.product.h, { fit: "contain", background: T, withoutEnlargement: true }).ensureAlpha().png().toBuffer()
    : null;

  const shadow = await buildShadow(coverBuf ? { buf: coverBuf } : null, productBuf ? { buf: productBuf } : null, input.shadow ?? DEFAULT_SHADOW);
  if (shadow) composites.push({ input: shadow, left: 0, top: 0 });

  if (productBuf) composites.push({ input: productBuf, left: Math.round(LAYOUT.product.x), top: Math.round(LAYOUT.product.y) });
  if (coverBuf) composites.push({ input: coverBuf, left: Math.round(LAYOUT.cover.x), top: Math.round(LAYOUT.cover.y) });

  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: T } })
    .composite(composites).png().toBuffer();
}
