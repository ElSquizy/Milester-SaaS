import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tickCampaigns } from "@/lib/campaignScheduler";
import { pullFromTiendaNube } from "@/lib/pullSync";

export const runtime = "nodejs";

/**
 * Durable scheduler entrypoint — hit this on a fixed interval by an external
 * cron (GitHub Actions / cron-job.org / Vercel Cron). Runs the campaign tick
 * and an inbound pull so campaigns activate/end and data stays fresh even when
 * nobody has the app open. Protected by CRON_SECRET (this path bypasses the
 * login gate in proxy.ts, so the secret is its only guard).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("secret");
  if (provided !== secret) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ skipped: "no-credentials" });
  }
  const creds = { storeId: settings.storeId, accessToken: settings.accessToken };

  // ?full=1 → disaster-recovery pass: reconcile the ENTIRE catalog and order
  // history instead of the incremental window. Heavy (minutes); run it against a
  // local dev server rather than the deployed function, whose time limit it can
  // exceed. See docs/arquitectura.md → Reconstrucción.
  const full = new URL(req.url).searchParams.get("full") === "1";

  const out: Record<string, unknown> = { ranAt: new Date().toISOString(), ...(full ? { full: true } : {}) };
  try { out.campaigns = await tickCampaigns(creds); } catch (e) { out.campaignsError = e instanceof Error ? e.message : "error"; }
  try { out.pull = await pullFromTiendaNube(creds.storeId, creds.accessToken, { full }); } catch (e) { out.pullError = e instanceof Error ? e.message : "error"; }

  await prisma.settings.update({ where: { id: settings.id }, data: { lastCampaignTickAt: new Date(), lastPullAt: new Date() } }).catch(() => {});
  return NextResponse.json(out);
}
