import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTiendaNubeClient } from "@/lib/tiendanube";
import { composeProductImage } from "@/lib/composeImage";
import { getCreds } from "@/lib/creds";

export const runtime = "nodejs";

/**
 * Composes the product image from its image template + product-layer URL and
 * uploads it to Tienda Nube as the main image (base64 attachment — no public
 * hosting needed). Upload happens before deleting the old images, so a failure
 * never leaves the product without a picture.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  const body = await req.json().catch(() => ({}));

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { imageTemplate: true },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (!product.tiendaNubeId) return NextResponse.json({ error: "El producto no existe en Tienda Nube todavía" }, { status: 400 });

  const creds = await getCreds();
  if (!creds) return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });

  const backgroundUrl = body.backgroundUrl ?? product.imageTemplate?.backgroundUrl;
  const coverUrl = body.coverUrl ?? product.imageTemplate?.coverUrl;
  const productUrl = body.productImageUrl ?? product.productImageUrl;
  if (!productUrl) return NextResponse.json({ error: "Falta la URL de la imagen del producto" }, { status: 400 });

  const tmpl = product.imageTemplate;
  const shadow = tmpl
    ? { offsetX: tmpl.shadowOffsetX, offsetY: tmpl.shadowOffsetY, blur: tmpl.shadowBlur, opacity: tmpl.shadowOpacity }
    : undefined;

  try {
    const png = await composeProductImage({ backgroundUrl, coverUrl, productUrl, shadow });
    const attachment = png.toString("base64");
    const client = getTiendaNubeClient(creds.storeId, creds.accessToken);

    // Capture existing images to remove after a successful upload.
    const existing = await client.get(`/products/${product.tiendaNubeId}/images`);
    const oldIds: number[] = Array.isArray(existing.data) ? existing.data.map((im: { id: number }) => im.id) : [];

    const { data: newImg } = await client.post(`/products/${product.tiendaNubeId}/images`, {
      attachment,
      filename: `milester-${productId}.png`,
      position: 1,
    });

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
    // Always mirror locally (imageUrl drives the catalog thumbnail).
    if (src) await prisma.product.update({ where: { id: productId }, data: { imageUrl: src } });

    return NextResponse.json({ ok: true, url: src });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al subir la imagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
