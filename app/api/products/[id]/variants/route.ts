import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductVariants, applyProductVariants } from "@/lib/variants";
import { getCreds } from "@/lib/creds";

async function creds() {
  return (await getCreds()) ?? undefined;
}

/** GET: a product's variants + attribute names. Live from TN, or ?local=1 for the local mirror. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const local = new URL(req.url).searchParams.get("local") === "1";
  try {
    const data = await getProductVariants(Number(id), local ? undefined : await creds());
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/**
 * PATCH: quick LOCAL edit of one variant's price/promo/stock from the catalog list.
 * Marks the product "modified" so it's pushed to TN via the outbound sync. No TN write here.
 * Body: { tiendaNubeId?, localId?, price?, promotionalPrice?, stock? }.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  const body = await req.json();
  const variant = await prisma.variant.findFirst({
    where: body.localId ? { id: Number(body.localId), productId } : { productId, tiendaNubeId: String(body.tiendaNubeId) },
  });
  if (!variant) return NextResponse.json({ error: "Variante no encontrada" }, { status: 404 });

  const num = (v: unknown) => (v === null || v === "" || v === undefined ? null : Number(v));
  const data: { price?: number; promotionalPrice?: number | null; stock?: number | null } = {};
  if (body.price !== undefined) { const n = num(body.price); if (n != null && !isNaN(n)) data.price = n; }
  if (body.promotionalPrice !== undefined) { const n = num(body.promotionalPrice); data.promotionalPrice = n != null && !isNaN(n) ? n : null; }
  if (body.stock !== undefined) { const n = num(body.stock); data.stock = n != null && !isNaN(n) ? Math.max(0, Math.round(n)) : null; }

  await prisma.variant.update({ where: { id: variant.id }, data });

  // Reconcile product-level base price/stock and flag it for the outbound sync.
  const locals = await prisma.variant.findMany({ where: { productId }, orderBy: { id: "asc" } });
  const first = locals[0];
  const anyNull = locals.some((v) => v.stock == null);
  const sumStock = locals.reduce((s, v) => s + (v.stock ?? 0), 0);
  await prisma.product.update({
    where: { id: productId },
    data: { syncStatus: "modified", infiniteStock: anyNull, stock: sumStock, ...(first ? { price: first.price, promotionalPrice: first.promotionalPrice } : {}) },
  });
  return NextResponse.json({ ok: true });
}

/** PUT: apply the full desired variant state (create/update/delete) to TN + local. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await creds();
  if (!c) return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });

  const body = await req.json();
  try {
    const data = await applyProductVariants(Number(id), c, {
      attributes: Array.isArray(body.attributes) ? body.attributes : [],
      attributesChanged: !!body.attributesChanged,
      variants: Array.isArray(body.variants) ? body.variants : [],
      deleted: Array.isArray(body.deleted) ? body.deleted : [],
    });
    return NextResponse.json(data);
  } catch (err: unknown) {
    // Surface Tienda Nube's validation detail when present.
    const anyErr = err as { response?: { data?: unknown }; message?: string };
    const detail = anyErr?.response?.data ? JSON.stringify(anyErr.response.data) : anyErr?.message;
    return NextResponse.json({ error: detail || "Error" }, { status: 500 });
  }
}
