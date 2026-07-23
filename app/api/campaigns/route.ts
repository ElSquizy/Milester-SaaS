import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCampaignItems } from "@/lib/campaigns";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, mode, discountType, discountValue, addTag, addCategoryId, scope, scopeValue, productIds, items, startDate, endDate } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  const dType = ["pct", "fixed"].includes(discountType) ? discountType : "pct";

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
      // "prices" = sistema clásico (descuentos sobre precios). "costs" = la
      // campaña fija costUsdPromo y la tabla de franjas deriva el promocional.
      mode: mode === "costs" ? "costs" : "prices",
      discountType: dType,
      discountValue: Number(discountValue) || 0,
      addTag: addTag?.trim() || null,
      addCategoryId: addCategoryId ? Number(addCategoryId) : null,
      scope: scope || "all",
      scopeValue: scope === "all" || scope === "products" ? null : (scopeValue || null),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: "draft",
    },
  });

  // Build the editable preview items; use explicit per-product and per-variant prices from the wizard.
  const ids = Array.isArray(productIds) ? productIds.map(Number) : undefined;
  const priceMap: Record<number, number> | undefined = Array.isArray(items)
    ? Object.fromEntries(items.map((i: { productId: number; promoPrice: number }) => [Number(i.productId), Number(i.promoPrice)]))
    : undefined;
  const variantMap: Record<number, { variantId: number; campaignPrice: number }[]> | undefined = Array.isArray(items)
    ? Object.fromEntries(
        items
          .filter((i: { variantPrices?: unknown }) => Array.isArray(i.variantPrices) && i.variantPrices.length)
          .map((i: { productId: number; variantPrices: { variantId: number; campaignPrice: number }[] }) => [
            Number(i.productId),
            i.variantPrices.map((v) => ({ variantId: Number(v.variantId), campaignPrice: Number(v.campaignPrice) })),
          ]),
      )
    : undefined;
  const costMap: Record<number, number> | undefined = Array.isArray(items)
    ? Object.fromEntries(
        items
          .filter((i: { promoCostUsd?: unknown }) => i.promoCostUsd != null && !isNaN(Number(i.promoCostUsd)))
          .map((i: { productId: number; promoCostUsd: number }) => [Number(i.productId), Number(i.promoCostUsd)]),
      )
    : undefined;
  await buildCampaignItems(campaign.id, scope === "products" ? ids : undefined, priceMap, variantMap, costMap);

  return NextResponse.json(campaign);
}
