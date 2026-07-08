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

/**
 * Applies one campaign item to its live product: sets the promotional price (only if below
 * base), adds the campaign tag/category, marks it modified. Used both by applyCampaign and
 * by editing an ACTIVE campaign so changes reflect immediately.
 */
export async function applyItemToProduct(campaign: CampaignMeta, productId: number, campaignPrice: number) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { price: true, tags: true, promotionalPrice: true } });
  if (!product) return;
  const promo = campaignPrice < product.price ? campaignPrice : product.price;
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { promotionalPrice: promo, syncStatus: "modified", ...(campaign.addTag ? { tags: addTag(product.tags, campaign.addTag) } : {}) },
    }),
    prisma.changelog.create({
      data: { productId, field: "promotionalPrice", oldValue: product.promotionalPrice == null ? null : String(product.promotionalPrice), newValue: String(promo) },
    }),
  ]);
  if (campaign.addCategoryId) {
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId, categoryId: campaign.addCategoryId } },
      update: {}, create: { productId, categoryId: campaign.addCategoryId },
    });
  }
}

/** Reverts one campaign item from its live product: clears the promo, removes tag/category. */
export async function revertItemFromProduct(campaign: CampaignMeta, productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { tags: true, promotionalPrice: true } });
  if (!product) return;
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { promotionalPrice: null, syncStatus: "modified", ...(campaign.addTag ? { tags: removeTag(product.tags, campaign.addTag) } : {}) },
    }),
    prisma.changelog.create({
      data: { productId, field: "promotionalPrice", oldValue: product.promotionalPrice == null ? null : String(product.promotionalPrice), newValue: null },
    }),
  ]);
  if (campaign.addCategoryId) {
    await prisma.productCategory.deleteMany({ where: { productId, categoryId: campaign.addCategoryId } });
  }
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
) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error("Campaña no encontrada");

  const products = productIds && productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, price: true } })
    : await prisma.product.findMany({ where: targetingWhere(c.scope, c.scopeValue), select: { id: true, price: true } });

  await prisma.campaignItem.deleteMany({ where: { campaignId } });
  for (const p of products) {
    // Prefer the per-product price the user set in the wizard; else default from the discount.
    const explicit = explicitPrices?.[p.id];
    const promo = explicit != null && !isNaN(explicit)
      ? Math.max(0, Math.round(explicit * 100) / 100)
      : discountedPrice(p.price, c.discountType as DiscountType, c.discountValue);
    await prisma.campaignItem.create({
      data: { campaignId, productId: p.id, originalPrice: p.price, campaignPrice: promo },
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
    // Only apply when the promo price is actually below the base price.
    const promo = item.campaignPrice < item.product.price ? item.campaignPrice : item.product.price;
    await prisma.$transaction([
      prisma.product.update({
        where: { id: item.productId },
        data: {
          promotionalPrice: promo,
          syncStatus: "modified",
          ...(c.addTag ? { tags: addTag(item.product.tags, c.addTag) } : {}),
        },
      }),
      prisma.changelog.create({
        data: { productId: item.productId, field: "promotionalPrice", oldValue: null, newValue: String(promo) },
      }),
    ]);
    // Add the campaign's category to the product (if any), avoiding duplicates.
    if (c.addCategoryId) {
      await prisma.productCategory.upsert({
        where: { productId_categoryId: { productId: item.productId, categoryId: c.addCategoryId } },
        update: {},
        create: { productId: item.productId, categoryId: c.addCategoryId },
      });
    }
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active", appliedAt: now } });
  return { affected: c.items.length };
}

/** Ends a campaign: clears the promotional price (base is untouched), removes the tag. */
export async function endCampaign(campaignId: number) {
  const c = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { items: { include: { product: { select: { tags: true, promotionalPrice: true } } } } },
  });
  if (!c) throw new Error("Campaña no encontrada");

  for (const item of c.items) {
    await prisma.$transaction([
      prisma.product.update({
        where: { id: item.productId },
        data: {
          promotionalPrice: null,
          syncStatus: "modified",
          ...(c.addTag ? { tags: removeTag(item.product.tags, c.addTag) } : {}),
        },
      }),
      prisma.changelog.create({
        data: { productId: item.productId, field: "promotionalPrice", oldValue: String(item.campaignPrice), newValue: null },
      }),
    ]);
    // Remove the campaign's category from the product (products leave the collection).
    if (c.addCategoryId) {
      await prisma.productCategory.deleteMany({ where: { productId: item.productId, categoryId: c.addCategoryId } });
    }
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
