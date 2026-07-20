import { prisma } from "./prisma";

export type Scope = "all" | "category" | "tag";
export type DiscountType = "pct" | "fixed";

/** Builds the Prisma where-clause for a campaign's targeting. */
export function targetingWhere(scope: string, scopeValue: string | null) {
  if (scope === "category" && scopeValue) return { categoryName: scopeValue };
  // tags is a JSON array string; match the quoted tag to avoid partial hits.
  if (scope === "tag" && scopeValue) return { tags: { contains: `"${scopeValue}"` } };
  return {};
}

/** Computes the discounted price for a list price. Never goes below 0. */
export function discountedPrice(price: number, type: DiscountType, value: number) {
  const next = type === "pct" ? price * (1 - value / 100) : price - value;
  return Math.max(0, Math.round(next * 100) / 100);
}

function parseTags(json: string): string[] {
  try { return JSON.parse(json); } catch { return []; }
}

function addTag(json: string, tag: string): string {
  const tags = parseTags(json);
  if (!tags.includes(tag)) tags.push(tag);
  return JSON.stringify(tags);
}

function removeTag(json: string, tag: string): string {
  return JSON.stringify(parseTags(json).filter((t) => t !== tag));
}

type CampaignMeta = { addTag: string | null; addCategoryId: number | null };

export type VariantPrice = { variantId: number; campaignPrice: number };
export function parseVariantPrices(json: string): VariantPrice[] {
  try { const a = JSON.parse(json); return Array.isArray(a) ? a.filter((v) => typeof v?.variantId === "number") : []; } catch { return []; }
}

/**
 * Sets a campaign's promo on a product AND its variants. For multi-variant
 * products each variant gets its own price (variantPrices); the product-level
 * promotionalPrice mirrors the lowest-id variant, which is the one the outbound
 * sync makes follow the product. Single-variant products keep the simple path.
 * Promo is only applied when it's actually below the base price.
 */
async function applyPromo(meta: CampaignMeta, productId: number, campaignPrice: number, variantPrices: VariantPrice[]) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { price: true, tags: true, promotionalPrice: true, variants: { orderBy: { id: "asc" }, select: { id: true, price: true } } },
  });
  if (!product) return;

  let productPromo: number;
  if (variantPrices.length && product.variants.length > 1) {
    const vp = new Map(variantPrices.map((v) => [v.variantId, v.campaignPrice]));
    for (const v of product.variants) {
      const cp = vp.get(v.id) ?? campaignPrice;
      await prisma.variant.update({ where: { id: v.id }, data: { promotionalPrice: cp < v.price ? cp : v.price } });
    }
    const first = product.variants[0];
    const cp0 = vp.get(first.id) ?? campaignPrice;
    productPromo = cp0 < first.price ? cp0 : first.price;
  } else {
    productPromo = campaignPrice < product.price ? campaignPrice : product.price;
  }

  // Sequential, not $transaction: batch transactions over the Turso HTTP adapter
  // fail with "unable to start a transaction in the given time" in long loops,
  // and this runs once per product when applying a campaign to hundreds.
  await prisma.product.update({
    where: { id: productId },
    data: { promotionalPrice: productPromo, syncStatus: "modified", ...(meta.addTag ? { tags: addTag(product.tags, meta.addTag) } : {}) },
  });
  await prisma.changelog.create({
    data: { productId, field: "promotionalPrice", oldValue: product.promotionalPrice == null ? null : String(product.promotionalPrice), newValue: String(productPromo) },
  });
  if (meta.addCategoryId) {
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId, categoryId: meta.addCategoryId } },
      update: {}, create: { productId, categoryId: meta.addCategoryId },
    });
  }
}

/**
 * Clears a campaign's promo from a product AND its variants, unless another
 * still-active campaign covers it — then the price is handed over so an
 * overlapping campaign's discount isn't wiped.
 */
async function clearPromo(meta: CampaignMeta, productId: number, campaignId: number, hadVariants: boolean) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { tags: true, promotionalPrice: true, variants: { orderBy: { id: "asc" }, select: { id: true, price: true } } },
  });
  if (!product) return;

  const takeover = await prisma.campaignItem.findFirst({
    where: { productId, campaignId: { not: campaignId }, campaign: { status: "active" } },
    select: { campaignPrice: true, variantPrices: true },
    orderBy: { id: "desc" },
  });

  if (hadVariants && product.variants.length > 1) {
    const overVP = takeover ? new Map(parseVariantPrices(takeover.variantPrices).map((v) => [v.variantId, v.campaignPrice])) : null;
    for (const v of product.variants) {
      const cp = overVP?.get(v.id) ?? (takeover ? takeover.campaignPrice : null);
      await prisma.variant.update({ where: { id: v.id }, data: { promotionalPrice: cp != null ? (cp < v.price ? cp : v.price) : null } });
    }
  }

  const productPromo = takeover ? takeover.campaignPrice : null;
  // Sequential, not $transaction — same Turso-HTTP limitation as in applyPromo.
  // This is the restore-original-price path: it must not die mid-campaign-end.
  await prisma.product.update({
    where: { id: productId },
    data: { promotionalPrice: productPromo, syncStatus: "modified", ...(meta.addTag ? { tags: removeTag(product.tags, meta.addTag) } : {}) },
  });
  await prisma.changelog.create({
    data: { productId, field: "promotionalPrice", oldValue: product.promotionalPrice == null ? null : String(product.promotionalPrice), newValue: productPromo == null ? null : String(productPromo) },
  });
  if (meta.addCategoryId) {
    await prisma.productCategory.deleteMany({ where: { productId, categoryId: meta.addCategoryId } });
  }
}

