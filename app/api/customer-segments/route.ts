import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSegmentConfig } from "@/lib/customerSegments";

export const runtime = "nodejs";

/** GET: umbrales de segmentación actuales (saneados). */
export async function GET() {
  const s = await prisma.settings.findFirst({ select: { segmentConfig: true } });
  return NextResponse.json(parseSegmentConfig(s?.segmentConfig));
}

/** PUT: guarda los umbrales { dormantDays, vipMinSpent, vipMinOrders }. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cfg = parseSegmentConfig(JSON.stringify(body));
  const settings = await prisma.settings.findFirst({ select: { id: true } });
  if (!settings) return NextResponse.json({ error: "Configurá tu tienda primero" }, { status: 400 });
  await prisma.settings.update({ where: { id: settings.id }, data: { segmentConfig: JSON.stringify(cfg) } });
  return NextResponse.json(cfg);
}
