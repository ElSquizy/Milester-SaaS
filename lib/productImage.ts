import { prisma } from "@/lib/prisma";
import { getTiendaNubeClient } from "@/lib/tiendanube";
import { composeProductImage } from "@/lib/composeImage";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pushes a product's image to Tienda Nube and mirrors the result locally.
 *
 * Images are NOT part of the normal product payload in TN's API — they live on
 * their own `/products/{id}/images` endpoint — which is why they used to be left
 * behind entirely by the outbound sync. Two ways in:
 *
 *   1. An image template + product-layer URL → compose the PNG here and upload it
 *      as a base64 attachment (no public hosting needed).
 *   2. Just a plain image URL → hand TN the `src` and let it fetch the file.
 *      This is what makes a duplicated product work: the source's TN CDN URL is
 *      public, so the copy gets its own copy of the same picture.
 *
 * The new image is uploaded BEFORE the old ones are deleted, so a failure never
 * leaves the product without a picture.
 */
export async function pushProductImage(
  productId: number,
  creds: { storeId: string; accessToken: string },
  overrides?: { backgroundUrl?: string; coverUrl?: string; productImageUrl?: string },
): Promise<{ url: string | null }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { imageTemplate: true },
  });
  if (!product) throw new Error("Producto no encontrado");
  if (!product.tiendaNubeId) throw new Error("El producto no existe en Tienda Nube todavía");

  const tmpl = product.imageTemplate;
  const backgroundUrl = overrides?.backgroundUrl ?? tmpl?.backgroundUrl;
  const coverUrl = overrides?.coverUrl ?? tmpl?.coverUrl;
  const layerUrl = overrides?.productImageUrl ?? product.productImageUrl;

  // Composition needs a template; without one we can still forward a plain URL.
  const canCompose = !!layerUrl && (!!backgroundUrl || !!coverUrl);
  const plainUrl = layerUrl || product.imageUrl;
  if (!canCompose && !plainUrl) throw new Error("El producto no tiene ninguna imagen para subir");

  const client = getTiendaNubeClient(creds.storeId, creds.accessToken);

  // Capture the existing images so they can be removed after a successful upload.
  let oldIds: number[] = [];
  try {
    const existing = await client.get(`/products/${product.tiendaNubeId}/images`);
    oldIds = Array.isArray(existing.data) ? existing.data.map((im: any) => im.id) : [];
  } catch { /* no images yet */ }

  let newImg: any;
  if (canCompose) {
    const png = await composeProductImage({
      backgroundUrl, coverUrl, productUrl: layerUrl!,
      shadow: tmpl ? { offsetX: tmpl.shadowOffsetX, offsetY: tmpl.shadowOffsetY, blur: tmpl.shadowBlur, opacity: tmpl.shadowOpacity } : undefined,
    });
    ({ data: newImg } = await client.post(`/products/${product.tiendaNubeId}/images`, {
      attachment: png.toString("base64"),
      filename: `milester-${productId}.png`,
      position: 1,
    }));
  } else {
    ({ data: newImg } = await client.post(`/products/${product.tiendaNubeId}/images`, {
      src: plainUrl,
      position: 1,
    }));
  }

  // Now safe to drop the previous images.
  for (const imgId of oldIds) {
    if (imgId === newImg?.id) continue;
    try { await client.delete(`/products/${product.tiendaNubeId}/images/${imgId}`); } catch { /* best-effort */ }
  }

  // Prefer the src from the upload; fall back to re-reading the product's images.
  let src: string | null = newImg?.src || null;
  if (!src) {
    try {
      const after = await client.get(`/products/${product.tiendaNubeId}/images`);
      if (Array.isArray(after.data) && after.data.length) src = after.data[0].src || null;
    } catch { /* ignore */ }
  }

  // imageUrl drives every thumbnail in the app, so it must point at THIS product's
  // image on TN — never at the one it was copied from.
  await prisma.product.update({
    where: { id: productId },
    data: { ...(src ? { imageUrl: src } : {}), imageDirty: false },
  });

  return { url: src };
}
