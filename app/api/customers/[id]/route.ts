import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Returns a customer's purchased products (aggregated) and their orders. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = Number(id);

  const orders = await prisma.order.findMany({
    where: { customerId },
    select: {
      id: true, number: true, total: true, status: true, orderedAt: true,
      items: { select: { name: true, quantity: true, price: true, productId: true } },
    },
    orderBy: { orderedAt: "desc" },
  });

  // Aggregate products bought across all orders.
  const productMap = new Map<string, { name: string; qty: number; spent: number; lastDate: string }>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.productId ? `p${it.productId}` : `n:${it.name}`;
      const existing = productMap.get(key);
      const dateStr = o.orderedAt.toISOString();
      if (existing) {
        existing.qty += it.quantity;
        existing.spent += it.price * it.quantity;
        if (dateStr > existing.lastDate) existing.lastDate = dateStr;
      } else {
        productMap.set(key, { name: it.name, qty: it.quantity, spent: it.price * it.quantity, lastDate: dateStr });
      }
    }
  }

  return NextResponse.json({
    products: Array.from(productMap.values()).sort((a, b) => b.qty - a.qty),
    orders: orders.map((o) => ({ id: o.id, number: o.number, total: o.total, status: o.status, orderedAt: o.orderedAt.toISOString() })),
  });
}
