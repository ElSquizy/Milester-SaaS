import { prisma } from "./prisma";
import { fetchProductsUpdatedSince } from "./tiendanube";
import { mapOrderFields, mapCustomerFields, mapItemFields } from "./orderMap";
import { getTiendaNubeClient } from "./tiendanube";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fetches orders updated since a date (or all if omitted). Read-only. */
async function fetchOrdersUpdatedSince(storeId: string, accessToken: string, sinceISO?: string) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const all: any[] = [];
  let page = 1;
  const filter = sinceISO ? `&updated_at_min=${encodeURIComponent(sinceISO)}` : "";
  while (true) {
    const { data, headers } = await client.get(`/orders?per_page=200&page=${page}${filter}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }
  return all;
}

/**
 * Incrementally pulls orders changed on Tienda Nube since the last sync.
 * Upserts orders + customers (never wipes), then recomputes sales aggregates.
 * Returns counts of new vs updated orders.
 */
export async function syncOrdersIncremental(storeId: string, accessToken: string) {
  const settings = await prisma.settings.findFirst();
  const scanStart = new Date();

  // Baseline: last sync, else the newest order we have, else a 30-day lookback.
  const BUFFER_MS = 10 * 60 * 1000;
  let sinceDate: Date | null = settings?.lastOrderSyncAt ?? null;
  if (!sinceDate) {
    const newest = await prisma.order.findFirst({ orderBy: { orderedAt: "desc" }, select: { orderedAt: true } });
    sinceDate = newest ? newest.orderedAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  const since = new Date(sinceDate.getTime() - BUFFER_MS).toISOString();

  const tnOrders = await fetchOrdersUpdatedSince(storeId, accessToken, since);

  // Map TN product ids -> local ids for order-item linking.
  const localProducts = await prisma.product.findMany({
    where: { tiendaNubeId: { not: null } },
    select: { id: true, tiendaNubeId: true },
  });
  const tnToLocal = new Map(localProducts.map((p) => [p.tiendaNubeId!, p.id]));
  const customerCache = new Map<string, number>();

  let created = 0;
  let updated = 0;

  for (const o of tnOrders) {
    const tnId = String(o.id);

    // Customer upsert
    let customerId: number | null = null;
    const c = o.customer;
    if (c?.id) {
      const tnCid = String(c.id);
      customerId = customerCache.get(tnCid) ?? null;
      if (!customerId) {
        const fields = mapCustomerFields(c);
        const row = await prisma.customer.upsert({
          where: { tiendaNubeId: tnCid },
          update: { name: c.name || "(sin nombre)", email: c.email || null, phone: c.phone || null, ...fields },
          create: { tiendaNubeId: tnCid, name: c.name || "(sin nombre)", email: c.email || null, phone: c.phone || null, ...fields },
        });
        customerId = row.id;
        customerCache.set(tnCid, customerId);
      }
    }

    const items = (o.products || []).map((p: any) => ({
      productTnId: p.product_id ? String(p.product_id) : null,
      productId: p.product_id ? tnToLocal.get(String(p.product_id)) ?? null : null,
      name: p.name,
      quantity: typeof p.quantity === "string" ? parseInt(p.quantity, 10) || 0 : p.quantity,
      price: parseFloat(p.price || "0"),
      ...mapItemFields(p),
    }));

    const orderData = {
      number: o.number ?? null,
      total: parseFloat(o.total || "0"),
      status: o.status,
      paymentStatus: o.payment_status ?? null,
      customerName: o.customer?.name ?? o.contact_name ?? null,
      customerId,
      source: "tiendanube",
      orderedAt: new Date(o.created_at),
      ...mapOrderFields(o),
    };

    const existing = await prisma.order.findUnique({ where: { tiendaNubeId: tnId }, select: { id: true } });
    if (existing) {
      await prisma.$transaction([
        prisma.orderItem.deleteMany({ where: { orderId: existing.id } }),
        prisma.order.update({
          where: { id: existing.id },
          data: { ...orderData, items: { create: items } },
        }),
      ]);
      updated++;
    } else {
      await prisma.order.create({
        data: { tiendaNubeId: tnId, ...orderData, items: { create: items } },
      });
      created++;
    }
  }

  // Recompute per-product sales aggregates if anything changed.
  if (created + updated > 0) {
    const agg = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { status: { not: "cancelled" } } },
      _sum: { quantity: true },
    });
    await prisma.product.updateMany({ data: { unitsSold: 0, lastSoldAt: null } });
    for (const row of agg) {
      if (row.productId == null) continue;
      const last = await prisma.orderItem.findFirst({
        where: { productId: row.productId, order: { status: { not: "cancelled" } } },
        orderBy: { order: { orderedAt: "desc" } },
        select: { order: { select: { orderedAt: true } } },
      });
      await prisma.product.update({
        where: { id: row.productId },
        data: { unitsSold: row._sum.quantity ?? 0, lastSoldAt: last?.order.orderedAt ?? null },
      });
    }
  }

  if (settings) {
    await prisma.settings.update({ where: { id: settings.id }, data: { lastOrderSyncAt: scanStart } });
  }

  return { scanned: tnOrders.length, created, updated };
}
