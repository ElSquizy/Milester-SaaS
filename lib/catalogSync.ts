import { prisma } from "./prisma";
import { importProductsFromTiendaNube, fetchProductsUpdatedSince, getTiendaNubeClient } from "./tiendanube";
import { syncCategoryTree, linkProductCategories, tagsFromTnString } from "./categories";

/* Shapes we read off the Tienda Nube product payload. */
type TNVariant = { id?: number; price: string; promotional_price?: string | null; stock?: number | null; sku?: string | null; values?: Record<string, string>[] };
type TNImage = { src: string };
type TNCategory = { id: number; name: Record<string, string> };
export type TNProduct = {
  id: number;
  name: Record<string, string>;
  description: Record<string, string>;
  seo_title?: Record<string, string>;
  seo_description?: Record<string, string>;
  images?: TNImage[];
  categories?: TNCategory[];
  variants?: TNVariant[];
  attributes?: Record<string, string>[];
  published?: boolean;
  requires_shipping?: boolean;
  tags?: string;
};

function loc(field: Record<string, string> | null | undefined): string {
  if (!field) return "";
  return field.es || field.pt || Object.values(field)[0] || "";
}

function promo(v: TNVariant | undefined): number | null {
  const n = v?.promotional_price != null ? parseFloat(v.promotional_price) : NaN;
  return isNaN(n) ? null : n;
}

export type UpsertResult = { created: number; updated: number; skipped: number };

/**
 * Upserts a batch of Tienda Nube products into the local catalog.
 * - Existing products are matched by tiendaNubeId and updated to TN's current state.
 * - Products with local unsynced edits (syncStatus "modified" or "error") are SKIPPED,
 *   so a pull never clobbers work that's waiting to be pushed to TN.
 * - `onProgress` is called after each processed product (for streaming UIs).
 */
