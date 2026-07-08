import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pullFromTiendaNube } from "@/lib/pullSync";

// Auto-pull (fired on navigation) is throttled; the explicit button sends force.
const THROTTLE_MS = 45_000;

/**
 * POST: bring local state in line with the current Tienda Nube.
 * Body: { force?: boolean, full?: boolean }.
 *  - force  → ignore the throttle (used by the manual "Sincronizar" button)
 *  - full   → reconcile the whole catalog, not just products changed since last pull
 */
export async function POST(req: Request) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const last = settings.lastPullAt?.getTime() ?? 0;
  if (!body.force && Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ skipped: true, lastPullAt: settings.lastPullAt });
  }

  try {
    const summary = await pullFromTiendaNube(settings.storeId, settings.accessToken, { full: !!body.full });
    return NextResponse.json({ ...summary, lastPullAt: new Date() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** GET: last successful pull time. */
export async function GET() {
  const settings = await prisma.settings.findFirst();
  return NextResponse.json({ lastPullAt: settings?.lastPullAt ?? null });
}
