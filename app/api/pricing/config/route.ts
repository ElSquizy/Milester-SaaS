import { NextResponse } from "next/server";
import { getPricingConfig, savePricingConfig } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getPricingConfig());
}

/** PUT: guarda la configuración completa del módulo de precios. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Config inválida" }, { status: 400 });
  try {
    return NextResponse.json(await savePricingConfig(body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
