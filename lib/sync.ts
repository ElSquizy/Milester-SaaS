import { prisma } from "@/lib/prisma";
import { syncProductToTiendaNube, getTiendaNubeClient } from "@/lib/tiendanube";
import { tagsToTnString } from "@/lib/categories";
import { pushProductImage } from "@/lib/productImage";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SyncResult = {
  /** True when this push CREATED the product on TN (e.g. a duplicated product). */
  created: boolean;
  /** Distinct changelog fields this push carried — feeds the post-sync recap. */
  fields: string[];
};

/**
 * Pushes a single product's current local state to Tienda Nube and marks it synced.
 * Marks any unsynced changelog entries for the product as synced.
 * Throws on failure (caller is responsible for marking syncStatus: "error").
 */
export async function syncOneProduct(
  productId: number,
  settings: { storeId: string; accessToken: string }
): Promise<SyncResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: "asc" } }, categories: { include: { category: true } } },
  });
  if (!product) throw new Error("Producto no encontrado");

  // What this push is carrying, read before the bookkeeping marks it synced.
  const pendingChanges = await prisma.changelog.findMany({
    where: { productId, synced: false },
    select: { field: true },
    distinct: ["field"],
  });

  // TN expects category ids as integers and tags as a comma-separated string.
  const categoryTnIds = product.categories
    .map((pc) => parseInt(pc.category.tiendaNubeId, 10))
    .filter((n) => !isNaN(n));

  // Product.price / Product.promotionalPrice are the source of truth for the base and
  // sale prices (what campaigns, bulk actions and the edit panel modify). The first
  // variant follows them on push; other variants keep their own tiered prices.
  const parseArr = (s: string): string[] => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };
  const attributes = parseArr(product.attributes);
  const variantsToPush = product.variants.map((v, idx) => ({
    ...(idx === 0 ? { ...v, price: product.price, promotionalPrice: product.promotionalPrice } : v),
    values: parseArr(v.values),
  }));

  const tnResult: any = await syncProductToTiendaNube(settings.storeId, settings.accessToken, {
    tiendaNubeId: product.tiendaNubeId,
    name: product.name,
    description: product.description,
    price: product.price,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    variants: variantsToPush,
    attributes,
    published: product.published,
    requiresShipping: product.requiresShipping,
    categoryIds: categoryTnIds,
    tags: tagsToTnString(product.tags),
  });

  // If this was a CREATE (no prior TN id — e.g. a duplicated product), persist the new
  // TN id and variant ids so the next sync UPDATES it instead of creating a duplicate.
  if (!product.tiendaNubeId && tnResult?.id) {
    await prisma.product.update({ where: { id: productId }, data: { tiendaNubeId: String(tnResult.id) } });
    const tnVariants: any[] = Array.isArray(tnResult.variants) ? tnResult.variants : [];
    for (let i = 0; i < product.variants.length; i++) {
      const tv = tnVariants[i];
      if (tv?.id) await prisma.variant.update({ where: { id: product.variants[i].id }, data: { tiendaNubeId: String(tv.id) } });
    }
  }

  // Images live on their own TN endpoint, so they don't travel with the product
  // payload above and have to be pushed separately. A freshly created product
  // (a duplicate) always needs one; an existing one only when the image changed.
  const wasCreate = !product.tiendaNubeId && !!tnResult?.id;
  const needsImage = product.imageDirty || (wasCreate && !!(product.productImageUrl || product.imageUrl));

  // Keep the local base variant consistent with what we just pushed.
  const first = product.variants[0];
  if (first && (first.price !== product.price || first.promotionalPrice !== product.promotionalPrice)) {
    await prisma.variant.update({ where: { id: first.id }, data: { price: product.price, promotionalPrice: product.promotionalPrice } });
  }

  // Sequential rather than a $transaction: these are two idempotent bookkeeping
  // writes, and wrapping them made the whole sync fail on Turso ("unable to start
  // a transaction in the given time") whenever the push ran long — which it does
  // as soon as Tienda Nube rate-limits us and the client backs off.
  const now = new Date();
  await prisma.product.update({
    where: { id: productId },
    data: { syncStatus: "synced", lastSyncedAt: now },
  });
  await prisma.changelog.updateMany({
    where: { productId, synced: false },
    data: { synced: true, syncedAt: now },
  });

  // Image last: it's the slowest step by far, so it must never put the record of
  // a successful field sync at risk. If it fails the product goes to "error",
  // which keeps it in the retry queue instead of quietly leaving Tienda Nube
  // showing the wrong picture.
  if (needsImage) {
    try {
      await pushProductImage(productId, settings);
    } catch (err) {
      await prisma.product.update({ where: { id: productId }, data: { syncStatus: "error" } });
      throw err;
    }
  }

  const fields = pendingChanges.map((c) => c.field);
  if (needsImage && !fields.includes("imagen")) fields.push("imagen");
  return { created: wasCreate, fields };
}

/**
 * Deletes a product from Tienda Nube (if it exists there) and then locally.
 * A 404 on TN is treated as success (already gone). Order history is preserved
 * (OrderItem.productId is set to null by the schema on delete).
 */
export async function deleteOneProduct(
  productId: number,
  settings: { storeId: string; accessToken: string }
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { tiendaNubeId: true },
  });
  if (!product) return;

  if (product.tiendaNubeId) {
    const client = getTiendaNubeClient(settings.storeId, settings.accessToken);
    try {
      await client.delete(`/products/${product.tiendaNubeId}`);
    } catch (err: any) {
      if (err?.response?.status !== 404) throw err; // 404 = already deleted upstream
    }
  }
  await prisma.product.delete({ where: { id: productId } });
}

/** Count of products with unsynced local changes (edits/new copies or staged deletions). */
export function countPendingProducts() {
  return prisma.product.count({ where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] } });
}
