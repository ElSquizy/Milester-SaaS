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
  const { name, discountType, discountValue, addTag, addCategoryId, scope, scopeValue, productIds, items, startDate, endDate } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  const dType = ["pct", "fixed"].includes(discountType) ? discountType : "pct";

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
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

  // Build the editable preview items; use explicit per-product prices if the wizard sent them.
  const ids = Array.isArray(productIds) ? productIds.map(Number) : undefined;
  const priceMap: Record<number, number> | undefined = Array.isArray(items)
    ? Object.fromEntries(items.map((i: { productId: number; promoPrice: number }) => [Number(i.productId), Number(i.promoPrice)]))
    : undefined;
  await buildCampaignItems(campaign.id, scope === "products" ? ids : undefined, priceMap);

  return NextResponse.json(campaign);
}