export async function upsertTnProducts(
  tnProducts: TNProduct[],
  categoryMap: Map<string, number>,
  onProgress?: (r: UpsertResult) => void,
  opts?: { force?: boolean }, // force: overwrite even local edits (used by "discard changes")
): Promise<UpsertResult> {
  const existing = await prisma.product.findMany({
    where: { tiendaNubeId: { not: null } },
    select: { id: true, tiendaNubeId: true, syncStatus: true, stock: true, name: true, price: true },
  });
  const existingMap = new Map(existing.map((p) => [p.tiendaNubeId!, { id: p.id, syncStatus: p.syncStatus, stock: p.stock, name: p.name, price: p.price }]));

  const res: UpsertResult = { created: 0, updated: 0, skipped: 0 };

  for (const tnP of tnProducts) {
    const match = existingMap.get(String(tnP.id));
    const price = parseFloat(tnP.variants?.[0]?.price || "0");
    const stock = tnP.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? null;
    // TN nulls a variant's stock when stock management is off = unlimited stock.
    const infiniteStock = (tnP.variants || []).some((v) => v.stock == null);
    const sku = tnP.variants?.[0]?.sku ?? null;
    const published = tnP.published ?? true;
    const catIds = (tnP.categories || []).map((c) => String(c.id));
    const attributes = JSON.stringify((tnP.attributes || []).map(loc));

    if (match) {
      // Protect in-flight local edits from being overwritten by the pull.
      if (!opts?.force && (match.syncStatus === "modified" || match.syncStatus === "error")) {
        res.skipped++;
        onProgress?.(res);
        continue;
      }
      // Record store-wide (incoming) changes for the activity feed, before overwriting.
      const newName = loc(tnP.name);
      const incoming: { field: string; oldValue: string | null; newValue: string | null }[] = [];
      if (match.stock !== stock) incoming.push({ field: "stock", oldValue: match.stock == null ? null : String(match.stock), newValue: stock == null ? null : String(stock) });
      if (match.name !== newName) incoming.push({ field: "name", oldValue: match.name, newValue: newName });
      if (match.price !== price) incoming.push({ field: "price", oldValue: String(match.price), newValue: String(price) });
      if (incoming.length) {
        const now = new Date();
        await prisma.changelog.createMany({ data: incoming.map((c) => ({ productId: match.id, ...c, synced: true, syncedAt: now })) });
      }

      await prisma.product.update({
        where: { id: match.id },
        data: {
          name: newName,
          description: loc(tnP.description),
          seoTitle: loc(tnP.seo_title) || null,
          seoDescription: loc(tnP.seo_description) || null,
          imageUrl: tnP.images?.[0]?.src || null,
          categoryId: tnP.categories?.[0]?.id ? String(tnP.categories[0].id) : null,
          categoryName: tnP.categories?.[0]?.name ? loc(tnP.categories[0].name) : null,
          tags: tagsFromTnString(tnP.tags),
          requiresShipping: tnP.requires_shipping ?? null,
          stock, infiniteStock, attributes, price, sku, published,
          promotionalPrice: promo(tnP.variants?.[0]),
          syncStatus: "synced",
          lastSyncedAt: new Date(),
        },
      });
      await linkProductCategories(match.id, catIds, categoryMap);
      res.updated++;
    } else {
      const createdP = await prisma.product.create({
        data: {
          tiendaNubeId: String(tnP.id),
          name: loc(tnP.name),
          description: loc(tnP.description),
          price,
          originalPrice: price,
          seoTitle: loc(tnP.seo_title) || null,
          seoDescription: loc(tnP.seo_description) || null,
          imageUrl: tnP.images?.[0]?.src || null,
          categoryId: tnP.categories?.[0]?.id ? String(tnP.categories[0].id) : null,
          categoryName: tnP.categories?.[0]?.name ? loc(tnP.categories[0].name) : null,
          tags: tagsFromTnString(tnP.tags),
          requiresShipping: tnP.requires_shipping ?? null,
          stock, infiniteStock, attributes, sku, published,
          promotionalPrice: promo(tnP.variants?.[0]),
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          variants: {
            create: (tnP.variants || [{ price: String(price) }]).map((v) => ({
              tiendaNubeId: v.id ? String(v.id) : null,
              price: parseFloat(v.price || "0"),
              promotionalPrice: promo(v),
              stock: v.stock ?? null,
              sku: v.sku ?? null,
              values: JSON.stringify((v.values || []).map(loc)),
            })),
          },
        },
        select: { id: true },
      });
      await linkProductCategories(createdP.id, catIds, categoryMap);
      res.created++;
    }
    onProgress?.(res);
  }

  return res;
}

/**
 * Pulls the current catalog + collections from Tienda Nube into local state.
 * Incremental by default (only products changed since the last catalog sync);
 * pass `full: true` to reconcile the entire catalog.
 */
/**
 * Deletes local products that no longer exist on Tienda Nube. Deletions are invisible to
 * the incremental (`updated_since`) feed, so the only way to catch them is to list every
 * live product id and diff. We fetch only `id` (the lightest possible call). Guarded: if
 * the store reports zero products we skip, so an API hiccup can never wipe the catalog.
 * Local-only products (no tiendaNubeId) are never touched.
 */
export async function pruneDeletedProducts(storeId: string, accessToken: string): Promise<{ deleted: number }> {
  const client = getTiendaNubeClient(storeId, accessToken);
  const liveIds = new Set<string>();
  let page = 1;
  while (true) {
    const { data, headers } = await client.get(`/products?fields=id&per_page=200&page=${page}`);
    if (!data || data.length === 0) break;
    for (const p of data) liveIds.add(String(p.id));
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }
  if (liveIds.size === 0) return { deleted: 0 };

  const locals = await prisma.product.findMany({
    where: { tiendaNubeId: { not: null } },
    select: { id: true, tiendaNubeId: true },
  });
  const orphans = locals.filter((p) => !liveIds.has(p.tiendaNubeId!)).map((p) => p.id);
  if (orphans.length) {
    // Cascades to variants, campaign items, category links, promotion; order items keep
    // their sales history (productId set to null) so aggregates aren't lost.
    await prisma.product.deleteMany({ where: { id: { in: orphans } } });
  }
  return { deleted: orphans.length };
}

