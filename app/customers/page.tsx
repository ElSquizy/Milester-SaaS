import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CustomersClient from "./CustomersClient";

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
  const page = Math.max(1, parseInt(sp.page || "1", 10));

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

  const where = {
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    ...(onlyDups ? { id: { in: Array.from(dupCustomerIds) } } : {}),
  };

  const [total, customers, totalsByCustomer] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true,
        identification: true, customerType: true, city: true, province: true,
        _count: { select: { orders: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.groupBy({ by: ["customerId"], _sum: { total: true } }),
  ]);

  const totalMap = new Map(totalsByCustomer.map((t) => [t.customerId, t._sum.total || 0]));

  const list = customers.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    identification: c.identification, customerType: c.customerType,
    city: c.city, province: c.province,
    orderCount: c._count.orders,
    totalSpent: Math.round(totalMap.get(c.id) || 0),
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
    />
  );
}

export type CustomerRow = {
  id: number; name: string; email: string | null; phone: string | null;
  identification: string | null; customerType: string | null;
  city: string | null; province: string | null;
  orderCount: number; totalSpent: number; isDuplicate: boolean; strongDuplicate: boolean;
};
