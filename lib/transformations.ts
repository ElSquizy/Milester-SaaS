import { prisma } from "./prisma";
import { getProductVariants } from "./variants";
import { renderTemplate } from "./descriptionTemplates";

/** Common data shared by every variant of one source product (editable per group). */
export type CommonData = {
  descriptionTemplateId: number | null;
  descriptionData: Record<string, unknown> | null;
  imageTemplateId: number | null;
  productImageUrl: string | null;
  categoryIds: number[];
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
};

function parseCommon(json: string): CommonData {
  try {
    const c = JSON.parse(json) as Partial<CommonData>;
    return {
      descriptionTemplateId: c.descriptionTemplateId ?? null,
      descriptionData: c.descriptionData ?? null,
      imageTemplateId: c.imageTemplateId ?? null,
      productImageUrl: c.productImageUrl ?? null,
      categoryIds: Array.isArray(c.categoryIds) ? c.categoryIds : [],
      tags: Array.isArray(c.tags) ? c.tags : [],
      seoTitle: c.seoTitle ?? null,
      seoDescription: c.seoDescription ?? null,
    };
  } catch {
    return { descriptionTemplateId: null, descriptionData: null, imageTemplateId: null, productImageUrl: null, categoryIds: [], tags: [], seoTitle: null, seoDescription: null };
  }
}

/**
 * "Dividir producto por variantes": turns a multi-variant product into one
 * independent product per variant.
 *
 * The flow is deliberately non-destructive:
 *   preview (DRAFT job + editable items) → review/edit → confirm.
 * Confirm creates LOCAL products staged as `syncStatus="modified"` — the actual
 * creation on Tienda Nube goes through the app's normal push ("Subir cambios"),
 * which already provides batching, retry of failures and the post-sync recap.
 * The ORIGINAL product is left untouched (decided in review); the children are
 * born hidden (published: false).
 */

export const NAME_TOKEN_PRODUCT = "{nombre_producto}";
export const NAME_TOKEN_VARIANT = "{nombre_variante}";
export const DEFAULT_NAME_RULE = `${NAME_TOKEN_PRODUCT} - ${NAME_TOKEN_VARIANT}`;

export type ItemIssue = { level: "warning" | "error"; code: string; message: string };

export function buildName(rule: string, productName: string, variantLabel: string) {
  return rule
    .replaceAll(NAME_TOKEN_PRODUCT, productName)
    .replaceAll(NAME_TOKEN_VARIANT, variantLabel)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates a DRAFT job: one item per variant of each selected product, seeded
 * from the parent (common data) and the variant (specific data). Uses the LIVE
 * variant state from TN when credentials are available — older imports may lack
 * the attribute values locally, and those labels are what the names are built
 * from.
 */
export async function previewSplit(
  productIds: number[],
  nameRule: string,
  creds?: { storeId: string; accessToken: string },
) {
  const rule = nameRule?.trim() || DEFAULT_NAME_RULE;
  if (!rule.includes(NAME_TOKEN_VARIANT)) {
    throw new Error(`La regla del nombre debe incluir ${NAME_TOKEN_VARIANT} — sin eso todos los productos saldrían iguales`);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { variants: { orderBy: { id: "asc" } }, categories: true },
  });
  if (products.length === 0) throw new Error("No se encontraron los productos seleccionados");

  const job = await prisma.transformationJob.create({
    data: { type: "split-variants", nameRule: rule },
  });

  for (const p of products) {
    // Common data snapshot from the parent — the starting point the group editor
    // can override; applies to every variant of this product.
    const common: CommonData = {
      descriptionTemplateId: p.descriptionTemplateId,
      descriptionData: (() => { try { return p.descriptionData ? JSON.parse(p.descriptionData) : null; } catch { return null; } })(),
      imageTemplateId: p.imageTemplateId,
      productImageUrl: p.productImageUrl,
      categoryIds: p.categories.map((c) => c.categoryId),
      tags: (() => { try { return JSON.parse(p.tags || "[]"); } catch { return []; } })(),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
    };
    const commonJson = JSON.stringify(common);

    // Live-first variant data (labels, price, stock, sku); local fallback.
    let variants: Array<{ localId: number | null; label: string; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null }>;
    try {
      const live = await getProductVariants(p.id, creds);
      const byTn = new Map(p.variants.filter((v) => v.tiendaNubeId).map((v) => [v.tiendaNubeId!, v.id]));
      variants = live.variants.map((v, i) => ({
        localId: (v.tiendaNubeId ? byTn.get(String(v.tiendaNubeId)) : undefined) ?? p.variants[i]?.id ?? null,
        label: (v.values || []).filter(Boolean).join(" ") || "",
        price: v.price,
        promotionalPrice: v.promotionalPrice,
        stock: v.stock,
        sku: v.sku,
      }));
    } catch {
      variants = p.variants.map((v) => ({
        localId: v.id,
        label: (JSON.parse(v.values || "[]") as string[]).filter(Boolean).join(" ") || "",
        price: v.price,
        promotionalPrice: v.promotionalPrice,
        stock: v.stock,
        sku: v.sku,
      }));
    }

    if (variants.length < 2) {
      // Selection UI should prevent this, but a product can change between
      // selecting and previewing — record it as an error item so the review
      // shows WHY nothing came out of this product.
      await prisma.transformationItem.create({
        data: {
          jobId: job.id, sourceProductId: p.id, sourceName: p.name,
          variantLabel: "", name: p.name, price: p.price, stock: p.stock,
          commonData: commonJson,
          status: "error",
          issues: JSON.stringify([{ level: "error", code: "no-variants", message: "El producto no tiene variantes suficientes para dividirse" }]),
        },
      });
      continue;
    }

    for (const [i, v] of variants.entries()) {
      const label = v.label || `Variante ${i + 1}`;
      await prisma.transformationItem.create({
        data: {
          jobId: job.id,
          sourceProductId: p.id,
          sourceName: p.name,
          sourceVariantId: v.localId,
          variantLabel: label,
          name: buildName(rule, p.name, label),
          price: v.price,
          promotionalPrice: v.promotionalPrice,
          stock: v.stock,
          sku: v.sku,
          commonData: commonJson,
          ...(v.label ? {} : {
            status: "warning",
            issues: JSON.stringify([{ level: "warning", code: "no-label", message: "La variante no tiene nombre — se usó un número. Revisá el nombre generado." }]),
          }),
        },
      });
    }
  }

  await validateJob(job.id);
  return getJob(job.id);
}

