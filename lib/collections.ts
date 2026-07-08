import { prisma } from "./prisma";
import { getTiendaNubeClient } from "./tiendanube";
import { createCategoryInTiendaNube } from "./categories";

export type CollectionProduct = {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  promotionalPrice: number | null;
  imageUrl: string | null;
};

/** Products currently linked to a collection (local mirror of TN membership). */
export async function getCollectionProducts(categoryId: number): Promise<CollectionProduct[]> {
  const rows = await prisma.productCategory.findMany({
    where: { categoryId },
    select: {
      product: { select: { id: true, name: true, sku: true, price: true, promotionalPrice: true, imageUrl: true } },
    },
    orderBy: { product: { name: "asc" } },
  });
  return rows.map((r) => r.product);
}

/**
 * Adds/removes products from a collection, writing the change to Tienda Nube.
 * For each affected product we send its full new category-id set (TN's product PUT
 * replaces the whole `categories` list), then update the local ProductCategory mirror.
 * Rate-limited to stay under TN's limits; per-product failures are counted, not thrown.
 */
export async function setCollectionMembership(
  categoryId: number,
  addIds: number[],
  removeIds: number[],
  creds: { storeId: string; accessToken: string },
) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) throw new Error("Colección no encontrada");
  const targetTn = parseInt(cat.tiendaNubeId, 10);
  if (isNaN(targetTn)) throw new Error("La colección no está sincronizada con Tienda Nube");

  const client = getTiendaNubeClient(creds.storeId, creds.accessToken);
  const work = [
    ...addIds.map((id) => ({ id, add: true })),
    ...removeIds.map((id) => ({ id, add: false })),
  ];

  let added = 0;
  let removed = 0;
  let errors = 0;

  for (const { id, add } of work) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        tiendaNubeId: true,
        categories: { select: { category: { select: { tiendaNubeId: true } } } },
      },
    });
    if (!product?.tiendaNubeId) { errors++; continue; }

    const current = new Set(
      product.categories
        .map((pc) => parseInt(pc.category.tiendaNubeId, 10))
        .filter((n) => !isNaN(n)),
    );
    if (add) current.add(targetTn);
    else current.delete(targetTn);

    try {
      await client.put(`/products/${product.tiendaNubeId}`, { categories: [...current] });
      if (add) {
        await prisma.productCategory.upsert({
          where: { productId_categoryId: { productId: id, categoryId } },
          update: {},
          create: { productId: id, categoryId },
        });
        added++;
      } else {
        await prisma.productCategory.deleteMany({ where: { productId: id, categoryId } });
        removed++;
      }
    } catch {
      errors++;
    }
    // Be gentle with Tienda Nube's rate limit on bulk edits.
    await new Promise((r) => setTimeout(r, 350));
  }

  return { added, removed, errors };
}

/**
 * Duplicates a collection: creates "{name} (copia)" in Tienda Nube (same parent) and
 * copies the original's product membership into it. Returns the new collection + counts.
 */
export async function duplicateCollection(
  categoryId: number,
  creds: { storeId: string; accessToken: string }
) {
  const src = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!src) throw new Error("Colección no encontrada");

  const copy = await createCategoryInTiendaNube(creds.storeId, creds.accessToken, `${src.name} (copia)`, src.parentTnId);

  const links = await prisma.productCategory.findMany({ where: { categoryId }, select: { productId: true } });
  const ids = links.map((l) => l.productId);
  const membership = ids.length ? await setCollectionMembership(copy.id, ids, [], creds) : { added: 0, removed: 0, errors: 0 };

  return { id: copy.id, name: copy.name, products: membership.added, errors: membership.errors };
}
