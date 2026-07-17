import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyItemToProduct, revertItemFromProduct, parseVariantPrices } from "@/lib/campaigns";

/** GET: the campaign's product items (editable preview: base price + promo price). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await prisma.campaignItem.findMany({
    where: { campaignId: Number(id) },
    include: { product: { select: { name: true, imageUrl: true, sku: true, categoryName: true } } },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(items.map((i) => ({
    productId: i.productId,
    name: i.product?.name ?? `#${i.productId}`,
    imageUrl: i.product?.imageUrl ?? null,
    sku: i.product?.sku ?? null,
    categoryName: i.product?.categoryName ?? null,
    basePrice: i.originalPrice,
    promoPrice: i.campaignPrice,
  })));
}

/**
 * PUT: update per-product promo prices, or add/remove products from a draft campaign.
 * Body: { prices?: { productId, promoPrice }[], removeIds?: number[], addIds?: number[] }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  // Draft and ACTIVE campaigns are editable; ended ones are read-only.
  if (campaign.status === "ended") return NextResponse.json({ error: "La campaña ya terminó" }, { status: 400 });

  const { prices, removeIds, addIds } = await req.json();

  if (Array.isArray(removeIds) && removeIds.length) {
    await prisma.campaignItem.deleteMany({ where: { campaignId, productId: { in: removeIds.map(Number) } } });
  }

  if (Array.isArray(addIds) && addIds.length) {
    const existing = new Set((await prisma.campaignItem.findMany({ where: { campaignId }, select: { productId: true } })).map((i) => i.productId));
    const toAdd = await prisma.product.findMany({ where: { id: { in: addIds.map(Number).filter((n: number) => !existing.has(n)) } }, select: { id: true, price: true } });
    for (const p of toAdd) {
      const promo = campaign.discountType === "pct"
        ? Math.max(0, Math.round(p.price * (1 - campaign.discountValue / 100) * 100) / 100)
        : Math.max(0, p.price - campaign.discountValue);
      await prisma.campaignItem.create({ data: { campaignId, productId: p.id, originalPrice: p.price, campaignPrice: promo } });
    }
  }

  if (Array.isArray(prices)) {
    for (const row of prices) {
      const promo = Number(row.promoPrice);
      if (isNaN(promo)) continue;
      await prisma.campaignItem.updateMany({
        where: { campaignId, productId: Number(row.productId) },
        data: { campaignPrice: promo },
      });
    }
  }

  // If the campaign is already ACTIVE, reflect the edits on the live products right away
  // (products get marked "modified" and are pushed to TN via the sidebar outbound sync).
  if (campaign.status === "active") {
    const meta = { addTag: campaign.addTag, addCategoryId: campaign.addCategoryId };
    if (Array.isArray(removeIds)) {
      for (const pid of removeIds.map(Number)) await revertItemFromProduct(meta, pid, campaignId, false);
    }
    const affected = new Set<number>([
      ...(Array.isArray(addIds) ? addIds.map(Number) : []),
      ...(Array.isArray(prices) ? prices.map((r) => Number(r.productId)) : []),
    ]);
    if (affected.size) {
      const items = await prisma.campaignItem.findMany({ where: { campaignId, productId: { in: [...affected] } } });
      for (const it of items) await applyItemToProduct(meta, it.productId, it.campaignPrice, parseVariantPrices(it.variantPrices));
    }
  }

  const count = await prisma.campaignItem.count({ where: { campaignId } });
  return NextResponse.json({ ok: true, count });
}
