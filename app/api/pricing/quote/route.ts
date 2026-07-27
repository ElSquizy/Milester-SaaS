import { NextResponse } from "next/server";
import { getPricingSettings, priceForProduct } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST { items: [{ productId, costUsd }] } → precio de cada ítem calculado con
 * el perfil de precios que rige a ese producto (según sus colecciones). Lo usa
 * el wizard de campañas modo costos para la vista previa en vivo.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const items: { productId: number; costUsd: number }[] = Array.isArray(body.items)
    ? body.items.map((i: { productId: unknown; costUsd: unknown }) => ({ productId: Number(i.productId), costUsd: Number(i.costUsd) })).filter((i: { productId: number; costUsd: number }) => !isNaN(i.productId))
    : [];
  if (!items.length) return NextResponse.json({ prices: {} });

  const settings = await getPricingSettings();
  const prods = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, categories: { select: { categoryId: true } } },
  });
  const byId = new Map(prods.map((p) => [p.id, p]));

  const prices: Record<number, number | null> = {};
  for (const it of items) {
    const p = byId.get(it.productId);
    prices[it.productId] = p
      ? priceForProduct({ name: p.name, categoryIds: p.categories.map((c) => c.categoryId) }, isNaN(it.costUsd) ? null : it.costUsd, settings)
      : null;
  }
  return NextResponse.json({ prices });
}
