import { NextResponse } from "next/server";
import { getPricingSettings, planApply } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET: el diff tabla→catálogo por PERFIL y franja + las listas de excluidos.
 * La ventana usa perProfile[profileId][tierMax] para pintar alineados/
 * desalineados de la pestaña activa; toChange/changeIds son globales (aplicar
 * corre sobre todo el catálogo, cada producto por su perfil).
 */
export async function GET() {
  const settings = await getPricingSettings();
  const plan = await planApply(settings);

  const perProfile: Record<string, { count: number; tiers: Record<string, { products: number; misaligned: number }> }> = {};
  for (const p of settings.profiles) perProfile[p.id] = { count: 0, tiers: {} };
  for (const r of plan.rows) {
    const prof = perProfile[r.profileId] ?? (perProfile[r.profileId] = { count: 0, tiers: {} });
    prof.count++;
    if (r.tierId != null) {
      prof.tiers[r.tierId] ??= { products: 0, misaligned: 0 };
      prof.tiers[r.tierId].products++;
      if (r.changes) prof.tiers[r.tierId].misaligned++;
    }
  }

  return NextResponse.json({
    perProfile,
    toChange: plan.toChange,
    changeIds: plan.rows.filter((r) => r.changes).map((r) => r.productId),
    unpositioned: plan.unpositioned,
    outOfRange: plan.outOfRange,
    inActiveCampaign: plan.inActiveCampaign,
  });
}