/**
 * Applies one campaign item to its live product (product + variants). Used both
 * by applyCampaign and by editing an ACTIVE campaign so changes reflect at once.
 */
export async function applyItemToProduct(campaign: CampaignMeta, productId: number, campaignPrice: number, variantPrices: VariantPrice[] = []) {
  await applyPromo(campaign, productId, campaignPrice, variantPrices);
}

/** Reverts one campaign item from its live product: clears the promo, removes tag/category. */
export async function revertItemFromProduct(campaign: CampaignMeta, productId: number, campaignId = -1, hadVariants = false) {
  await clearPromo(campaign, productId, campaignId, hadVariants);
}

/** Simulates a campaign without changing anything. Returns impact figures. */
export async function simulateCampaign(params: {
  scope: string; scopeValue: string | null;
  discountType: DiscountType; discountValue: number;
}) {
  const products = await prisma.product.findMany({
    where: targetingWhere(params.scope, params.scopeValue),
    select: { id: true, price: true, unitsSold: true },
  });

  let sumCurrent = 0;
  let sumNew = 0;
  let totalMarkdown = 0;
  let projectedImpact = 0; // markdown weighted by historical units sold

  for (const p of products) {
    const np = discountedPrice(p.price, params.discountType, params.discountValue);
    sumCurrent += p.price;
    sumNew += np;
    totalMarkdown += p.price - np;
    projectedImpact += (p.price - np) * p.unitsSold;
  }

  const count = products.length;
  return {
    affected: count,
    avgCurrentPrice: count ? Math.round(sumCurrent / count) : 0,
    avgNewPrice: count ? Math.round(sumNew / count) : 0,
    avgDiscountPct: sumCurrent ? Math.round((1 - sumNew / sumCurrent) * 1000) / 10 : 0,
    totalMarkdown: Math.round(totalMarkdown),
    projectedImpact: Math.round(projectedImpact),
  };
}

/**
 * Builds the CampaignItem list for a draft campaign — the editable preview.
 * `productIds` is used for scope "products"; otherwise items come from scope/tag/all.
 * Snapshots each product's base price and defaults the promo price from the discount.
 * Idempotent: clears and rebuilds the campaign's items.
 */
export async function buildCampaignItems(
  campaignId: number,
  productIds?: number[],
  explicitPrices?: Record<number, number>,
  variantPrices?: Record<number, VariantPrice[]>,
) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("Campaña no encontrada");

  const products = productIds && productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, price: true } })
    : await prisma.product.findMany({ where: targetingWhere(c.scope, c.scopeValue), select: { id: true, price: true } });

  await prisma.campaignItem.deleteMany({ where: { campaignId } });
  for (const p of products) {
    const vps = (variantPrices?.[p.id] || []).filter((v) => typeof v?.variantId === "number" && !isNaN(v.campaignPrice));
    // Product-level promo: the wizard's per-product price, else the first variant's, else the discount default.
    const explicit = explicitPrices?.[p.id];
    const promo = explicit != null && !isNaN(explicit)
      ? Math.max(0, Math.round(explicit * 100) / 100)
      : vps.length
        ? Math.max(0, Math.round(vps[0].campaignPrice * 100) / 100)
        : discountedPrice(p.price, c.discountType as DiscountType, c.discountValue);
    await prisma.campaignItem.create({
      data: { campaignId, productId: p.id, originalPrice: p.price, campaignPrice: promo, variantPrices: JSON.stringify(vps) },
    });
  }
  return { count: products.length };
}

/**
 * Applies a campaign: sets each product's PROMOTIONAL price to the (possibly hand-edited)
 * CampaignItem value. The base price is never touched. Adds the campaign tag and marks
 * products modified so they sync to Tienda Nube.
 */
export async function applyCampaign(campaignId: number) {
  const c = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { items: { include: { product: { select: { tags: true, price: true } } } } },
  });
  if (!c) throw new Error("Campaña no encontrada");
  if (c.status !== "draft") throw new Error(c.status === "active" ? "La campaña ya está activa" : "La campaña ya terminó");
  if (c.items.length === 0) throw new Error("La campaña no tiene productos");

  const now = new Date();
  for (const item of c.items) {
    await applyPromo(c, item.productId, item.campaignPrice, parseVariantPrices(item.variantPrices));
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active", appliedAt: now } });
  return { affected: c.items.length };
}

/** Ends a campaign: clears the promotional price (base is untouched), removes the tag. */
export async function endCampaign(campaignId: number) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { items: true } });
  if (!c) throw new Error("Campaña no encontrada");

  for (const item of c.items) {
    await clearPromo(c, item.productId, campaignId, parseVariantPrices(item.variantPrices).length > 0);
  }

  // Keep CampaignItems after ending: they're the historical snapshot analytics need.
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "ended", endedAt: new Date() } });

  return { reverted: c.items.length };
}

/** Returns the product ids affected by a campaign (for post-transition syncing). */
export async function campaignProductIds(campaignId: number): Promise<number[]> {
  const items = await prisma.campaignItem.findMany({
    where: { campaignId },
    select: { productId: true },
  });
  return items.map((i) => i.productId);
}
