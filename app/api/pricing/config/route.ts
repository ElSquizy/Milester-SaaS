import { NextResponse } from "next/server";
import { getPricingSettings, savePricingSettings } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getPricingSettings());
}

/** PUT: guarda la configuración completa (perfiles) del módulo de precios. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.profiles)) return NextResponse.json({ error: "Config inválida" }, { status: 400 });
  try {
    return NextResponse.json(await savePricingSettings(body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
