import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOrdersIncremental } from "@/lib/salesSync";

const THROTTLE_MS = 30_000;

/** POST: incrementally pull new/changed orders from TN. Body { force?: boolean }. */
export async function POST(req: Request) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const last = settings.lastOrderSyncAt?.getTime() ?? 0;
  if (!body.force && Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ skipped: true, lastSyncAt: settings.lastOrderSyncAt });
  }

  try {
    const result = await syncOrdersIncremental(settings.storeId, settings.accessToken);
    return NextResponse.json({ ...result, lastSyncAt: new Date() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** GET: last sync time. */
export async function GET() {
  const settings = await prisma.settings.findFirst();
  return NextResponse.json({ lastSyncAt: settings?.lastOrderSyncAt ?? null });
}