/** Re-runs every validation over the job's items and updates their status. */
export async function validateJob(jobId: number) {
  const items = await prisma.transformationItem.findMany({ where: { jobId } });
  const active = items.filter((i) => i.status !== "skipped" && i.status !== "created");

  // SKU duplicates: inside the job and against the catalog.
  const skuCount = new Map<string, number>();
  for (const it of active) {
    const sku = it.sku?.trim();
    if (sku) skuCount.set(sku, (skuCount.get(sku) ?? 0) + 1);
  }
  const skus = [...skuCount.keys()];
  const existingSkus = skus.length
    ? new Set((await prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((p) => p.sku!))
    : new Set<string>();

  // Same-name products already in the catalog (mirror ≈ Tienda Nube).
  const names = active.map((i) => i.name.trim()).filter(Boolean);
  const existingNames = names.length
    ? new Set((await prisma.product.findMany({ where: { name: { in: names } }, select: { name: true } })).map((p) => p.name))
    : new Set<string>();

  for (const it of active) {
    const issues: ItemIssue[] = [];
    const prevIssues: ItemIssue[] = JSON.parse(it.issues || "[]");
    // Keep non-recomputable issues (like no-variants / no-label context notes).
    issues.push(...prevIssues.filter((x) => x.code === "no-variants" || x.code === "no-label"));

    if (!it.name.trim()) issues.push({ level: "error", code: "empty-name", message: "El nombre no puede estar vacío" });
    if (!(it.price > 0) && it.price !== 0) issues.push({ level: "error", code: "bad-price", message: "El precio no es válido" });
    if (it.price === 0) issues.push({ level: "warning", code: "zero-price", message: "El precio es $0" });
    if (it.stock != null && (it.stock < 0 || !Number.isInteger(it.stock))) issues.push({ level: "error", code: "bad-stock", message: "El stock no es un número válido" });
    if (it.promotionalPrice != null && it.promotionalPrice >= it.price) issues.push({ level: "warning", code: "promo-gte-base", message: "El promocional no es menor que el precio base" });

    const sku = it.sku?.trim();
    if (sku && (skuCount.get(sku) ?? 0) > 1) issues.push({ level: "warning", code: "sku-dup-job", message: "SKU repetido dentro de esta transformación" });
    if (sku && existingSkus.has(sku)) issues.push({ level: "warning", code: "sku-dup-catalog", message: "Ya existe un producto con este SKU en el catálogo" });

    if (existingNames.has(it.name.trim())) {
      issues.push({ level: "warning", code: "name-exists", message: `Ya existe un producto llamado "${it.name.trim()}"` });
    }

    const hasError = issues.some((x) => x.level === "error");
    const wasEdited = it.status === "edited";
    const status = hasError ? "error" : wasEdited ? "edited" : issues.length ? "warning" : "ready";
    await prisma.transformationItem.update({ where: { id: it.id }, data: { issues: JSON.stringify(issues), status } });
  }
}

export function getJob(jobId: number) {
  return prisma.transformationJob.findUnique({
    where: { id: jobId },
    include: { items: { orderBy: [{ sourceProductId: "asc" }, { id: "asc" }] } },
  });
}

/** Applies a manual edit to one item, then revalidates the whole job. */
export async function editItem(
  jobId: number,
  itemId: number,
  patch: { name?: string; price?: number; promotionalPrice?: number | null; stock?: number | null; sku?: string | null; skipped?: boolean; duplicateAction?: "create" | "skip" | null },
) {
  const item = await prisma.transformationItem.findFirst({ where: { id: itemId, jobId } });
  if (!item) throw new Error("Ítem no encontrado");
  const job = await prisma.transformationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "draft") throw new Error("La transformación ya no es editable");

  const fieldPatch = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.price !== undefined ? { price: Number(patch.price) } : {}),
    ...(patch.promotionalPrice !== undefined ? { promotionalPrice: patch.promotionalPrice == null ? null : Number(patch.promotionalPrice) } : {}),
    ...(patch.stock !== undefined ? { stock: patch.stock == null ? null : Math.round(Number(patch.stock)) } : {}),
    ...(patch.sku !== undefined ? { sku: patch.sku?.trim() || null } : {}),
  };
  const touchedFields = Object.keys(fieldPatch).length > 0;

  await prisma.transformationItem.update({
    where: { id: item.id },
    data: {
      ...fieldPatch,
      ...(patch.duplicateAction !== undefined ? { duplicateAction: patch.duplicateAction } : {}),
      ...(patch.skipped === true ? { status: "skipped" } : {}),
      // Un-skipping or editing puts it back through validation as an edit.
      ...(patch.skipped === false || (touchedFields && item.status !== "skipped") ? { status: "edited" } : {}),
    },
  });
  await validateJob(jobId);
  return getJob(jobId);
}

