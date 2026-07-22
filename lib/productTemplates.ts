import { prisma } from "./prisma";
import { renderTemplate, parseFields, emptyData, type TemplateData } from "./descriptionTemplates";

/**
 * "Crear producto por plantilla": una ProductTemplate define versiones
 * comerciales (PS4, PS5, Secundaria…) y la herencia común (colecciones, tags,
 * plantillas de descripción/imagen). El wizard del catálogo genera un producto
 * STAGED independiente por versión seleccionada — mismo patrón que
 * duplicateProduct/confirmSplit: tiendaNubeId null, oculto, syncStatus
 * "modified"; la creación real en Tienda Nube va por el push normal.
 *
 * Las versiones son datos (JSON), no código: agregar plataformas nuevas no
 * requiere tocar la arquitectura.
 */

export const NAME_TOKEN_BASE = "{nombre_base}";

export type TemplateVersion = {
  key: string;        // identificador estable dentro de la plantilla ("ps4")
  label: string;      // "PS4"
  namePattern: string; // "{nombre_base} [PS4]"
  skuSuffix: string;  // "PS4" → SKU final "BASE-PS4"; vacío = usa el base tal cual
  // Configuración PROPIA de la versión (cada una elige la suya; null/[] = nada):
  descriptionTemplateId: number | null;
  imageTemplateId: number | null;
  categoryIds: number[];
};

export function parseVersions(json: string): TemplateVersion[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v) => v && typeof v === "object" && typeof v.key === "string" && v.key.trim())
      .map((v) => ({
        key: String(v.key).trim(),
        label: String(v.label ?? v.key).trim(),
        namePattern: String(v.namePattern || `${NAME_TOKEN_BASE} [${String(v.label ?? v.key).trim()}]`),
        skuSuffix: String(v.skuSuffix ?? "").trim(),
        descriptionTemplateId: v.descriptionTemplateId != null && !isNaN(Number(v.descriptionTemplateId)) ? Number(v.descriptionTemplateId) : null,
        imageTemplateId: v.imageTemplateId != null && !isNaN(Number(v.imageTemplateId)) ? Number(v.imageTemplateId) : null,
        categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds.map(Number).filter((n: number) => !isNaN(n)) : [],
      }));
  } catch {
    return [];
  }
}

export function buildVersionName(pattern: string, baseName: string) {
  return pattern.replaceAll(NAME_TOKEN_BASE, baseName).replace(/\s+/g, " ").trim();
}

export function buildVersionSku(baseSku: string, suffix: string) {
  const base = baseSku.trim();
  return suffix ? `${base}-${suffix}` : base;
}

/** Valida el shape de las versiones al guardar una plantilla. */
export function validateVersions(versions: TemplateVersion[]): string | null {
  if (versions.length === 0) return "La plantilla necesita al menos una versión";
  const keys = new Set<string>();
  for (const v of versions) {
    if (!v.label) return "Toda versión necesita un nombre";
    if (!v.namePattern.includes(NAME_TOKEN_BASE)) {
      return `El patrón de "${v.label}" debe incluir ${NAME_TOKEN_BASE}`;
    }
    if (keys.has(v.key)) return `Versión repetida: ${v.label}`;
    keys.add(v.key);
  }
  const suffixes = versions.map((v) => v.skuSuffix.toUpperCase());
  if (new Set(suffixes).size !== suffixes.length) {
    return "Dos versiones tienen el mismo sufijo de SKU — los SKU generados chocarían entre sí";
  }
  return null;
}

/* ── Generación ───────────────────────────────────────── */

export type BuildInput = {
  templateId: number;
  versionKeys: string[];
  baseName: string;
  baseSku: string;
  productImageUrl?: string | null;
};

export type PlannedProduct = {
  versionKey: string;
  versionLabel: string;
  name: string;
  sku: string;
  /** Conflictos BLOQUEANTES de SKU (dentro del lote o contra el catálogo). */
  skuConflict: string | null;
  /** Aviso no bloqueante: ya existe un producto con este nombre. */
  nameExists: boolean;
};

/**
 * Calcula los productos que se generarían y sus conflictos, sin escribir nada.
 * El paso de confirmación del wizard usa esto para mostrar la tabla en vivo.
 */
export async function previewFromTemplate(input: BuildInput): Promise<{ planned: PlannedProduct[]; blocked: boolean; error?: string }> {
  const tpl = await prisma.productTemplate.findUnique({ where: { id: input.templateId } });
  if (!tpl) return { planned: [], blocked: true, error: "Plantilla no encontrada" };

  const all = parseVersions(tpl.versions);
  const chosen = all.filter((v) => input.versionKeys.includes(v.key));
  if (chosen.length === 0) return { planned: [], blocked: true, error: "Seleccioná al menos una versión" };

  const baseName = input.baseName.trim();
  const baseSku = input.baseSku.trim();
  if (!baseName) return { planned: [], blocked: true, error: "El Nombre Base no puede estar vacío" };
  if (!baseSku) return { planned: [], blocked: true, error: "El SKU Base no puede estar vacío" };

  const planned = chosen.map((v) => ({
    versionKey: v.key,
    versionLabel: v.label,
    name: buildVersionName(v.namePattern, baseName),
    sku: buildVersionSku(baseSku, v.skuSuffix),
    skuConflict: null as string | null,
    nameExists: false,
  }));

  // Duplicados dentro del propio lote.
  const seen = new Map<string, string>();
  for (const p of planned) {
    const k = p.sku.toUpperCase();
    if (seen.has(k)) p.skuConflict = `Mismo SKU que la versión ${seen.get(k)}`;
    else seen.set(k, p.versionLabel);
  }

  // Contra el catálogo (Product.sku y Variant.sku — no hay constraint en DB).
  const skus = planned.map((p) => p.sku);
  const [prodHits, varHits, nameHits] = await Promise.all([
    prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true, name: true } }),
    prisma.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true, product: { select: { name: true } } } }),
    prisma.product.findMany({ where: { name: { in: planned.map((p) => p.name) } }, select: { name: true } }),
  ]);
  const taken = new Map<string, string>();
  for (const h of prodHits) if (h.sku) taken.set(h.sku.toUpperCase(), h.name);
  for (const h of varHits) if (h.sku && !taken.has(h.sku.toUpperCase())) taken.set(h.sku.toUpperCase(), h.product.name);
  const existingNames = new Set(nameHits.map((n) => n.name));
  for (const p of planned) {
    if (!p.skuConflict && taken.has(p.sku.toUpperCase())) {
      p.skuConflict = `Ya lo usa "${taken.get(p.sku.toUpperCase())}"`;
    }
    p.nameExists = existingNames.has(p.name);
  }

  return { planned, blocked: planned.some((p) => p.skuConflict) };
}

