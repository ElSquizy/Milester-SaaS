import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Manual sales ("pedido de bar"): orders taken outside the web store — WhatsApp,
 * Instagram, in person. Tienda Nube only knows about web orders, so without these
 * the sales figures understate reality and those buyers never appear in Clientes.
 *
 * A ticket is a normal Order with source = "local" and no tiendaNubeId. It moves
 * through fulfillmentState: pending_payment → paid → delivered. Nothing is pushed
 * to Tienda Nube in this phase; stock and the TN order come later.
 */

export const FULFILLMENT_STATES = ["pending_payment", "paid", "delivered"] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export const CHANNELS = ["whatsapp", "instagram", "presencial", "otro"] as const;

export type TicketItemInput = {
  productId?: number | null;
  /** Free text for something not in the catalog yet. */
  name?: string;
  quantity?: number;
  price?: number;
};

export type TicketCustomerInput = {
  id?: number | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
};

export type TicketInput = {
  customer?: TicketCustomerInput;
  items: TicketItemInput[];
  paymentReference?: string | null;
  exchangeRate?: number | null;
  channel?: string | null;
  ownerNote?: string | null;
  /** Web order number this ticket corresponds to, so the sale isn't counted twice. */
  linkedOrderNumber?: number | null;
  fulfillmentState?: FulfillmentState;
};

const norm = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
/** Phones are typed inconsistently (+54 9 11…, 011…, spaces, dashes) — compare digits only. */
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Finds existing customers that look like the one being typed, so a manual sale
 * attaches to the real person instead of creating a duplicate. Without this the
 * Clientes panel fills with near-identical rows within weeks.
 */
export async function findCustomerMatches(q: { name?: string; email?: string | null; phone?: string | null }) {
  const email = norm(q.email)?.toLowerCase();
  const phone = digits(q.phone);
  const name = norm(q.name);

  const or: Prisma.CustomerWhereInput[] = [
    ...(email ? [{ email: { contains: email } }] : []),
    // Match on the tail of the number so +54 9 11… and 011… still meet.
    ...(phone.length >= 6 ? [{ phone: { contains: phone.slice(-8) } }] : []),
    ...(name && name.length >= 3 ? [{ name: { contains: name } }] : []),
  ];
  if (or.length === 0) return [];

  // Never suggest an account that was already merged away.
  const where: Prisma.CustomerWhereInput = { mergedIntoId: null, OR: or };

  const rows = await prisma.customer.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true, tiendaNubeId: true, _count: { select: { orders: true } } },
    take: 6,
    orderBy: { updatedAt: "desc" },
  });

  // An exact email or phone hit is the same person; a name hit is only a guess.
  return rows.map((c) => ({
    ...c,
    orderCount: c._count.orders,
    strength: (email && c.email?.toLowerCase() === email) || (phone && digits(c.phone) === phone) ? ("exact" as const) : ("weak" as const),
  }));
}

/** Resolves the ticket's customer: an existing one by id, a match, or a new local record. */
async function resolveCustomer(input?: TicketCustomerInput) {
  if (!input) return null;
  if (input.id) return prisma.customer.findUnique({ where: { id: input.id } });

  const name = norm(input.name);
  const email = norm(input.email);
  const phone = norm(input.phone);
  if (!name && !email && !phone) return null;

  // Reuse an exact match rather than duplicating the person.
  const matches = await findCustomerMatches({ name: name ?? undefined, email, phone });
  const exact = matches.find((m) => m.strength === "exact");
  if (exact) return prisma.customer.findUnique({ where: { id: exact.id } });

  return prisma.customer.create({
    data: { name: name || email || phone || "Sin nombre", email, phone, tiendaNubeId: null },
  });
}

/** Creates a manual ticket. Prices come from the product unless overridden. */
export async function createTicket(input: TicketInput) {
  const items = (input.items || []).filter((i) => i.productId || norm(i.name));
  if (items.length === 0) throw new Error("El pedido no tiene productos");

  const productIds = items.map((i) => i.productId).filter((n): n is number => typeof n === "number");
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, imageUrl: true, price: true, promotionalPrice: true, costUsd: true, tiendaNubeId: true },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((i) => {
    const p = i.productId ? byId.get(i.productId) : undefined;
    const quantity = Math.max(1, Math.round(Number(i.quantity) || 1));
    // The sale price: what was typed, else the active promo, else the base price.
    const price = i.price != null && !isNaN(Number(i.price))
      ? Number(i.price)
      : p ? (p.promotionalPrice ?? p.price) : 0;
    return {
      productId: p?.id ?? null,
      productTnId: p?.tiendaNubeId ?? null,
      name: norm(i.name) || p?.name || "Ítem",
      sku: p?.sku ?? null,
      imageUrl: p?.imageUrl ?? null,
      quantity,
      price,
      // Snapshot the cost so a later change to the product doesn't rewrite history.
      costUsd: p?.costUsd ?? null,
    };
  });

  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const customer = await resolveCustomer(input.customer);

  return prisma.order.create({
    data: {
      tiendaNubeId: null,
      source: "local",
      status: "open",
      total,
      subtotal: total,
      currency: "ARS",
      orderedAt: new Date(),
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? norm(input.customer?.name),
      fulfillmentState: input.fulfillmentState ?? "pending_payment",
      paymentReference: norm(input.paymentReference),
      exchangeRate: input.exchangeRate != null && !isNaN(Number(input.exchangeRate)) ? Number(input.exchangeRate) : null,
      channel: norm(input.channel),
      ownerNote: norm(input.ownerNote),
      number: input.linkedOrderNumber != null && !isNaN(Number(input.linkedOrderNumber)) ? Number(input.linkedOrderNumber) : null,
      items: { create: lines },
    },
    include: { items: true, customer: true },
  });
}

