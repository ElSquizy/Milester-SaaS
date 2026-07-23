import { NextResponse } from "next/server";
import { getPricingConfig, planApply } from "@/lib/pricing";
import { tierFor } from "@/lib/pricingCore";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET: el diff tabla→catálogo agregado por franja + las listas de excluidos.
 * La ventana de Precios lo usa para pintar alineados/desalineados y para armar
 * el lote de ids a aplicar.
 */
export async function GET() {
  const cfg = await getPricingConfig();
  const plan = await planApply(cfg);

  // Franja de cada fila según su costo base (o el promo si no hay base).
  const costs = new Map<number, { costUsd: number | null; costUsdPromo: number | null }>();
  if (plan.rows.length) {
    const prods = await prisma.product.findMany({
      where: { id: { in: plan.rows.map((r) => r.productId) } },
      select: { id: true, costUsd: true, costUsdPromo: true },
    });
    for (const p of prods) costs.set(p.id, { costUsd: p.costUsd, costUsdPromo: p.costUsdPromo });
  }
  const perTier: Record<number, { products: number; misaligned: number }> = {};
  for (const r of plan.rows) {
    const c = costs.get(r.productId);
    const usd = c?.costUsd ?? c?.costUsdPromo;
    const tier = usd != null ? tierFor(usd, cfg) : null;
    if (!tier) continue;
    perTier[tier.maxUsd] ??= { products: 0, misaligned: 0 };
    perTier[tier.maxUsd].products++;
    if (r.changes) perTier[tier.maxUsd].misaligned++;
  }

  return NextResponse.json({
    perTier,
    toChange: plan.toChange,
    changeIds: plan.rows.filter((r) => r.changes).map((r) => r.productId),
    unpositioned: plan.unpositioned,
    outOfRange: plan.outOfRange,
    inActiveCampaign: plan.inActiveCampaign,
  });
}
