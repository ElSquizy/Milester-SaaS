import { prisma } from "./prisma";

// Store credentials (storeId + accessToken) rarely change, yet nearly every TN
// route re-reads them. Cache them briefly to cut repeated single-row lookups.
// NOTE: only cache the *credentials* — routes that read mutable Settings fields
// (lastPullAt, lastCampaignTickAt) must query directly for fresh values.

type Creds = { storeId: string; accessToken: string };
let cache: { at: number; value: Creds | null } | null = null;
const TTL_MS = 5_000;

/** Returns TN credentials (cached ~5s) or null if the store isn't connected. */
export async function getCreds(): Promise<Creds | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const s = await prisma.settings.findFirst({ select: { storeId: true, accessToken: true } });
  const value: Creds | null = s?.storeId && s.accessToken ? { storeId: s.storeId, accessToken: s.accessToken } : null;
  cache = { at: Date.now(), value };
  return value;
}

/** Clear the cache after the store connection changes (OAuth, settings save). */
export function invalidateCreds(): void {
  cache = null;
}