/** Partial edit of a ticket. Replaces the item list when one is given. */
export async function updateTicket(id: number, input: Partial<TicketInput>) {
  const existing = await prisma.order.findUnique({ where: { id }, select: { source: true } });
  if (!existing) throw new Error("Pedido no encontrado");
  if (existing.source !== "local") throw new Error("Solo se pueden editar los pedidos cargados a mano");

  let total: number | undefined;
  if (input.items) {
    const rebuilt = await createLines(input.items);
    total = rebuilt.reduce((s, l) => s + l.price * l.quantity, 0);
    await prisma.orderItem.deleteMany({ where: { orderId: id } });
    await prisma.orderItem.createMany({ data: rebuilt.map((l) => ({ ...l, orderId: id })) });
  }

  const customer = input.customer ? await resolveCustomer(input.customer) : undefined;

  return prisma.order.update({
    where: { id },
    data: {
      ...(total !== undefined ? { total, subtotal: total } : {}),
      ...(customer !== undefined ? { customerId: customer?.id ?? null, customerName: customer?.name ?? null } : {}),
      ...(input.fulfillmentState !== undefined ? { fulfillmentState: input.fulfillmentState } : {}),
      ...(input.paymentReference !== undefined ? { paymentReference: norm(input.paymentReference) } : {}),
      ...(input.exchangeRate !== undefined ? { exchangeRate: input.exchangeRate == null ? null : Number(input.exchangeRate) } : {}),
      ...(input.channel !== undefined ? { channel: norm(input.channel) } : {}),
      ...(input.ownerNote !== undefined ? { ownerNote: norm(input.ownerNote) } : {}),
      ...(input.linkedOrderNumber !== undefined ? { number: input.linkedOrderNumber == null ? null : Number(input.linkedOrderNumber) } : {}),
      // Delivered closes the ticket; anything else reopens it.
      ...(input.fulfillmentState ? { status: input.fulfillmentState === "delivered" ? "closed" : "open" } : {}),
      ...(input.fulfillmentState === "delivered" ? { completedAt: new Date() } : {}),
      ...(input.fulfillmentState === "paid" ? { paidAt: new Date() } : {}),
    },
    include: { items: true, customer: true },
  });
}

async function createLines(items: TicketItemInput[]) {
  const ids = items.map((i) => i.productId).filter((n): n is number => typeof n === "number");
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, sku: true, imageUrl: true, price: true, promotionalPrice: true, costUsd: true, tiendaNubeId: true },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return items
    .filter((i) => i.productId || norm(i.name))
    .map((i) => {
      const p = i.productId ? byId.get(i.productId) : undefined;
      return {
        productId: p?.id ?? null,
        productTnId: p?.tiendaNubeId ?? null,
        name: norm(i.name) || p?.name || "Ítem",
        sku: p?.sku ?? null,
        imageUrl: p?.imageUrl ?? null,
        quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
        price: i.price != null && !isNaN(Number(i.price)) ? Number(i.price) : p ? (p.promotionalPrice ?? p.price) : 0,
        costUsd: p?.costUsd ?? null,
      };
    });
}

export async function deleteTicket(id: number) {
  const existing = await prisma.order.findUnique({ where: { id }, select: { source: true } });
  if (!existing) return;
  if (existing.source !== "local") throw new Error("Solo se pueden borrar los pedidos cargados a mano");
  await prisma.order.delete({ where: { id } });
}

/** Open tickets, newest first — what the Inicio strip shows. */
export function listOpenTickets() {
  return prisma.order.findMany({
    where: { source: "local", fulfillmentState: { in: ["pending_payment", "paid"] } },
    include: { items: true, customer: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { orderedAt: "desc" },
    take: 30,
  });
}
