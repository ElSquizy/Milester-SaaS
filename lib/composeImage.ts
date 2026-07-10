import sharp, { type OverlayOptions } from "sharp";
import { LAYOUT } from "./imageTemplates";

const CANVAS = LAYOUT.canvas; // 1024
const T = { r: 0, g: 0, b: 0, alpha: 0 }; // transparent

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Returns a copy of an RGBA image keeping only its opaque pixels (soft shadow removed). */
async function opaqueOnly(buf: Buffer): Promise<Buffer> {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 3; i < out.length; i += 4) out[i] = out[i] >= 250 ? 255 : 0;
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

export type ComposeInput = {
  backgroundUrl?: string | null;
  coverUrl?: string | null;
  productUrl?: string | null;
};

/**
 * Composes the product image (1024×1024 PNG). Layer order:
 *   1. background (fills canvas)
 *   2. cover — full (its soft shadow lands here, then gets covered by the product)
 *   3. product (670×670, centered, bottom-aligned to the cover)
 *   4. cover — opaque frame only (border drawn on top of the product; NO shadow)
 * This keeps the frame's shadow around the frame while never darkening the product.
 */
export async function composeProductImage(input: ComposeInput): Promise<Buffer> {
  const composites: OverlayOptions[] = [];

  if (input.backgroundUrl) {
    const bg = await sharp(await fetchBuffer(input.backgroundUrl))
      .resize(CANVAS, CANVAS, { fit: "cover" }).png().toBuffer();
    composites.push({ input: bg, left: 0, top: 0 });
  }

  let coverBuf: Buffer | null = null;
  if (input.coverUrl) {
    coverBuf = await sharp(await fetchBuffer(input.coverUrl))
      .resize(LAYOUT.cover.w, LAYOUT.cover.h, { fit: "contain", background: T })
      .ensureAlpha().png().toBuffer();
    // Full cover first: provides the shadow (will be covered by the product where they overlap).
    composites.push({ input: coverBuf, left: Math.round(LAYOUT.cover.x), top: Math.round(LAYOUT.cover.y) });
  }

  if (input.productUrl) {
    const prod = await sharp(await fetchBuffer(input.productUrl))
      .resize(LAYOUT.product.w, LAYOUT.product.h, { fit: "contain", background: T, withoutEnlargement: true })
      .png().toBuffer();
    composites.push({ input: prod, left: Math.round(LAYOUT.product.x), top: Math.round(LAYOUT.product.y) });
  }

  if (coverBuf) {
    // Opaque frame on top of the product (shadow stripped) so the border stays crisp.
    const frame = await opaqueOnly(coverBuf);
    composites.push({ input: frame, left: Math.round(LAYOUT.cover.x), top: Math.round(LAYOUT.cover.y) });
  }

  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: T } })
    .composite(composites)
    .png()
    .toBuffer();
}
