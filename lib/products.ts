import { prisma } from "./prisma";
import { getProductVariants } from "./variants";

const parseArr = (s: string): string[] => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };

/**
 * Creates a local copy of a product, staged as a new (unsynced) product.
 * The copy has no tiendaNubeId and syncStatus "modified", so the next sync CREATES it
 * on Tienda Nube. It starts hidden (published: false) and drops SKUs to avoid clashes;
 * name, price, categories and tags are carried over. Images are not copied to TN on
 * create (TN handles images via a separate endpoint) — the local image is kept.
 *
 * All variants are copied (with their attribute values), so a multi-variant product like
 * "MIX Gamer" is recreated in full on Tienda Nube at the next sync. SKUs are dropped to
 * avoid clashes; the copy starts hidden (published: false).
 */
export async function duplicateProduct(sourceId: number, creds?: { storeId: string; accessToken: string }) {
  const src = await prisma.product.findUnique({
    where: { id: sourceId },
    include: { variants: { orderBy: { id: "asc" } }, categories: true },
  });
  if (!src) throw new Error("Producto no encontrado");

  // Variant list from the local mirror by default…
  let attributes = src.attributes;
  let variantData = (src.variants.length ? src.variants : [{ price: src.price, promotionalPrice: null, stock: src.stock, values: "[]" }])
    .map((v) => ({ price: v.price, promotionalPrice: v.promotionalPrice ?? null, stock: v.stock ?? null, values: parseArr(v.values) }));

  // …but prefer the LIVE state from Tienda Nube when possible: older imports may not have
  // the variant attribute values locally, which are required to recreate a multi-variant product.
  if (creds && src.tiendaNubeId) {
    try {
      const live = await getProductVariants(src.id, creds);
      attributes = JSON.stringify(live.attributes);
      variantData = live.variants.map((v) => ({ price: v.price, promotionalPrice: v.promotionalPrice, stock: v.stock, values: v.values }));
    } catch { /* fall back to local */ }
  }

  const copy = await prisma.product.create({
    data: {
      tiendaNubeId: null,
      name: `${src.name} (copia)`,
      description: src.description,
      price: src.price,
      promotionalPrice: null,
      originalPrice: src.originalPrice,
      seoTitle: src.seoTitle,
      seoDescription: src.seoDescription,
      imageUrl: src.imageUrl,
      categoryId: src.categoryId,
      categoryName: src.categoryName,
      stock: src.stock,
      infiniteStock: src.infiniteStock,
      attributes,
      sku: null,
      published: false,
      tags: src.tags,
      syncStatus: "modified",
      variants: {
        create: variantData.map((v) => ({
          tiendaNubeId: null,
          price: v.price,
          promotionalPrice: v.promotionalPrice ?? null,
          stock: v.stock ?? null,
          sku: null,
          values: JSON.stringify(v.values),
        })),
      },
      categories: {
        create: src.categories.map((pc) => ({ categoryId: pc.categoryId })),
      },
    },
    select: { id: true, name: true },
  });
  return copy;
}
