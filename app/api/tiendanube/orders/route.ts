import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreds } from "@/lib/creds";
import { importOrdersFromTiendaNube, type TiendaNubeOrder } from "@/lib/tiendanube";
import { mapOrderFields, mapCustomerFields, mapItemFields } from "@/lib/orderMap";

/** GET: stream import of all Tienda Nube orders, then recompute product sales aggregates. */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const creds = await getCreds();
        if (!creds) {
          send({ status: "error", message: "Conectá tu tienda primero (Configuración)" });
          controller.close();
          return;
        }

        send({ status: "fetching", message: "Conectando con Tienda Nube..." });

        const orders: TiendaNubeOrder[] = await importOrdersFromTiendaNube(
          creds.storeId,
          creds.accessToken,
          (count) => send({ status: "fetching", message: `${count} órdenes descargadas...`, fetched: count })
        );

        send({ status: "fetching", message: `${orders.length} órdenes. Guardando...`, total: orders.length });

        // Map TN product ids → local product ids for matching order items.
        const localProducts = await prisma.product.findMany({
          where: { tiendaNubeId: { not: null } },
          select: { id: true, tiendaNubeId: true },
        });
        const tnToLocal = new Map(localProducts.map((p) => [p.tiendaNubeId!, p.id]));

        // Wipe and re-import (orders are immutable history; simplest correct sync).
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});

        const BATCH = 100;
        let saved = 0;
        const customerCache = new Map<string, number>();

        for (let i = 0; i < orders.length; i += BATCH) {
          const batch = orders.slice(i, i + BATCH);

          for (const o of batch) {
            const items = (o.products || []).map((p) => ({
              productTnId: p.product_id ? String(p.product_id) : null,
              productId: p.product_id ? tnToLocal.get(String(p.product_id)) ?? null : null,
              name: p.name,
              quantity: typeof p.quantity === "string" ? parseInt(p.quantity, 10) || 0 : p.quantity,
              price: parseFloat(p.price || "0"),
              ...mapItemFields(p),
            }));

            // Upsert the customer (TN account) with enriched fields.
            let customerId: number | null = null;
            const c = o.customer;
            if (c?.id) {
              const tnCid = String(c.id);
              customerId = customerCache.get(tnCid) ?? null;
              const fields = mapCustomerFields(c);
              if (!customerId) {
                const row = await prisma.customer.upsert({
                  where: { tiendaNubeId: tnCid },
                  update: { name: c.name || "(sin nombre)", email: c.email || null, phone: c.phone || null, ...fields },
                  create: { tiendaNubeId: tnCid, name: c.name || "(sin nombre)", email: c.email || null, phone: c.phone || null, ...fields },
                });
                customerId = row.id;
                customerCache.set(tnCid, customerId);
              }
            }

            await prisma.order.create({
              data: {
                tiendaNubeId: String(o.id),
                number: o.number ?? null,
                total: parseFloat(o.total || "0"),
                status: o.status,
                paymentStatus: o.payment_status ?? null,
                customerName: o.customer?.name ?? o.contact_name ?? null,
                customerId,
                source: "tiendanube",
                orderedAt: new Date(o.created_at),
                ...mapOrderFields(o),
                items: { create: items },
              },
            });
            saved++;
          }

          send({ status: "progress", saved, total: orders.length });
        }

        // Recompute per-product sales aggregates from non-cancelled orders.
        send({ status: "aggregating", message: "Calculando métricas de ventas..." });

        const agg = await prisma.orderItem.groupBy({
          by: ["productId"],
          where: { productId: { not: null }, order: { status: { not: "cancelled" } } },
          _sum: { quantity: true },
        });

        // Reset all aggregates, then apply.
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
            data: {
              unitsSold: row._sum.quantity ?? 0,
              lastSoldAt: last?.order.orderedAt ?? null,
            },
          });
        }

        send({ status: "done", total: orders.length, saved, productsWithSales: agg.length });
      } catch (err) {
        send({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** POST: return order count + last import date. */
export async function POST() {
  const [count, latest] = await Promise.all([
    prisma.order.count(),
    prisma.order.findFirst({ orderBy: { orderedAt: "desc" }, select: { orderedAt: true } }),
  ]);
  return NextResponse.json({ count, latestOrder: latest?.orderedAt ?? null });
}
