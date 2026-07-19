import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushProductImage } from "@/lib/productImage";
import { getCreds } from "@/lib/creds";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Compose + upload to TN is the heaviest path — cap uploads per IP strictly.
const MAX_UPLOADS_PER_MIN = 6;

/**
 * Composes the product image from its image template + product-layer URL and
 * uploads it to Tienda Nube as the main image (base64 attachment — no public
 * hosting needed). Upload happens before deleting the old images, so a failure
 * never leaves the product without a picture.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = rateLimit(`imgupload:${clientIp(req)}`, MAX_UPLOADS_PER_MIN, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Demasiadas imágenes por minuto. Esperá un momento." }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  }
  const { id } = await params;
  const productId = Number(id);
  const body = await req.json().catch(() => ({}));

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { tiendaNubeId: true } });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  if (!product.tiendaNubeId) return NextResponse.json({ error: "El producto no existe en Tienda Nube todavía" }, { status: 400 });

  const creds = await getCreds();
  if (!creds) return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });

  try {
    const { url } = await pushProductImage(productId, creds, {
      backgroundUrl: body.backgroundUrl,
      coverUrl: body.coverUrl,
      productImageUrl: body.productImageUrl,
    });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al subir la imagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
