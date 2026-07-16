import { prisma } from "@/lib/prisma";
import { syncProductToTiendaNube, getTiendaNubeClient } from "@/lib/tiendanube";
import { tagsToTnString } from "@/lib/categories";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Pushes a single product's current local state to Tienda Nube and marks it synced.
 * Marks any unsynced changelog entries for the product as synced.
 * Throws on failure (caller is responsible for marking syncStatus: "error").
 */
export async function syncOneProduct(
  productId: number,
  settings: { storeId: string; accessToken: string }
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: "asc" } }, categories: { include: { category: true } } },
  });
  if (!product) throw new Error("Producto no encontrado");

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

  // Keep the local base variant consistent with what we just pushed.
  const first = product.variants[0];
  if (first && (first.price !== product.price || first.promotionalPrice !== product.promotionalPrice)) {
    await prisma.variant.update({ where: { id: first.id }, data: { price: product.price, promotionalPrice: product.promotionalPrice } });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { syncStatus: "synced", lastSyncedAt: now },
    }),
    prisma.changelog.updateMany({
      where: { productId, synced: false },
      data: { synced: true, syncedAt: now },
    }),
  ]);
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
