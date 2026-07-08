import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanIncomingChanges } from "@/lib/changes";

const THROTTLE_MS = 60_000; // don't re-scan within a minute

/** POST: scan TN for incoming changes. Body { force?: boolean } bypasses the throttle. */
export async function POST(req: Request) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const last = settings.lastChangeCheckAt?.getTime() ?? 0;
  if (!body.force && Date.now() - last < THROTTLE_MS) {
    const pending = await prisma.incomingChange.findMany({ distinct: ["tiendaNubeId"], select: { tiendaNubeId: true } });
    return NextResponse.json({ skipped: true, pendingProducts: pending.length });
  }

  try {
    const result = await scanIncomingChanges(settings.storeId, settings.accessToken);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** GET: lightweight pending count (for the sidebar badge). */
export async function GET() {
  const pending = await prisma.incomingChange.findMany({ distinct: ["tiendaNubeId"], select: { tiendaNubeId: true } });
  return NextResponse.json({ pendingProducts: pending.length });
}
