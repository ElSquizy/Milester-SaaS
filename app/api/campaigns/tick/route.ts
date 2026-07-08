import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tickCampaigns, nextCampaignEvent } from "@/lib/campaignScheduler";

const THROTTLE_MS = 60_000;

/** POST: run the campaign scheduler (throttled; body { force?: boolean } bypasses). */
export async function POST(req: Request) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ skipped: true, reason: "no-credentials" });
  }

  const body = await req.json().catch(() => ({}));
  const last = settings.lastCampaignTickAt?.getTime() ?? 0;
  if (!body.force && Date.now() - last < THROTTLE_MS) {
    return NextResponse.json({ skipped: true });
  }
  await prisma.settings.update({ where: { id: settings.id }, data: { lastCampaignTickAt: new Date() } });

  try {
    const result = await tickCampaigns({ storeId: settings.storeId, accessToken: settings.accessToken });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** GET: next scheduled campaign events (dashboard widget). */
export async function GET() {
  return NextResponse.json(await nextCampaignEvent());
}
