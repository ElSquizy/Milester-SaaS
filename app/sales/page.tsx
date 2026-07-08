import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SalesClient from "./SalesClient";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const status = sp.status || "";
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const openId = sp.order ? parseInt(sp.order, 10) : null;

  const where = {
    ...(q ? { customerName: { contains: q } } : {}),
    ...(status ? { status } : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      select: {
        id: true, number: true, total: true, status: true, paymentStatus: true,
        customerName: true, source: true, orderedAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { orderedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  let openOrder: OpenOrder | null = null;
  if (openId) {
    const raw = await prisma.order.findUnique({
      where: { id: openId },
      include: { items: true, customer: true },
    });
    if (raw) {
      const iso = (d: Date | null) => (d ? d.toISOString() : null);
      openOrder = {
        id: raw.id, number: raw.number, total: raw.total, status: raw.status,
        paymentStatus: raw.paymentStatus, customerName: raw.customerName, source: raw.source,
        orderedAt: raw.orderedAt.toISOString(),
        subtotal: raw.subtotal, discount: raw.discount, shippingCost: raw.shippingCost,
        totalPaid: raw.totalPaid, currency: raw.currency, paymentMethod: raw.paymentMethod,
        shippingStatus: raw.shippingStatus, shippingMethod: raw.shippingMethod, shippingType: raw.shippingType,
        trackingNumber: raw.trackingNumber, trackingUrl: raw.trackingUrl, shippingCarrier: raw.shippingCarrier,
        shippingAddress: raw.shippingAddress,
        paidAt: iso(raw.paidAt), shippedAt: iso(raw.shippedAt), completedAt: iso(raw.completedAt),
        cancelledAt: iso(raw.cancelledAt), closedAt: iso(raw.closedAt),
        customerNote: raw.customerNote, ownerNote: raw.ownerNote, channel: raw.channel,
        customer: raw.customer ? {
          id: raw.customer.id, name: raw.customer.name, email: raw.customer.email,
          phone: raw.customer.phone, identification: raw.customer.identification,
        } : null,
        items: raw.items.map((it) => ({
          id: it.id, name: it.name, quantity: it.quantity, price: it.price,
          productId: it.productId, variantName: it.variantName, sku: it.sku, imageUrl: it.imageUrl,
        })),
      };
    }
  }

  return (
    <SalesClient
      orders={orders.map((o) => ({ ...o, orderedAt: o.orderedAt.toISOString() })) as unknown as Order[]}
      total={total}
      page={page}
      totalPages={Math.ceil(total / PAGE_SIZE)}
      currentQ={q}
      currentStatus={status}
      openOrder={openOrder}
    />
  );
}

export type Order = {
  id: number; number: number | null; total: number; status: string;
  paymentStatus: string | null; customerName: string | null; source: string;
  orderedAt: string; _count: { items: number };
};

export type OpenOrder = {
  id: number; number: number | null; total: number; status: string;
  paymentStatus: string | null; customerName: string | null; source: string; orderedAt: string;
  subtotal: number | null; discount: number | null; shippingCost: number | null;
  totalPaid: number | null; currency: string | null; paymentMethod: string | null;
  shippingStatus: string | null; shippingMethod: string | null; shippingType: string | null;
  trackingNumber: string | null; trackingUrl: string | null; shippingCarrier: string | null;
  shippingAddress: string | null;
  paidAt: string | null; shippedAt: string | null; completedAt: string | null;
  cancelledAt: string | null; closedAt: string | null;
  customerNote: string | null; ownerNote: string | null; channel: string | null;
  customer: { id: number; name: string; email: string | null; phone: string | null; identification: string | null } | null;
  items: { id: number; name: string; quantity: number; price: number; productId: number | null; variantName: string | null; sku: string | null; imageUrl: string | null }[];
};
