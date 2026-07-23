import { NextResponse } from "next/server";
import { getPricingConfig, applyPricing } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { productIds: number[] } — aplica la tabla de franjas a un LOTE de
 * productos (≈150 por llamada; la UI pagina con barra de progreso, como el
 * push del Sidebar). Los ids vienen del summary (solo los que cambian).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.productIds) ? body.productIds.map(Number).filter((n: number) => !isNaN(n)) : [];
  if (!ids.length) return NextResponse.json({ error: "Sin productos" }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "Máximo 200 por lote" }, { status: 400 });
  try {
    const cfg = await getPricingConfig();
    const result = await applyPricing(cfg, ids);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
