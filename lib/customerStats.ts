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

  const [agg, current] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, status: { not: "cancelled" } },
      _sum: { total: true },
      _count: true,
      _max: { orderedAt: true },
    }),
    prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, totalSpent: true, orderCount: true, lastOrderAt: true } }),
  ]);
  const byId = new Map(agg.map((r) => [r.customerId, r]));
  const curById = new Map(current.map((c) => [c.id, c]));

  // Escrituras secuenciales (Turso HTTP no soporta $transaction en loops largos), pero
  // solo escribimos los que cambiaron: en un sync típico casi nada cambia, así que esto
  // evita cientos de updates que hacían el pull lento (y lo mataban por timeout en Vercel).
  for (const id of ids) {
    const r = byId.get(id);
    const totalSpent = Math.round((r?._sum.total ?? 0) * 100) / 100;
    const orderCount = r?._count ?? 0;
    const lastOrderAt = r?._max.orderedAt ?? null;
    const cur = curById.get(id);
    const sameLast = (cur?.lastOrderAt?.getTime() ?? null) === (lastOrderAt?.getTime() ?? null);
    if (cur && cur.totalSpent === totalSpent && cur.orderCount === orderCount && sameLast) continue;
    await prisma.customer.update({ where: { id }, data: { totalSpent, orderCount, lastOrderAt } });
  }
}
