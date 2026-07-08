import { prisma } from "./prisma";
import { syncCatalogFromTiendaNube } from "./catalogSync";
import { syncOrdersIncremental } from "./salesSync";
import { tickCampaigns } from "./campaignScheduler";

export type PullSummary = {
  collections: number;
  catalog: { created: number; updated: number; skipped: number; deleted: number };
  sales: { scanned: number; created: number; updated: number };
  campaigns: { activated: number; ended: number; synced: number; errors: number };
  errors: string[];
  ranAt: string;
};

/**
 * Single "bring local in line with the current Tienda Nube state" pass.
 * Pulls collections + catalog + sales + customers (incremental, upserts — never
 * re-imports as new), then runs the campaign scheduler. Each stage is isolated so
 * one failing stage doesn't abort the rest; failures are collected in `errors`.
 */
export async function pullFromTiendaNube(
  storeId: string,
  accessToken: string,
  opts: { full?: boolean } = {},
): Promise<PullSummary> {
  const summary: PullSummary = {
    collections: 0,
    catalog: { created: 0, updated: 0, skipped: 0, deleted: 0 },
    sales: { scanned: 0, created: 0, updated: 0 },
    campaigns: { activated: 0, ended: 0, synced: 0, errors: 0 },
    errors: [],
    ranAt: new Date().toISOString(),
  };

  try {
    const c = await syncCatalogFromTiendaNube(storeId, accessToken, opts);
    summary.collections = c.collections;
    summary.catalog = { created: c.created, updated: c.updated, skipped: c.skipped, deleted: c.deleted };
  } catch (err) {
    summary.errors.push(`Catálogo: ${err instanceof Error ? err.message : "error"}`);
  }

  try {
    summary.sales = await syncOrdersIncremental(storeId, accessToken);
  } catch (err) {
    summary.errors.push(`Ventas: ${err instanceof Error ? err.message : "error"}`);
  }

  try {
    summary.campaigns = await tickCampaigns({ storeId, accessToken });
  } catch (err) {
    summary.errors.push(`Campañas: ${err instanceof Error ? err.message : "error"}`);
  }

  const settings = await prisma.settings.findFirst();
  if (settings) {
    await prisma.settings.update({ where: { id: settings.id }, data: { lastPullAt: new Date() } });
  }

  return summary;
}
