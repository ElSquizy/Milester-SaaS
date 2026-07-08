import { prisma } from "./prisma";
import { getTiendaNubeClient } from "./tiendanube";
import { mapCustomerFields } from "./orderMap";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fetches customers from Tienda Nube, paginated. Read-only. */
async function fetchAllCustomers(storeId: string, accessToken: string) {
  const client = getTiendaNubeClient(storeId, accessToken);
  const all: any[] = [];
  let page = 1;
  while (true) {
    const { data, headers } = await client.get(`/customers?per_page=200&page=${page}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    const linkHeader: string = headers["link"] || headers["Link"] || "";
    if (!linkHeader.includes('rel="next"')) break;
    page++;
  }
  return all;
}

/**
 * Pulls the full customer list from Tienda Nube and upserts it locally
 * (matched by tiendaNubeId — never duplicates, never wipes local-only customers).
 */
export async function syncCustomersFromTiendaNube(storeId: string, accessToken: string) {
  const tnCustomers = await fetchAllCustomers(storeId, accessToken);
  let created = 0;
  let updated = 0;

  for (const c of tnCustomers) {
    if (!c?.id) continue;
    const tnId = String(c.id);
    const fields = mapCustomerFields(c);
    const base = { name: c.name || "(sin nombre)", email: c.email || null, phone: c.phone || null, ...fields };
    const existing = await prisma.customer.findUnique({ where: { tiendaNubeId: tnId }, select: { id: true } });
    await prisma.customer.upsert({
      where: { tiendaNubeId: tnId },
      update: base,
      create: { tiendaNubeId: tnId, ...base },
    });
    if (existing) updated++; else created++;
  }

  return { scanned: tnCustomers.length, created, updated };
}