/**
 * Edits the COMMON data of every variant of one source product at once — the
 * "modificar todos los componentes a la vez" the review UI exposes: description
 * template, image template, collections, tags, SEO. Writes the same JSON to
 * every not-yet-created item in the group.
 */
export async function editGroup(jobId: number, sourceProductId: number, common: Partial<CommonData>) {
  const job = await prisma.transformationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "draft") throw new Error("La transformación ya no es editable");

  const items = await prisma.transformationItem.findMany({
    where: { jobId, sourceProductId, targetProductId: null },
  });
  if (items.length === 0) return getJob(jobId);

  // Merge the patch into the group's current common data (all items share it).
  const merged = { ...parseCommon(items[0].commonData), ...common };
  const json = JSON.stringify(merged);
  await prisma.transformationItem.updateMany({
    where: { jobId, sourceProductId, targetProductId: null },
    data: { commonData: json },
  });
  // A common-data change is a manual edit; reflect it on non-error items.
  await prisma.transformationItem.updateMany({
    where: { jobId, sourceProductId, targetProductId: null, status: { in: ["ready", "warning"] } },
    data: { status: "edited" },
  });
  await validateJob(jobId);
  return getJob(jobId);
}

/**
 * Confirms the job: creates one LOCAL staged product per non-skipped item.
 * Items with unresolved errors block the whole confirm (the UI surfaces them).
 * Items whose name already exists require an explicit duplicateAction.
 * Re-running confirm only processes items not yet created — that's the retry.
 */
