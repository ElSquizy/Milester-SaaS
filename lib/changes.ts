import { prisma } from "./prisma";
import { fetchProductsUpdatedSince, getTiendaNubeClient } from "./tiendanube";
import { syncCategoryTree, linkProductCategories, tagsFromTnString } from "./categories";

const loc = (f: Record<string, string> | null | undefined): string =>
  f ? f.es || Object.values(f)[0] || "" : "";

type TNProduct = {
  id: number;
  name: Record<string, string>;
  published?: boolean;
  tags?: string;
  variants?: { price: string; stock?: number | null }[];
  categories?: { id: number; name: Record<string, string> }[];
};

function normTags(json: string): string[] {
  try { return (JSON.parse(json) as string[]).map((t) => t.trim()).filter(Boolean).sort(); }
  catch { return []; }
}
function tnTags(s: unknown): string[] {
  return typeof s === "string" ? s.split(",").map((t) => t.trim()).filter(Boolean).sort() : [];
}

/**
 * Scans Tienda Nube for products changed since the last check, diffs them against the
 * local DB, and records pending IncomingChange rows. Never overwrites anything.
 */
export async function scanIncomingChanges(storeId: string, accessToken: string) {
  const settings = await prisma.settings.findFirst();
  const scanStart = new Date();

  // Use a safety buffer so clock skew / second-granularity timestamps don't drop
  // edits made right around the last check. Re-scanning unchanged products is harmless
  // (we diff actual values). First scan (no timestamp) is a full reconciliation.
  const BUFFER_MS = 10 * 60 * 1000;
  const since = settings?.lastChangeCheckAt
    ? new Date(settings.lastChangeCheckAt.getTime() - BUFFER_MS).toISOString()
    : undefined;

  const tnProducts = (await fetchProductsUpdatedSince(storeId, accessToken, since)) as TNProduct[];

  // Local snapshot, keyed by TN id.
  const locals = await prisma.product.findMany({
    where: { tiendaNubeId: { not: null } },
    include: { categories: { include: { category: true } } },
  });
  const localByTn = new Map(locals.map((p) => [p.tiendaNubeId!, p]));

  let detected = 0;

  for (const tn of tnProducts) {
    const tnId = String(tn.id);
    const local = localByTn.get(tnId);
    const rows: { field: string; localValue: string | null; remoteValue: string | null }[] = [];

    if (!local) {
      rows.push({ field: "new", localValue: null, remoteValue: loc(tn.name) });
    } else {
      const remoteName = loc(tn.name);
      if (remoteName && remoteName !== local.name)
        rows.push({ field: "name", localValue: local.name, remoteValue: remoteName });

      const remotePrice = parseFloat(tn.variants?.[0]?.price || "0");
      if (!isNaN(remotePrice) && remotePrice !== local.price)
        rows.push({ field: "price", localValue: String(local.price), remoteValue: String(remotePrice) });

      const remotePublished = tn.published ?? true;
      if (remotePublished !== local.published)
        rows.push({ field: "published", localValue: local.published ? "Publicado" : "Oculto", remoteValue: remotePublished ? "Publicado" : "Oculto" });

      const remoteStock = tn.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? null;
      if (remoteStock != null && remoteStock !== local.stock)
        rows.push({ field: "stock", localValue: String(local.stock ?? "—"), remoteValue: String(remoteStock) });

      const localTags = normTags(local.tags);
      const remoteTags = tnTags(tn.tags);
      if (JSON.stringify(localTags) !== JSON.stringify(remoteTags))
        rows.push({ field: "tags", localValue: localTags.join(", ") || "—", remoteValue: remoteTags.join(", ") || "—" });

      const localCatIds = local.categories.map((pc) => pc.category.tiendaNubeId).sort();
      const remoteCatIds = (tn.categories || []).map((c) => String(c.id)).sort();
      if (JSON.stringify(localCatIds) !== JSON.stringify(remoteCatIds)) {
        const remoteNames = (tn.categories || []).map((c) => loc(c.name)).join(", ");
        const localNames = local.categories.map((pc) => pc.category.name).join(", ");
        rows.push({ field: "categories", localValue: localNames || "—", remoteValue: remoteNames || "—" });
      }
    }

    // Refresh this product's pending rows: clear old, insert current diffs.
    await prisma.incomingChange.deleteMany({ where: { tiendaNubeId: tnId } });
    if (rows.length > 0) {
      const conflict = local?.syncStatus === "modified";
      await prisma.incomingChange.createMany({
        data: rows.map((r) => ({
          tiendaNubeId: tnId,
          productId: local?.id ?? null,
          productName: local?.name || loc(tn.name),
          field: r.field,
          localValue: r.localValue,
          remoteValue: r.remoteValue,
          conflict,
        })),
      });
      detected += rows.length;
    }
  }

  if (settings) {
    await prisma.settings.update({ where: { id: settings.id }, data: { lastChangeCheckAt: scanStart } });
  }

  const pendingProducts = await prisma.incomingChange.findMany({ distinct: ["tiendaNubeId"], select: { tiendaNubeId: true } });
  return { scanned: tnProducts.length, detected, pendingProducts: pendingProducts.length };
}

/** Applies incoming changes: re-imports the given TN products into the local DB. */
export async function applyIncoming(tiendaNubeIds: string[], storeId: string, accessToken: string) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const catMap = await syncCategoryTree(storeId, accessToken);
  let applied = 0;

  for (const tnId of tiendaNubeIds) {
    let tn: TNProduct & { images?: { src: string }[]; description?: Record<string, string>; seo_title?: Record<string, string>; seo_description?: Record<string, string> };
    try {
      const res = await client.get(`/products/${tnId}`);
      tn = res.data;
    } catch {
      // Product deleted on TN; just clear its pending rows.
      await prisma.incomingChange.deleteMany({ where: { tiendaNubeId: tnId } });
      continue;
    }

    const price = parseFloat(tn.variants?.[0]?.price || "0");
    const stock = tn.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? null;
    const data = {
      name: loc(tn.name),
      published: tn.published ?? true,
      tags: tagsFromTnString(tn.tags),
      imageUrl: tn.images?.[0]?.src || null,
      stock,
      price,
      categoryId: tn.categories?.[0]?.id ? String(tn.categories[0].id) : null,
      categoryName: tn.categories?.[0]?.name ? loc(tn.categories[0].name) : null,
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    };

    const existing = await prisma.product.findUnique({ where: { tiendaNubeId: tnId }, select: { id: true } });
    let localId: number;
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
      localId = existing.id;
    } else {
      const created = await prisma.product.create({
        data: {
          tiendaNubeId: tnId,
          originalPrice: price,
          ...data,
          variants: {
            create: (tn.variants || [{ price: String(price) }]).map((v) => ({
              price: parseFloat(v.price || "0"),
              stock: v.stock ?? null,
            })),
          },
        },
        select: { id: true },
      });
      localId = created.id;
    }

    await linkProductCategories(localId, (tn.categories || []).map((c) => String(c.id)), catMap);
    await prisma.incomingChange.deleteMany({ where: { tiendaNubeId: tnId } });
    applied++;
  }

  return { applied };
}

/** Dismisses incoming changes without applying them. */
export async function dismissIncoming(tiendaNubeIds: string[]) {
  await prisma.incomingChange.deleteMany({ where: { tiendaNubeId: { in: tiendaNubeIds } } });
}
