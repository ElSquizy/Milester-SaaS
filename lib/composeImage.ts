// `sharp` es un módulo NATIVO. Lo importamos SOLO como tipo arriba (se borra en
// compilación) y lo cargamos de forma perezosa dentro de las funciones. Así, los
// módulos que solo importan estas funciones (productImage → sync → campaignScheduler
// → pullSync, y por ende /api/sync y /api/sync/pull) NO cargan el binario nativo al
// evaluarse — que es lo que reventaba con 500 en Vercel/Lambda. sharp solo se carga
// cuando realmente se compone una imagen.
import type { OverlayOptions } from "sharp";
import { LAYOUT, DEFAULT_PRODUCT_SLOT, type ProductSlot } from "./imageTemplates";

type SharpFactory = (typeof import("sharp"))["default"];
let _sharp: SharpFactory | null = null;
async function getSharp(): Promise<SharpFactory> {
  if (!_sharp) _sharp = (await import("sharp")).default;
  return _sharp;
}

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
async function buildShadow(cover: { buf: Buffer } | null, product: { buf: Buffer } | null, s: ShadowConfig, slot: ProductSlot): Promise<Buffer | null> {
  if (s.opacity <= 0) return null;
  const sharp = await getSharp();
  const parts: OverlayOptions[] = [];
  if (cover) parts.push({ input: cover.buf, left: Math.round(LAYOUT.cover.x) + s.offsetX, top: Math.round(LAYOUT.cover.y) + s.offsetY });
  if (product) parts.push({ input: product.buf, left: Math.round(slot.x) + s.offsetX, top: Math.round(slot.y) + s.offsetY });
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
  /** Rectángulo del producto en el lienzo; default = layout histórico. */
  productSlot?: ProductSlot | null;
  /** Recorte lateral: fracción (0–0.45) que se corta de CADA lado del producto. */
  cropSides?: number | null;
};

/**
 * Recorta la imagen del producto por los laterales (franja central) antes de
 * encuadrarla. `cropSides` es la fracción que se saca de cada lado.
 */
async function cropProductSides(buf: Buffer, cropSides: number): Promise<Buffer> {
  const frac = Math.min(0.45, Math.max(0, cropSides));
  if (frac <= 0) return buf;
  const sharp = await getSharp();
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return buf;
  const cut = Math.round(w * frac);
  const newW = w - 2 * cut;
  if (newW <= 0) return buf;
  return sharp(buf).extract({ left: cut, top: 0, width: newW, height: h }).png().toBuffer();
}

/**
 * Composes the product image (1024×1024 PNG). Layer order, bottom → top:
 *   1. background (fills canvas)
 *   2. generated shadow (from cover + product silhouette)
 *   3. product (670×670, centered, bottom-aligned to the cover)
 *   4. cover (670×763 frame, centered)
 */
export async function composeProductImage(input: ComposeInput): Promise<Buffer> {
  const sharp = await getSharp();
  const composites: OverlayOptions[] = [];

  if (input.backgroundUrl) {
    const bg = await sharp(await fetchBuffer(input.backgroundUrl))
      .resize(CANVAS, CANVAS, { fit: "cover" }).png().toBuffer();
    composites.push({ input: bg, left: 0, top: 0 });
  }

  const slot = input.productSlot ?? DEFAULT_PRODUCT_SLOT;

  const coverBuf = input.coverUrl
    ? await sharp(await fetchBuffer(input.coverUrl)).resize(LAYOUT.cover.w, LAYOUT.cover.h, { fit: "contain", background: T }).ensureAlpha().png().toBuffer()
    : null;
  const productBuf = input.productUrl
    ? await sharp(await cropProductSides(await fetchBuffer(input.productUrl), input.cropSides ?? 0))
        .resize(Math.round(slot.w), Math.round(slot.h), { fit: "contain", background: T, withoutEnlargement: true }).ensureAlpha().png().toBuffer()
    : null;

  const shadow = await buildShadow(coverBuf ? { buf: coverBuf } : null, productBuf ? { buf: productBuf } : null, input.shadow ?? DEFAULT_SHADOW, slot);
  if (shadow) composites.push({ input: shadow, left: 0, top: 0 });

  if (productBuf) composites.push({ input: productBuf, left: Math.round(slot.x), top: Math.round(slot.y) });
  if (coverBuf) composites.push({ input: coverBuf, left: Math.round(LAYOUT.cover.x), top: Math.round(LAYOUT.cover.y) });

  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: T } })
    .composite(composites).png().toBuffer();
}
