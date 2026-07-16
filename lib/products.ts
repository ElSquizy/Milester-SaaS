import { prisma } from "./prisma";
import { getProductVariants } from "./variants";
import { renderTemplate } from "./descriptionTemplates";
import { syncOneProduct } from "./sync";
import { getCreds } from "./creds";

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
  let requiresShipping = src.requiresShipping;
  let variantData = (src.variants.length ? src.variants : [{ price: src.price, promotionalPrice: null, stock: src.stock, values: "[]" }])
    .map((v) => ({ price: v.price, promotionalPrice: v.promotionalPrice ?? null, stock: v.stock ?? null, values: parseArr(v.values) }));

  // …but prefer the LIVE state from Tienda Nube when possible: older imports may not have
  // the variant attribute values locally, which are required to recreate a multi-variant product.
  if (creds && src.tiendaNubeId) {
    try {
      const live = await getProductVariants(src.id, creds);
      attributes = JSON.stringify(live.attributes);
      if (live.requiresShipping != null) requiresShipping = live.requiresShipping;
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
      requiresShipping, // keep the product type (Digital/Servicio) on the copy
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

export type UpdateProductInput = {
  name?: string; sku?: string | null; description?: string;
  price?: number; promotionalPrice?: number | string | null;
  stock?: number | string | null; infiniteStock?: boolean;
  seoTitle?: string; seoDescription?: string; imageUrl?: string;
  published?: boolean; tags?: string; categoryIds?: number[];
  descriptionTemplateId?: number | null; descriptionData?: unknown;
  imageTemplateId?: number | null; productImageUrl?: string;
  sync?: boolean;
};

/**
 * Applies a partial edit to a product: resolves a description template, updates
 * fields, mirrors SKU/stock onto the single variant, replaces category links,
 * records a changelog, and marks the product "modified" (or pushes to TN when
 * `sync` is set). Returns { notFound } or the updated product (+ syncError).
 */
export async function updateProduct(idNum: number, body: UpdateProductInput) {
  const { name, sku, description, price, promotionalPrice, stock, infiniteStock, seoTitle, seoDescription, imageUrl, published, tags, categoryIds, descriptionTemplateId, descriptionData, imageTemplateId, productImageUrl } = body;

  const existing = await prisma.product.findUnique({
    where: { id: idNum },
    include: { variants: true, promotion: true, categories: true },
  });
  if (!existing) return { notFound: true as const };

  // Description via template: render the skeleton server-side into `description`.
  // A template id overrides any raw `description` in the body; null detaches it.
  let resolvedDescription: string | undefined = description;
  let tmplId: number | null | undefined;
  let tmplData: string | null | undefined;
  if (descriptionTemplateId === null) {
    tmplId = null;
    tmplData = null;
  } else if (descriptionTemplateId !== undefined) {
    const tmpl = await prisma.descriptionTemplate.findUnique({ where: { id: Number(descriptionTemplateId) } });
    if (tmpl) {
      resolvedDescription = renderTemplate(tmpl.skeleton, (descriptionData as Record<string, string | Array<Record<string, string>>>) || {});
      tmplId = tmpl.id;
      tmplData = JSON.stringify(descriptionData || {});
    }
  }

  const priceChanged = price !== undefined && existing.price !== price;

  // Promotional price: null / "" clears the sale; a number sets it.
  const normPromo = promotionalPrice === undefined
    ? undefined
    : (promotionalPrice === null || promotionalPrice === "" || isNaN(Number(promotionalPrice)) ? null : Number(promotionalPrice));
  const promoChanged = normPromo !== undefined && existing.promotionalPrice !== normPromo;

  // Record changelog
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  if (name !== undefined && existing.name !== name) changes.push({ field: "name", oldValue: existing.name, newValue: name });
  const normSku = sku === undefined ? undefined : (sku?.trim() || null);
  const skuChanged = normSku !== undefined && existing.sku !== normSku;
  if (skuChanged) changes.push({ field: "sku", oldValue: existing.sku, newValue: normSku });
  if (priceChanged && price !== undefined) changes.push({ field: "price", oldValue: String(existing.price), newValue: String(price) });
  if (promoChanged) changes.push({ field: "promotionalPrice", oldValue: existing.promotionalPrice == null ? null : String(existing.promotionalPrice), newValue: normPromo == null ? null : String(normPromo) });
  // Description changes: don't dump the (large) HTML into changelog values.
  if (resolvedDescription !== undefined && existing.description !== resolvedDescription) changes.push({ field: "description", oldValue: null, newValue: null });
  if (published !== undefined && existing.published !== published) changes.push({ field: "published", oldValue: String(existing.published), newValue: String(published) });
  if (tags !== undefined && existing.tags !== tags) changes.push({ field: "tags", oldValue: existing.tags, newValue: tags });
  // Stock: `infiniteStock` toggles unlimited (stock null). A finite number turns it off.
  const normStock = stock === undefined ? undefined : (stock === null || stock === "" || isNaN(Number(stock)) ? null : Math.max(0, Math.round(Number(stock))));
  const newInfinite: boolean | undefined = infiniteStock === undefined ? undefined : !!infiniteStock;
  let effStock: number | null | undefined;
  if (newInfinite === true) effStock = null;
  else if (newInfinite === false) effStock = normStock === undefined ? existing.stock : normStock;
  else effStock = normStock;
  const infiniteChanged = newInfinite !== undefined && existing.infiniteStock !== newInfinite;
  const stockValChanged = effStock !== undefined && existing.stock !== effStock;
  const stockChanged = stockValChanged || infiniteChanged;
  if (stockChanged) changes.push({ field: "stock", oldValue: existing.stock == null ? "∞" : String(existing.stock), newValue: (newInfinite ?? existing.infiniteStock) ? "∞" : String(effStock ?? existing.stock ?? 0) });

  // Categories: compare incoming local ids to existing links.
  let categoriesChanged = false;
  if (Array.isArray(categoryIds)) {
    const existingSet = new Set(existing.categories.map((c) => c.categoryId));
    const incomingSet = new Set<number>(categoryIds);
    categoriesChanged = existingSet.size !== incomingSet.size || [...incomingSet].some((cid) => !existingSet.has(cid));
    if (categoriesChanged) changes.push({ field: "categories", oldValue: String(existingSet.size), newValue: String(incomingSet.size) });
  }

  const syncNow = body.sync === true;
  const hasChanges = changes.length > 0;

  let product = await prisma.product.update({
    where: { id: idNum },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(normSku !== undefined ? { sku: normSku } : {}),
      ...(resolvedDescription !== undefined ? { description: resolvedDescription } : {}),
      ...(tmplId !== undefined ? { descriptionTemplateId: tmplId } : {}),
      ...(tmplData !== undefined ? { descriptionData: tmplData } : {}),
      ...(imageTemplateId !== undefined ? { imageTemplateId: imageTemplateId === null ? null : Number(imageTemplateId) } : {}),
      ...(productImageUrl !== undefined ? { productImageUrl: productImageUrl || null } : {}),
      ...(price !== undefined ? { price, ...(priceChanged && !existing.promotion ? { originalPrice: price } : {}) } : {}),
      ...(normPromo !== undefined ? { promotionalPrice: normPromo } : {}),
      ...(effStock !== undefined ? { stock: effStock } : {}),
      ...(newInfinite !== undefined ? { infiniteStock: newInfinite } : {}),
      ...(seoTitle !== undefined ? { seoTitle } : {}),
      ...(seoDescription !== undefined ? { seoDescription } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(published !== undefined ? { published } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(hasChanges && !syncNow ? { syncStatus: "modified" } : {}),
    },
    include: { variants: true, promotion: true },
  });

  if (skuChanged) {
    const firstVariant = [...existing.variants].sort((a, b) => a.id - b.id)[0];
    if (firstVariant) await prisma.variant.update({ where: { id: firstVariant.id }, data: { sku: normSku } });
  }

  if (stockChanged && existing.variants.length === 1) {
    await prisma.variant.update({ where: { id: existing.variants[0].id }, data: { stock: effStock ?? null } });
  }

  if (categoriesChanged && Array.isArray(categoryIds)) {
    await prisma.$transaction([
      prisma.productCategory.deleteMany({ where: { productId: product.id } }),
      ...categoryIds.map((categoryId: number) => prisma.productCategory.create({ data: { productId: product.id, categoryId } })),
    ]);
  }

  if (hasChanges) {
    await prisma.changelog.createMany({ data: changes.map((c) => ({ productId: product.id, ...c })) });
  }

  if (syncNow) {
    const creds = await getCreds();
    if (creds) {
      try {
        await syncOneProduct(product.id, creds);
        const updated = await prisma.product.findUnique({ where: { id: product.id }, include: { variants: true, promotion: true } });
        if (updated) product = updated;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Sync failed";
        await prisma.product.update({ where: { id: product.id }, data: { syncStatus: "error" } });
        return { product: { ...product, syncStatus: "error" }, syncError: message };
      }
    }
  }

  return { product };
}
