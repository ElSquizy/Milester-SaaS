import { prisma } from "./prisma";
import { getTiendaNubeClient } from "./tiendanube";

/* eslint-disable @typescript-eslint/no-explicit-any */

const loc = (f: any): string => (f ? (f.es || Object.values(f)[0] || "") : "");

export type VariantDTO = {
  tiendaNubeId: string | null;
  values: string[];
  price: number;
  promotionalPrice: number | null;
  stock: number | null;
  sku: string | null;
};
type Creds = { storeId: string; accessToken: string };

/**
 * Returns a product's variants + attribute names. Reads LIVE from Tienda Nube when
 * connected (always accurate), otherwise falls back to the local mirror.
 */
export async function getProductVariants(productId: number, creds?: Creds) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: "asc" } } },
  });
  if (!product) throw new Error("Producto no encontrado");

  if (creds && product.tiendaNubeId) {
    const client = getTiendaNubeClient(creds.storeId, creds.accessToken);
    const { data } = await client.get(`/products/${product.tiendaNubeId}`);
    const attributes: string[] = (data.attributes || []).map(loc);
    const variants: VariantDTO[] = (data.variants || []).map((v: any) => ({
      tiendaNubeId: String(v.id),
      values: (v.values || []).map(loc),
      price: parseFloat(v.price || "0"),
      promotionalPrice: v.promotional_price != null ? parseFloat(v.promotional_price) : null,
      stock: v.stock ?? null,
      sku: v.sku ?? null,
    }));
    // requires_shipping comes straight from TN so a duplicate keeps the product
    // type (false = Digital/Servicio) even before a pull has recorded it.
    return { attributes, variants, tiendaNubeId: product.tiendaNubeId, requiresShipping: data.requires_shipping ?? null };
  }

  const attributes: string[] = JSON.parse(product.attributes || "[]");
  const variants: VariantDTO[] = product.variants.map((v) => ({
    tiendaNubeId: v.tiendaNubeId,
    values: JSON.parse(v.values || "[]"),
    price: v.price,
    promotionalPrice: v.promotionalPrice,
    stock: v.stock,
    sku: v.sku,
  }));
  return { attributes, variants, tiendaNubeId: product.tiendaNubeId, requiresShipping: product.requiresShipping };
}

type ApplyPayload = {
  attributes: string[];
  attributesChanged?: boolean;
  // Only variants that changed or are new need to be sent; untouched ones are left as-is.
  variants: { tiendaNubeId?: string | null; values: string[]; price: number; promotionalPrice: number | null; stock: number | null; sku: string | null }[];
  deleted: string[]; // tiendaNubeIds to delete
};

/**
 * Applies a product's full desired variant state to Tienda Nube and mirrors it locally:
 * sets attributes, deletes removed variants, updates existing ones, and creates new ones.
 */
export async function applyProductVariants(productId: number, creds: Creds, payload: ApplyPayload) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Producto no encontrado");

  const tnId = product.tiendaNubeId;
  const client = tnId ? getTiendaNubeClient(creds.storeId, creds.accessToken) : null;
  const attrs = (payload.attributes || []).map((a) => a.trim()).filter(Boolean);
  const hasAttrs = attrs.length > 0;

  // 1. Attributes first (required before variants can carry values). Only when they changed.
  if (client && tnId && hasAttrs && payload.attributesChanged) {
    await client.put(`/products/${tnId}`, { attributes: attrs.map((a) => ({ es: a })) });
  }

  // 2. Deletions.
  for (const delTnId of payload.deleted) {
    if (client && tnId && delTnId) {
      try { await client.delete(`/products/${tnId}/variants/${delTnId}`); }
      catch (e: any) { if (e?.response?.status !== 404) throw e; }
    }
    if (delTnId) await prisma.variant.deleteMany({ where: { productId, tiendaNubeId: delTnId } });
  }

  // 3. Update existing + create new.
  for (const v of payload.variants) {
    const values = hasAttrs ? v.values.map((x) => ({ es: (x || "").trim() || "-" })) : undefined;
    // TN clears a variant's sale only with an empty string; a number sets it.
    const promoStr = v.promotionalPrice != null ? String(v.promotionalPrice) : "";
    // Unlimited stock in TN is stock_management:false — stock:null alone isn't enough.
    const body: any = { price: String(v.price), promotional_price: promoStr, stock_management: v.stock != null, stock: v.stock ?? null, sku: v.sku ?? null, ...(values ? { values } : {}) };

    if (v.tiendaNubeId) {
      if (client && tnId) await client.put(`/products/${tnId}/variants/${v.tiendaNubeId}`, body);
      await prisma.variant.updateMany({
        where: { productId, tiendaNubeId: v.tiendaNubeId },
        data: { price: v.price, promotionalPrice: v.promotionalPrice, stock: v.stock ?? null, sku: v.sku ?? null, values: JSON.stringify(v.values) },
      });
    } else {
      let newTnId: string | null = null;
      if (client && tnId) {
        const { data } = await client.post(`/products/${tnId}/variants`, body);
        newTnId = String(data.id);
      }
      await prisma.variant.create({
        data: { productId, tiendaNubeId: newTnId, price: v.price, promotionalPrice: v.promotionalPrice, stock: v.stock ?? null, sku: v.sku ?? null, values: JSON.stringify(v.values) },
      });
    }
    await new Promise((r) => setTimeout(r, 250)); // gentle with TN's rate limit
  }

  // 4. Reconcile product-level fields (base price/stock follow the first variant).
  const locals = await prisma.variant.findMany({ where: { productId }, orderBy: { id: "asc" } });
  const anyNull = locals.some((v) => v.stock == null);
  const sumStock = locals.reduce((s, v) => s + (v.stock ?? 0), 0);
  const first = locals[0];
  await prisma.product.update({
    where: { id: productId },
    data: {
      attributes: JSON.stringify(attrs),
      infiniteStock: anyNull,
      stock: sumStock,
      ...(first ? { price: first.price, promotionalPrice: first.promotionalPrice } : {}),
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    },
  });

  return getProductVariants(productId, creds);
}
