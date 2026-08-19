import { prisma } from "./prisma";

/**
 * Recomputa las stats denormalizadas del cliente — `totalSpent`, `orderCount`,
 * `lastOrderAt` — desde la tabla Order, excluyendo pedidos cancelados. Incluye
 * tanto los web (tiendanube) como los manuales (local).
 *
 * Se llama con los clientes AFECTADOS por un cambio (sync de ventas o alta/edición
 * de un ticket manual), no sobre toda la tabla. Escrituras secuenciales: el
 * adaptador HTTP de Turso falla con $transaction en loops largos.
 */
export async function recomputeCustomerStats(customerIds: number | null | undefined | Array<number | null | undefined>): Promise<void> {
  const ids = [...new Set(
    (Array.isArray(customerIds) ? customerIds : [customerIds]).filter((n): n is number => typeof n === "number"),
  )];
  if (ids.length === 0) return;

  const agg = await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: ids }, status: { not: "cancelled" } },
    _sum: { total: true },
    _count: true,
    _max: { orderedAt: true },
  });
  const byId = new Map(agg.map((r) => [r.customerId, r]));

  for (const id of ids) {
    const r = byId.get(id);
    await prisma.customer.update({
      where: { id },
      data: {
        totalSpent: Math.round((r?._sum.total ?? 0) * 100) / 100,
        orderCount: r?._count ?? 0,
        lastOrderAt: r?._max.orderedAt ?? null,
      },
    });
  }
}
