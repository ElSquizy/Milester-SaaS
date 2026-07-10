import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOneProduct } from "@/lib/sync";
import { renderTemplate } from "@/lib/descriptionTemplates";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: { promotion: true, variants: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, sku, description, price, promotionalPrice, stock, seoTitle, seoDescription, imageUrl, published, tags, categoryIds, descriptionTemplateId, descriptionData, imageTemplateId, productImageUrl } = body;

  const existing = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: { variants: true, promotion: true, categories: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      resolvedDescription = renderTemplate(tmpl.skeleton, descriptionData || {});
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
  // Stock: a non-negative integer means finite stock (turns off "unlimited").
  const normStock = stock === undefined ? undefined : (stock === null || stock === "" || isNaN(Number(stock)) ? null : Math.max(0, Math.round(Number(stock))));
  const stockChanged = normStock !== undefined && existing.stock !== normStock;
  if (stockChanged) changes.push({ field: "stock", oldValue: existing.stock == null ? null : String(existing.stock), newValue: normStock == null ? null : String(normStock) });

  // Categories: compare incoming local ids to existing links.
  let categoriesChanged = false;
  if (Array.isArray(categoryIds)) {
    const existingSet = new Set(existing.categories.map((c) => c.categoryId));
    const incomingSet = new Set<number>(categoryIds);
    categoriesChanged =
      existingSet.size !== incomingSet.size ||
      [...incomingSet].some((cid) => !existingSet.has(cid));
    if (categoriesChanged) {
      changes.push({ field: "categories", oldValue: String(existingSet.size), newValue: String(incomingSet.size) });
    }
  }

  // `sync: true` in the body opts into immediate push to Tienda Nube.
  // Default: save locally only and mark as "modified" (pending sync).
  const syncNow = body.sync === true;
  const hasChanges = changes.length > 0;

  const product = await prisma.product.update({
    where: { id: Number(id) },
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
      ...(normStock !== undefined ? { stock: normStock, ...(normStock != null ? { infiniteStock: false } : {}) } : {}),
      ...(seoTitle !== undefined ? { seoTitle } : {}),
      ...(seoDescription !== undefined ? { seoDescription } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(published !== undefined ? { published } : {}),
      ...(tags !== undefined ? { tags } : {}),
      // Only flip to "modified" if there were real changes and we're not syncing now.
      ...(hasChanges && !syncNow ? { syncStatus: "modified" } : {}),
    },
    include: { variants: true, promotion: true },
  });

  // Keep the first variant's SKU in step with the product (TN stores SKU on the variant).
  if (skuChanged) {
    const firstVariant = [...existing.variants].sort((a, b) => a.id - b.id)[0];
    if (firstVariant) {
      await prisma.variant.update({ where: { id: firstVariant.id }, data: { sku: normSku } });
    }
  }

  // Stock lives on the variant in TN. Only mirror when the product is single-variant
  // (multi-variant stock is managed per variant in the variants manager).
  if (stockChanged && existing.variants.length === 1) {
    await prisma.variant.update({ where: { id: existing.variants[0].id }, data: { stock: normStock } });
  }

  // Replace category links when categoryIds was provided and changed.
  if (categoriesChanged && Array.isArray(categoryIds)) {
    await prisma.$transaction([
      prisma.productCategory.deleteMany({ where: { productId: product.id } }),
      ...categoryIds.map((categoryId: number) =>
        prisma.productCategory.create({ data: { productId: product.id, categoryId } })
      ),
    ]);
  }

  if (hasChanges) {
    await prisma.changelog.createMany({
      data: changes.map((c) => ({ productId: product.id, ...c })),
    });
  }

  if (syncNow) {
    const settings = await prisma.settings.findFirst();
    if (settings?.storeId && settings.accessToken) {
      try {
        await syncOneProduct(product.id, { storeId: settings.storeId, accessToken: settings.accessToken });
        const updated = await prisma.product.findUnique({
          where: { id: product.id },
          include: { variants: true, promotion: true },
        });
        return NextResponse.json(updated);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Sync failed";
        await prisma.product.update({ where: { id: product.id }, data: { syncStatus: "error" } });
        return NextResponse.json({ ...product, syncStatus: "error", syncError: message });
      }
    }
  }

  return NextResponse.json(product);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.product.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