export async function syncCatalogFromTiendaNube(
  storeId: string,
  accessToken: string,
  opts: { full?: boolean } = {},
): Promise<{ collections: number; deleted: number } & UpsertResult> {
  const settings = await prisma.settings.findFirst();
  const scanStart = new Date();

  // Collections first so products can be linked to them.
  const categoryMap = await syncCategoryTree(storeId, accessToken);

  // Baseline for the incremental window: the explicit marker, else fall back to the
  // newest product we already have (so a first pull over an existing catalog stays
  // incremental instead of re-fetching everything). Only a truly empty catalog, or an
  // explicit `full`, does a full reconcile.
  let baseline: Date | null = opts.full ? null : settings?.lastCatalogSyncAt ?? null;
  if (!opts.full && !baseline) {
    const newest = await prisma.product.findFirst({
      where: { tiendaNubeId: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    });
    baseline = newest?.lastSyncedAt ?? null;
  }

  const BUFFER_MS = 10 * 60 * 1000;
  const sinceISO = baseline ? new Date(baseline.getTime() - BUFFER_MS).toISOString() : undefined;

  const tnProducts = (opts.full || !baseline
    ? await importProductsFromTiendaNube(storeId, accessToken)
    : await fetchProductsUpdatedSince(storeId, accessToken, sinceISO)) as TNProduct[];

  const res = await upsertTnProducts(tnProducts, categoryMap);

  // Reconcile deletions (products removed on TN). The id-only listing is cheap.
  const { deleted } = await pruneDeletedProducts(storeId, accessToken);

  if (settings) {
    await prisma.settings.update({ where: { id: settings.id }, data: { lastCatalogSyncAt: scanStart } });
  }

  return { collections: categoryMap.size, deleted, ...res };
}

/**
 * Discards a product's un-pushed local edits by re-reading it from Tienda Nube,
 * which still holds the last synced version. Restores product fields *and*
 * variants (the regular pull ignores variants), then marks it clean.
 * Only meaningful while the change hasn't been pushed yet.
 */
export async function revertProductFromTiendaNube(
  productId: number,
  creds: { storeId: string; accessToken: string },
) {
  const local = await prisma.product.findUnique({ where: { id: productId }, select: { tiendaNubeId: true } });
  if (!local) throw new Error("Producto no encontrado");
  if (!local.tiendaNubeId) throw new Error("Este producto todavía no existe en Tienda Nube: no hay versión anterior a la que volver.");

  const client = getTiendaNubeClient(creds.storeId, creds.accessToken);
  const { data: tnP } = await client.get(`/products/${local.tiendaNubeId}`);

  // Product-level fields (force, so the local edits we're discarding get overwritten).
  const categoryMap = await syncCategoryTree(creds.storeId, creds.accessToken);
  await upsertTnProducts([tnP as TNProduct], categoryMap, undefined, { force: true });

  // Variants: mirror Tienda Nube exactly (update, create, drop extras).
  const tnVariants: TNVariant[] = tnP.variants || [];
  const keptIds: number[] = [];
  for (const v of tnVariants) {
    const tnId = v.id != null ? String(v.id) : null;
    const data = {
      price: parseFloat(v.price || "0"),
      promotionalPrice: promo(v),
      stock: v.stock ?? null,
      sku: v.sku ?? null,
      values: JSON.stringify((v.values || []).map(loc)),
    };
    const existing = tnId ? await prisma.variant.findFirst({ where: { productId, tiendaNubeId: tnId }, select: { id: true } }) : null;
    if (existing) {
      await prisma.variant.update({ where: { id: existing.id }, data });
      keptIds.push(existing.id);
    } else {
      const created = await prisma.variant.create({ data: { productId, tiendaNubeId: tnId, ...data } });
      keptIds.push(created.id);
    }
  }
  await prisma.variant.deleteMany({ where: { productId, id: { notIn: keptIds.length ? keptIds : [-1] } } });

  // Clean slate: nothing pending for this product any more.
  await prisma.product.update({
    where: { id: productId },
    data: { syncStatus: "synced", pendingDelete: false, lastSyncedAt: new Date() },
  });

  return { reverted: true, variants: tnVariants.length };
}
