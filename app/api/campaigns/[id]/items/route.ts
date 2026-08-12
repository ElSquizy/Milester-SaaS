import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyItemToProduct, revertItemFromProduct, parseVariantPrices } from "@/lib/campaigns";
import { getPricingSettings, priceForProduct } from "@/lib/pricing";

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
    variantPrices: parseVariantPrices(i.variantPrices),
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

  const { prices, removeIds, addIds, promoCosts } = await req.json();

  // Modo "costs": el precio promocional se deriva del costo USD promo con la tabla
  // de franjas (igual que en la creación); requiere el dólar cargado en Precios.
  const settings = campaign.mode === "costs" ? await getPricingSettings() : null;

  if (Array.isArray(removeIds) && removeIds.length) {
    await prisma.campaignItem.deleteMany({ where: { campaignId, productId: { in: removeIds.map(Number) } } });
  }

  if (Array.isArray(addIds) && addIds.length) {
    const existing = new Set((await prisma.campaignItem.findMany({ where: { campaignId }, select: { productId: true } })).map((i) => i.productId));
    const ids = addIds.map(Number).filter((n: number) => !existing.has(n));
    const toAdd = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, price: true, categories: { select: { categoryId: true } } },
    });
    for (const p of toAdd) {
      let campaignPrice: number;
      let promoCostUsd: number | null = null;
      if (campaign.mode === "costs") {
        const cost = Number(promoCosts?.[p.id]);
        if (!settings || isNaN(cost) || cost <= 0) continue; // sin costo promo o sin dólar → no se agrega
        const computed = priceForProduct({ name: p.name, categoryIds: p.categories.map((c) => c.categoryId) }, cost, settings);
        if (computed == null) continue; // costo fuera de rango de las franjas
        campaignPrice = computed;
        promoCostUsd = cost;
      } else {
        campaignPrice = campaign.discountType === "pct"
          ? Math.max(0, Math.round(p.price * (1 - campaign.discountValue / 100) * 100) / 100)
          : Math.max(0, p.price - campaign.discountValue);
      }
      await prisma.campaignItem.create({ data: { campaignId, productId: p.id, originalPrice: p.price, campaignPrice, promoCostUsd } });
    }
  }

  if (Array.isArray(prices)) {
    for (const row of prices) {
      const promo = Number(row.promoPrice);
      if (isNaN(promo)) continue;
      // Per-variant prices (multi-variant products): stored as JSON so each
      // variant gets its own campaign price when the campaign applies.
      const vps = Array.isArray(row.variantPrices)
        ? row.variantPrices
            .map((v: { variantId: unknown; campaignPrice: unknown }) => ({ variantId: Number(v.variantId), campaignPrice: Number(v.campaignPrice) }))
            .filter((v: { variantId: number; campaignPrice: number }) => !isNaN(v.variantId) && !isNaN(v.campaignPrice))
        : null;
      await prisma.campaignItem.updateMany({
        where: { campaignId, productId: Number(row.productId) },
        data: { campaignPrice: promo, ...(vps ? { variantPrices: JSON.stringify(vps) } : {}) },
      });
    }
  }

  // If the campaign is already ACTIVE, reflect the edits on the live products right away
  // (products get marked "modified" and are pushed to TN via the sidebar outbound sync).
  if (campaign.status === "active") {
    const meta = { addTag: campaign.addTag, addCategoryId: campaign.addCategoryId };
    if (Array.isArray(removeIds)) {
      for (const pid of removeIds.map(Number)) {
        await revertItemFromProduct(meta, pid, campaignId, false);
        // Modo "costs": al quitar, limpiar también el costo promocional del producto.
        if (campaign.mode === "costs") await prisma.product.update({ where: { id: pid }, data: { costUsdPromo: null } });
      }
    }
    const affected = new Set<number>([
      ...(Array.isArray(addIds) ? addIds.map(Number) : []),
      ...(Array.isArray(prices) ? prices.map((r) => Number(r.productId)) : []),
    ]);
    if (affected.size) {
      const items = await prisma.campaignItem.findMany({ where: { campaignId, productId: { in: [...affected] } } });
      for (const it of items) {
        // Modo "costs": dejar costUsdPromo en el producto (como hace applyCampaign).
        if (campaign.mode === "costs" && it.promoCostUsd != null) {
          await prisma.product.update({ where: { id: it.productId }, data: { costUsdPromo: it.promoCostUsd } });
        }
        await applyItemToProduct(meta, it.productId, it.campaignPrice, parseVariantPrices(it.variantPrices));
      }
    }
  }

  const count = await prisma.campaignItem.count({ where: { campaignId } });
  return NextResponse.json({ ok: true, count });
}
