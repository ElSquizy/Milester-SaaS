import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET: sales performance of a campaign's products during its active window
 * (appliedAt .. endedAt ?? now). Requires the campaign to have been applied.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: Number(id) },
    include: { items: { include: { product: { select: { name: true, imageUrl: true } } } } },
  });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (!campaign.appliedAt) return NextResponse.json({ error: "La campaña nunca se activó" }, { status: 400 });

  const from = campaign.appliedAt;
  const to = campaign.endedAt ?? new Date();

  // Units + revenue per campaign product sold inside the window (excluding cancelled orders).
  const sold = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: campaign.items.map((i) => i.productId) },
      order: { status: { not: "cancelled" }, orderedAt: { gte: from, lte: to } },
    },
    _sum: { quantity: true },
  });
  const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));

  const products = campaign.items.map((i) => ({
    productId: i.productId,
    name: i.product?.name ?? `#${i.productId}`,
    imageUrl: i.product?.imageUrl ?? null,
    campaignPrice: i.campaignPrice,
    originalPrice: i.originalPrice,
    units: soldMap.get(i.productId) ?? 0,
    revenue: Math.round((soldMap.get(i.productId) ?? 0) * i.campaignPrice),
  })).sort((a, b) => b.units - a.units);

  const totalUnits = products.reduce((s, p) => s + p.units, 0);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const withoutSales = products.filter((p) => p.units === 0).length;

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    active: campaign.status === "active",
    totalUnits,
    totalRevenue,
    withoutSales,
    productCount: products.length,
    products,
  });
}