/**
 * Crea un producto staged por versión seleccionada. Todo-o-nada frente a
 * conflictos de SKU: si hay alguno, no se crea NINGÚN producto (el doc exige
 * poder corregir antes de crear). Escrituras secuenciales (Turso HTTP no
 * soporta transacciones largas).
 */
export async function buildFromTemplate(input: BuildInput): Promise<
  | { ok: true; created: { id: number; name: string; sku: string }[] }
  | { ok: false; error: string; planned?: PlannedProduct[] }
> {
  const preview = await previewFromTemplate(input);
  if (preview.error) return { ok: false, error: preview.error };
  if (preview.blocked) {
    return { ok: false, error: "Hay conflictos de SKU — corregí el SKU Base o las versiones", planned: preview.planned };
  }

  const tpl = (await prisma.productTemplate.findUnique({ where: { id: input.templateId } }))!;
  const versionByKey = new Map(parseVersions(tpl.versions).map((v) => [v.key, v]));
  const tags: string[] = (() => { try { return JSON.parse(tpl.tags) as string[]; } catch { return []; } })();

  // Cache de plantillas de descripción por id (varias versiones pueden compartir).
  const descTplCache = new Map<number, Awaited<ReturnType<typeof prisma.descriptionTemplate.findUnique>>>();
  const getDescTpl = async (id: number | null) => {
    if (!id) return null;
    if (!descTplCache.has(id)) descTplCache.set(id, await prisma.descriptionTemplate.findUnique({ where: { id } }));
    return descTplCache.get(id) ?? null;
  };

  const productImageUrl = input.productImageUrl?.trim() || null;
  const created: { id: number; name: string; sku: string }[] = [];
  for (const p of preview.planned) {
    const v = versionByKey.get(p.versionKey);
    // Configuración PROPIA de la versión; los campos a nivel plantilla quedan
    // como fallback para plantillas guardadas antes de este cambio.
    const versionCatIds = v?.categoryIds.length
      ? v.categoryIds
      : (() => { try { return JSON.parse(tpl.categoryIds) as number[]; } catch { return []; } })();
    // Colecciones que ya no existen en el espejo no deben romper el create.
    const validCatIds = versionCatIds.length
      ? (await prisma.category.findMany({ where: { id: { in: versionCatIds } }, select: { id: true } })).map((c) => c.id)
      : [];
    const imageTemplateId = v?.imageTemplateId ?? tpl.imageTemplateId;

    // Descripción inicial: renderizada desde la plantilla de descripción de LA
    // VERSIÓN (si tiene). El campo con bind:"name" arranca con el nombre
    // generado — igual que hace el editor del catálogo.
    const descTpl = await getDescTpl(v?.descriptionTemplateId ?? tpl.descriptionTemplateId);
    let description: string | null = null;
    let descriptionData: TemplateData | null = null;
    if (descTpl) {
      const fields = parseFields(descTpl.fields);
      descriptionData = emptyData(fields);
      for (const f of fields) if (f.type === "text" && f.bind === "name") descriptionData[f.key] = p.name;
      description = renderTemplate(descTpl.skeleton, descriptionData);
    }

    const child = await prisma.product.create({
      data: {
        tiendaNubeId: null,
        name: p.name,
        sku: p.sku,
        description,
        descriptionTemplateId: descTpl?.id ?? null,
        descriptionData: descriptionData ? JSON.stringify(descriptionData) : null,
        imageTemplateId,
        productImageUrl,
        // El push le sube su propia imagen (compuesta con la plantilla si hay).
        imageDirty: !!(productImageUrl || imageTemplateId),
        tags: JSON.stringify(tags),
        // La info individual (costo, precios, stock…) se completa después en el
        // editor del catálogo — arranca neutra.
        price: 0,
        originalPrice: 0,
        promotionalPrice: null,
        stock: null,
        infiniteStock: true,
        attributes: "[]",
        published: false, // nacen ocultos; se revisan antes de publicar
        syncStatus: "modified", // entran a la cola de "Subir cambios"
        variants: { create: [{ tiendaNubeId: null, price: 0, promotionalPrice: null, stock: null, sku: p.sku, values: "[]" }] },
        categories: { create: validCatIds.map((categoryId) => ({ categoryId })) },
      },
      select: { id: true },
    });
    created.push({ id: child.id, name: p.name, sku: p.sku });
  }

  return { ok: true, created };
}