export async function confirmSplit(jobId: number) {
  const job = await getJob(jobId);
  if (!job) throw new Error("Transformación no encontrada");

  const pending = job.items.filter((i) => i.status !== "skipped" && !i.targetProductId);
  if (pending.length === 0) throw new Error("No hay productos para crear");

  const blocking = pending.filter((i) => i.status === "error");
  if (blocking.length) throw new Error(`Hay ${blocking.length} producto(s) con errores sin resolver`);

  const undecidedDup = pending.filter((i) =>
    (JSON.parse(i.issues || "[]") as ItemIssue[]).some((x) => x.code === "name-exists") && !i.duplicateAction);
  if (undecidedDup.length) throw new Error(`Decidí qué hacer con ${undecidedDup.length} duplicado(s): crear igualmente u omitir`);

  let created = 0;
  let failed = 0;
  for (const it of pending) {
    const dup = (JSON.parse(it.issues || "[]") as ItemIssue[]).some((x) => x.code === "name-exists");
    if (dup && it.duplicateAction === "skip") {
      await prisma.transformationItem.update({ where: { id: it.id }, data: { status: "skipped" } });
      continue;
    }
    const parent = await prisma.product.findUnique({
      where: { id: it.sourceProductId },
      include: { categories: true },
    });
    if (!parent) {
      failed++;
      await prisma.transformationItem.update({
        where: { id: it.id },
        data: { status: "error", issues: JSON.stringify([{ level: "error", code: "source-gone", message: "El producto original ya no existe" }]) },
      });
      continue;
    }
    try {
      // Common data: the group's edited values (falling back to the parent for
      // anything not overridden). A chosen description template is rendered now,
      // exactly like the catalog's edit does.
      const c = parseCommon(it.commonData);
      let description = parent.description;
      if (c.descriptionTemplateId) {
        const tmpl = await prisma.descriptionTemplate.findUnique({ where: { id: c.descriptionTemplateId } });
        if (tmpl) description = renderTemplate(tmpl.skeleton, (c.descriptionData as Record<string, string | Array<Record<string, string>>>) || {});
      }
      const catIds = c.categoryIds.length ? c.categoryIds : parent.categories.map((pc) => pc.categoryId);
      const imageTemplateId = c.imageTemplateId;
      const productImageUrl = c.productImageUrl;

      const child = await prisma.product.create({
        data: {
          tiendaNubeId: null,
          name: it.name.trim(),
          // Common data (group-edited, parent as fallback):
          description,
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
          tags: JSON.stringify(c.tags),
          categoryId: parent.categoryId,
          categoryName: parent.categoryName,
          requiresShipping: parent.requiresShipping,
          costUsd: parent.costUsd,
          descriptionTemplateId: c.descriptionTemplateId,
          descriptionData: c.descriptionData ? JSON.stringify(c.descriptionData) : null,
          // Image: shows the parent's picture right away; imageDirty makes the
          // push upload the child its OWN copy, composed with the chosen template.
          imageUrl: parent.imageUrl,
          productImageUrl,
          imageTemplateId,
          imageDirty: !!(productImageUrl || parent.imageUrl || imageTemplateId),
          // Variant-specific data:
          price: it.price,
          promotionalPrice: it.promotionalPrice,
          originalPrice: it.price,
          stock: it.stock,
          infiniteStock: it.stock == null, // TN honours unlimited stock at CREATE
          sku: it.sku?.trim() || null,
          attributes: "[]",
          published: false, // children are born hidden (reviewed decision)
          syncStatus: "modified", // joins the push queue — TN creation via "Subir cambios"
          variants: { create: [{ tiendaNubeId: null, price: it.price, promotionalPrice: it.promotionalPrice, stock: it.stock, sku: it.sku?.trim() || null, values: "[]" }] },
          categories: { create: catIds.map((categoryId) => ({ categoryId })) },
        },
        select: { id: true },
      });
      await prisma.transformationItem.update({ where: { id: it.id }, data: { targetProductId: child.id, status: "created" } });
      created++;
    } catch (e) {
      failed++;
      await prisma.transformationItem.update({
        where: { id: it.id },
        data: { status: "error", issues: JSON.stringify([{ level: "error", code: "create-failed", message: e instanceof Error ? e.message : "No se pudo crear" }]) },
      });
    }
  }

  const remaining = await prisma.transformationItem.count({ where: { jobId, status: { notIn: ["created", "skipped"] } } });
  await prisma.transformationJob.update({
    where: { id: jobId },
    data: {
      status: remaining === 0 ? "completed" : "partial",
      confirmedAt: job.confirmedAt ?? new Date(),
      ...(remaining === 0 ? { completedAt: new Date() } : {}),
    },
  });

  return { created, failed, skipped: pending.length - created - failed, job: await getJob(jobId) };
}

export async function deleteJob(jobId: number) {
  const job = await prisma.transformationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status !== "draft") throw new Error("Solo se pueden descartar borradores — los completados son el registro de la operación");
  await prisma.transformationJob.delete({ where: { id: jobId } });
}

export function listJobs() {
  return prisma.transformationJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { items: true } } },
  });
}
