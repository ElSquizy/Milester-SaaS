import { prisma } from "./prisma";
import {
  type PricingSettings,
  parsePricingSettings, finalizeSettings, profileForProduct, priceForUsd, tierForProduct,
} from "./pricingCore";

/**
 * Parte SERVER del módulo de precios: config en Settings.pricing (JSON, ahora
 * con PERFILES por colección) y la "importación" que pisa el catálogo.
 *
 * Cada producto se precifica con el perfil de sus colecciones (o el General).
 * Doble vínculo: costUsd → price (base) · costUsdPromo → promotionalPrice.
 * Todo entra staged (syncStatus "modified") — nada toca Tienda Nube sin
 * "Subir cambios". Escrituras secuenciales (Turso HTTP no banca transacciones
 * largas).
 */

export async function getPricingSettings(): Promise<PricingSettings> {
  const s = await prisma.settings.findFirst({ select: { pricing: true } });
  return parsePricingSettings(s?.pricing ?? "{}");
}

export async function savePricingSettings(input: PricingSettings): Promise<PricingSettings> {
  const clean = finalizeSettings({ ...input, dollarUpdatedAt: new Date().toISOString() });
  if (!(clean.dollar >= 0)) throw new Error("Dólar inválido");
  for (const p of clean.profiles) {
    if (p.taxes.some((t) => typeof t.value !== "number" || isNaN(t.value))) throw new Error(`Hay un impuesto inválido en "${p.name}"`);
  }
  const s = await prisma.settings.findFirst({ select: { id: true } });
  if (!s) throw new Error("Configurá la tienda primero");
  await prisma.settings.update({ where: { id: s.id }, data: { pricing: JSON.stringify(clean) } });
  return clean;
}

/** Precio para un costo USD usando el perfil (por colección) y la franja (con scoping) del producto. */
export function priceForProduct(product: { name: string; categoryIds: number[] }, usd: number | null, s: PricingSettings): number | null {
  if (usd == null) return null;
  const profile = profileForProduct(product.categoryIds, s);
  return priceForUsd(usd, profile, product.categoryIds);
}

/* ── Planificación y aplicación ───────────────────────── */

export type ApplyPlanRow = {
  productId: number;
  name: string;
  profileId: string;            // perfil que rige a este producto
  tierId: string | null;        // franja que rige (por su costo base, o el promo)
  newPrice: number | null;      // desde costUsd (null = sin costo base → no se toca price)
  newPromo: number | null;      // desde costUsdPromo (null = limpiar promo)
  changes: boolean;             // difiere de lo que el producto tiene hoy
};

export type ApplyPlan = {
  rows: ApplyPlanRow[];                        // productos con algún costo, fuera de campañas activas de precios
  toChange: number;
  unpositioned: { id: number; name: string }[]; // sin ningún costo cargado
  outOfRange: { id: number; name: string }[];   // costo mayor que la última franja de su perfil
  inActiveCampaign: { id: number; name: string }[]; // ítems de campañas modo "prices" ACTIVAS — excluidos
};

/** Calcula el diff completo tabla→catálogo sin escribir nada. Cada producto por su perfil. */
export async function planApply(s: PricingSettings): Promise<ApplyPlan> {
  // Productos protegidos: pertenecen a una campaña de PRECIOS activa (sistema
  // clásico) — la importación no les pisa la promo viva.
  const activeItems = await prisma.campaignItem.findMany({
    where: { campaign: { status: "active", mode: "prices" } },
    select: { productId: true },
  });
  const protectedIds = new Set(activeItems.map((i) => i.productId));

  const products = await prisma.product.findMany({
    where: { pendingDelete: false },
    select: { id: true, name: true, costUsd: true, costUsdPromo: true, price: true, promotionalPrice: true, categories: { select: { categoryId: true } } },
    orderBy: { id: "asc" },
  });

  const plan: ApplyPlan = { rows: [], toChange: 0, unpositioned: [], outOfRange: [], inActiveCampaign: [] };
  for (const p of products) {
    if (p.costUsd == null && p.costUsdPromo == null) { plan.unpositioned.push({ id: p.id, name: p.name }); continue; }
    if (protectedIds.has(p.id)) { plan.inActiveCampaign.push({ id: p.id, name: p.name }); continue; }
    const catIds = p.categories.map((c) => c.categoryId);
    const profile = profileForProduct(catIds, s);
    const outOfRange = [p.costUsd, p.costUsdPromo].some((c) => c != null && c > 0 && !tierForProduct(profile, c, catIds));
    if (outOfRange) { plan.outOfRange.push({ id: p.id, name: p.name }); continue; }

    const newPrice = p.costUsd != null ? priceForUsd(p.costUsd, profile, catIds) : null;
    const newPromo = p.costUsdPromo != null ? priceForUsd(p.costUsdPromo, profile, catIds) : null;
    const tierId = tierForProduct(profile, p.costUsd ?? p.costUsdPromo ?? 0, catIds)?.id ?? null;
    const changes =
      (newPrice != null && newPrice !== p.price) ||
      (newPromo ?? null) !== (p.promotionalPrice ?? null);
    plan.rows.push({ productId: p.id, name: p.name, profileId: profile.id, tierId, newPrice, newPromo, changes });
    if (changes) plan.toChange++;
  }
  return plan;
}

/**
 * Aplica la tabla a un lote de productos (ids ya filtrados por el plan).
 * Escribe price/originalPrice y promotionalPrice en producto Y TODAS sus
 * variantes (decisión de negocio: el precio de franja rige parejo), marca
 * "modified" y deja Changelog. Devuelve cuántos cambió.
 */
export async function applyPricing(s: PricingSettings, productIds: number[]): Promise<{ changed: number; skipped: number }> {
  let changed = 0, skipped = 0;
  for (const id of productIds) {
    const p = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, costUsd: true, costUsdPromo: true, price: true, promotionalPrice: true, pendingDelete: true, categories: { select: { categoryId: true } } },
    });
    if (!p || p.pendingDelete) { skipped++; continue; }
    const catIds = p.categories.map((c) => c.categoryId);
    const profile = profileForProduct(catIds, s);
    const newPrice = p.costUsd != null ? priceForUsd(p.costUsd, profile, catIds) : null;
    const newPromo = p.costUsdPromo != null ? priceForUsd(p.costUsdPromo, profile, catIds) : null;
    const priceChanges = newPrice != null && newPrice !== p.price;
    const promoChanges = (newPromo ?? null) !== (p.promotionalPrice ?? null);
    if (!priceChanges && !promoChanges) { skipped++; continue; }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        ...(priceChanges ? { price: newPrice!, originalPrice: newPrice! } : {}),
        promotionalPrice: newPromo,
        syncStatus: "modified",
      },
    });
    await prisma.variant.updateMany({
      where: { productId: p.id },
      data: { ...(priceChanges ? { price: newPrice! } : {}), promotionalPrice: newPromo },
    });
    if (priceChanges) {
      await prisma.changelog.create({ data: { productId: p.id, field: "price", oldValue: String(p.price), newValue: String(newPrice) } });
    }
    if (promoChanges) {
      await prisma.changelog.create({
        data: { productId: p.id, field: "promotionalPrice", oldValue: p.promotionalPrice == null ? null : String(p.promotionalPrice), newValue: newPromo == null ? null : String(newPromo) },
      });
    }
    changed++;
  }
  return { changed, skipped };
}
