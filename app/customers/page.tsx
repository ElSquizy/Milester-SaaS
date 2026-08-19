import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CustomersClient from "./CustomersClient";
import { SEGMENTS, type Segment, segmentWhere, segmentOf, dormantCutoff } from "@/lib/customerSegments";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

function normName(s: string) {
  return s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const onlyDups = sp.dups === "1";
  const sort = sp.sort || "name";
  const segment = (SEGMENTS as readonly string[]).includes(sp.segment || "") ? (sp.segment as Segment) : "";
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const cutoff = dormantCutoff();

  // Detect potential duplicates across ALL customers.
  // DNI/CUIT (identification) is the strongest signal; email and normalized name are softer fallbacks.
  const all = await prisma.customer.findMany({
    select: { id: true, name: true, email: true, identification: true },
    where: { mergedIntoId: null },
  });
  const idCount = new Map<string, number>();
  const emailCount = new Map<string, number>();
  const nameCount = new Map<string, number>();
  const normId = (s: string) => s.replace(/[^0-9kK]/g, "");
  for (const c of all) {
    const id = c.identification ? normId(c.identification) : "";
    if (id) idCount.set(id, (idCount.get(id) || 0) + 1);
    if (c.email) emailCount.set(c.email.toLowerCase(), (emailCount.get(c.email.toLowerCase()) || 0) + 1);
    const n = normName(c.name);
    if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
  }
  // Strong = same DNI; weak = same email or same normalized name.
  const dupCustomerIds = new Set<number>();
  const strongDupIds = new Set<number>();
  for (const c of all) {
    const id = c.identification ? normId(c.identification) : "";
    const e = c.email?.toLowerCase();
    const n = normName(c.name);
    const strong = !!id && (idCount.get(id) || 0) > 1;
    const weak = (!!e && (emailCount.get(e) || 0) > 1) || (!!n && (nameCount.get(n) || 0) > 1);
    if (strong) strongDupIds.add(c.id);
    if (strong || weak) dupCustomerIds.add(c.id);
  }

  // Filtros base (búsqueda + duplicados) — compartidos por la lista y los conteos por segmento.
  const baseWhere: Prisma.CustomerWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    ...(onlyDups ? { id: { in: Array.from(dupCustomerIds) } } : {}),
  };
  const where: Prisma.CustomerWhereInput = { ...baseWhere, ...(segment ? segmentWhere(segment, cutoff) : {}) };

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sort === "ltv" ? { totalSpent: "desc" }
    : sort === "recent" ? { lastOrderAt: { sort: "desc", nulls: "last" } }
    : sort === "frequency" ? { orderCount: "desc" }
    : { name: "asc" };

  // Stats denormalizadas (Fase 0): sin groupBy de toda la tabla Order por carga.
  const [total, customers, segmentCounts] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, phoneE164: true,
        identification: true, customerType: true, city: true, province: true,
        totalSpent: true, orderCount: true, lastOrderAt: true,
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Conteo por segmento sobre el filtro base (para los chips).
    Promise.all(SEGMENTS.map((s) => prisma.customer.count({ where: { ...baseWhere, ...segmentWhere(s, cutoff) } })))
      .then((counts) => Object.fromEntries(SEGMENTS.map((s, i) => [s, counts[i]])) as Record<Segment, number>),
  ]);

  const list = customers.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, phoneE164: c.phoneE164,
    identification: c.identification, customerType: c.customerType,
    city: c.city, province: c.province,
    orderCount: c.orderCount,
    totalSpent: Math.round(c.totalSpent),
    lastOrderAt: c.lastOrderAt ? c.lastOrderAt.toISOString() : null,
    segment: segmentOf({ orderCount: c.orderCount, totalSpent: c.totalSpent, lastOrderAt: c.lastOrderAt }, cutoff),
    isDuplicate: dupCustomerIds.has(c.id),
    strongDuplicate: strongDupIds.has(c.id),
  }));

  return (
    <CustomersClient
      customers={list}
      total={total}
      page={page}
      totalPages={Math.ceil(total / PAGE_SIZE)}
      currentQ={q}
      onlyDups={onlyDups}
      dupTotal={dupCustomerIds.size}
      currentSort={sort}
      currentSegment={segment}
      segmentCounts={segmentCounts}
    />
  );
}

export type CustomerRow = {
  id: number; name: string; email: string | null; phone: string | null; phoneE164: string | null;
  identification: string | null; customerType: string | null;
  city: string | null; province: string | null;
  orderCount: number; totalSpent: number; lastOrderAt: string | null; segment: Segment;
  isDuplicate: boolean; strongDuplicate: boolean;
};
