import { prisma } from "./prisma";
import { applyCampaign, endCampaign, campaignProductIds } from "./campaigns";
import { syncOneProduct } from "./sync";

/**
 * Campaign scheduler tick. Rules:
 *  - draft with startDate <= now  → auto-activate (apply prices + tag)
 *  - active with endDate <= now   → auto-end (restore prices, remove tag)
 * After each transition, the affected products are pushed to Tienda Nube so the
 * automation is end-to-end (no manual sync required). Per-product failures mark
 * the product as "error" and don't abort the rest.
 */
export async function tickCampaigns(creds: { storeId: string; accessToken: string }) {
  const now = new Date();
  let activated = 0;
  let ended = 0;
  let synced = 0;
  let errors = 0;

  async function syncProducts(ids: number[]) {
    for (const id of ids) {
      try {
        await syncOneProduct(id, creds);
        synced++;
      } catch {
        errors++;
        await prisma.product.update({ where: { id }, data: { syncStatus: "error" } }).catch(() => {});
      }
      // Be gentle with Tienda Nube's rate limit when a campaign touches many products.
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  // 1. Auto-activate scheduled drafts whose start time has arrived.
  const toActivate = await prisma.campaign.findMany({
    where: { status: "draft", startDate: { not: null, lte: now } },
    select: { id: true },
  });
  for (const c of toActivate) {
    try {
      await applyCampaign(c.id);
      activated++;
      await syncProducts(await campaignProductIds(c.id));
    } catch {
      // Skip this campaign; it will be retried on the next tick.
    }
  }

  // 2. Auto-end active campaigns whose end time has passed.
  const toEnd = await prisma.campaign.findMany({
    where: { status: "active", endDate: { not: null, lte: now } },
    select: { id: true },
  });
  for (const c of toEnd) {
    try {
      const ids = await campaignProductIds(c.id); // read before ending (items are kept, but be explicit)
      await endCampaign(c.id);
      ended++;
      await syncProducts(ids);
    } catch {
      // Retried on next tick.
    }
  }

  return { activated, ended, synced, errors };
}

/** Next scheduled event across campaigns (for dashboard widgets). */
export async function nextCampaignEvent() {
  const now = new Date();
  const [nextStart, nextEnd] = await Promise.all([
    prisma.campaign.findFirst({
      where: { status: "draft", startDate: { gt: now } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true },
    }),
    prisma.campaign.findFirst({
      where: { status: "active", endDate: { gt: now } },
      orderBy: { endDate: "asc" },
      select: { id: true, name: true, endDate: true },
    }),
  ]);
  return { nextStart, nextEnd };
}
