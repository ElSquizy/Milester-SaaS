import { prisma } from "./prisma";
import { getCategoriesFromTiendaNube, getTiendaNubeClient } from "./tiendanube";

const loc = (f: Record<string, string> | null | undefined): string =>
  f ? (f.es || Object.values(f)[0] || "") : "";

/**
 * Creates a new category (collection) in Tienda Nube — optionally as a subcategory —
 * and mirrors it into the local Category table. Returns the local category id.
 */
export async function createCategoryInTiendaNube(
  storeId: string,
  accessToken: string,
  name: string,
  parentTnId?: string | null
) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const payload: { name: { es: string }; parent?: number } = { name: { es: name.trim() } };
  if (parentTnId && parentTnId !== "0") payload.parent = parseInt(parentTnId, 10);

  const { data } = await client.post("/categories", payload);
  const tnId = String(data.id);
  const row = await prisma.category.upsert({
    where: { tiendaNubeId: tnId },
    update: { name: loc(data.name).trim() || name.trim(), parentTnId: data.parent != null ? String(data.parent) : parentTnId ?? null },
    create: { tiendaNubeId: tnId, name: loc(data.name).trim() || name.trim(), parentTnId: data.parent != null ? String(data.parent) : parentTnId ?? null },
  });
  return { id: row.id, tiendaNubeId: tnId, name: row.name };
}

/** Deletes a collection from Tienda Nube (if it exists there) and locally (cascades links). */
export async function deleteCategoryLocalAndTn(
  categoryId: number,
  creds: { storeId: string; accessToken: string }
) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) throw new Error("Colección no encontrada");
  if (cat.tiendaNubeId && cat.tiendaNubeId !== "0") {
    const client = getTiendaNubeClient(creds.storeId, creds.accessToken);
    try {
      await client.delete(`/categories/${cat.tiendaNubeId}`);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 404) throw err; // 404 = already gone upstream
    }
  }
  await prisma.category.delete({ where: { id: categoryId } });
  return { id: categoryId, name: cat.name };
}

/**
 * Moves a collection under a new parent (or to root when newParentTnId is null/"0"),
 * writing the change to Tienda Nube. Rejects cycles (moving into itself or a descendant).
 */
export async function moveCategory(
  categoryId: number,
  newParentTnId: string | null,
  creds: { storeId: string; accessToken: string }
) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) throw new Error("Colección no encontrada");
  const newParent = newParentTnId && newParentTnId !== "0" ? newParentTnId : null;
  if (newParent === cat.tiendaNubeId) throw new Error("No podés mover una colección dentro de sí misma");

  if (newParent) {
    // Build parent → children map and collect this category's descendants to block cycles.
    const all = await prisma.category.findMany({ select: { tiendaNubeId: true, parentTnId: true } });
    const childrenOf = new Map<string, string[]>();
    for (const c of all) {
      const p = c.parentTnId && c.parentTnId !== "0" ? c.parentTnId : null;
      if (p) { if (!childrenOf.has(p)) childrenOf.set(p, []); childrenOf.get(p)!.push(c.tiendaNubeId); }
    }
    const desc = new Set<string>();
    const stack = [cat.tiendaNubeId];
    while (stack.length) { const t = stack.pop()!; for (const ch of childrenOf.get(t) || []) { if (!desc.has(ch)) { desc.add(ch); stack.push(ch); } } }
    if (desc.has(newParent)) throw new Error("No podés mover una colección dentro de una subcolección suya");
  }

  if (cat.tiendaNubeId && cat.tiendaNubeId !== "0") {
    const client = getTiendaNubeClient(creds.storeId, creds.accessToken);
    // TN's PUT /categories replaces the resource: omitting `name` blanks it. Always resend it.
    await client.put(`/categories/${cat.tiendaNubeId}`, {
      name: { es: cat.name },
      parent: newParent ? parseInt(newParent, 10) : null,
    });
  }
  await prisma.category.update({ where: { id: categoryId }, data: { parentTnId: newParent } });
  return { id: categoryId, parentTnId: newParent };
}

/** Imports the full TN category tree and returns a map of TN id -> local Category id. */
export async function syncCategoryTree(storeId: string, accessToken: string) {
  const tnCats = await getCategoriesFromTiendaNube(storeId, accessToken);
  const map = new Map<string, number>();
  const seen = new Set<string>();

  for (const c of tnCats) {
    const tnId = String(c.id);
    seen.add(tnId);
    const parentTnId = c.parent != null ? String(c.parent) : null;
    const row = await prisma.category.upsert({
      where: { tiendaNubeId: tnId },
      update: { name: loc(c.name).trim(), parentTnId },
      create: { tiendaNubeId: tnId, name: loc(c.name).trim(), parentTnId },
    });
    map.set(tnId, row.id);
  }

  // Prune collections that no longer exist on Tienda Nube (deleted upstream).
  // We only reach this after a full, successful fetch of every page, so an empty
  // result means the store genuinely has no categories — still safe to reconcile.
  const stale = seen.size === 0 ? [] : await prisma.category.findMany({
    where: { tiendaNubeId: { notIn: [...seen] } },
    select: { id: true },
  });
  if (stale.length) {
    // ProductCategory rows cascade-delete with the category (schema onDelete: Cascade).
    await prisma.category.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  return map;
}

/** Replaces a product's category links to match the given TN category ids. */
export async function linkProductCategories(
  productId: number,
  tnCategoryIds: string[],
  tnIdToLocalId: Map<string, number>
) {
  const localIds = tnCategoryIds
    .map((id) => tnIdToLocalId.get(id))
    .filter((x): x is number => x != null);

  // Sequential, not $transaction: Prisma's batch transactions over the Turso
  // HTTP adapter fail with "unable to start a transaction in the given time"
  // when called in long loops (this runs once per product on a full pull).
  // Worst case of the non-atomic window is a product briefly missing links —
  // the next pull re-links it.
  await prisma.productCategory.deleteMany({ where: { productId } });
  if (localIds.length) {
    await prisma.productCategory.createMany({
      data: localIds.map((categoryId) => ({ productId, categoryId })),
    });
  }
}

/** TN tags come as a comma-separated string; store locally as a JSON array. */
export function tagsFromTnString(tags: unknown): string {
  if (typeof tags !== "string") return "[]";
  const arr = tags.split(",").map((t) => t.trim()).filter(Boolean);
  return JSON.stringify(arr);
}

/** Local JSON-array tags -> TN comma-separated string. */
export function tagsToTnString(json: string): string {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.join(",") : "";
  } catch {
    return "";
  }
}
