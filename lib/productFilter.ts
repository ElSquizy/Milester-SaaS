import { Prisma } from "@prisma/client";

/**
 * Construye el where-clause del catálogo a partir de los query params (q,
 * status, category, flag, focus). Compartido por la página del catálogo y el
 * endpoint /api/products/ids ("seleccionar todo el filtro") para que ambos
 * filtren idéntico.
 *
 * Filtros tri-estado: cada param es un CSV de "+valor" (incluir) / "-valor"
 * (excluir); un valor pelado cuenta como incluir (compat con links viejos).
 */
export type CatalogFilterParams = {
  q?: string;
  status?: string;
  category?: string;
  flag?: string;
  focus?: string;
};

function parseTri(param: string) {
  const inc: string[] = [], exc: string[] = [];
  for (const raw of (param || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.startsWith("-")) exc.push(raw.slice(1));
    else inc.push(raw.startsWith("+") ? raw.slice(1) : raw);
  }
  return { inc, exc };
}

const statusCond = (v: string): Prisma.ProductWhereInput | null =>
  v === "published" ? { published: true }
  : v === "hidden" ? { published: false }
  : v === "synced" ? { syncStatus: "synced" }
  : v === "modified" ? { syncStatus: "modified" }
  : v === "error" ? { syncStatus: "error" } : null;

const flagCond = (v: string, staleDate: Date): Prisma.ProductWhereInput | null =>
  v === "no-image" ? { imageUrl: null }
  : v === "no-category" ? { categoryName: null }
  : v === "no-stock" ? { stock: { lte: 0 }, infiniteStock: false }
  : v === "no-sku" ? { sku: null }
  : v === "stale" ? { AND: [{ OR: [{ stock: { gt: 0 } }, { infiniteStock: true }] }, { OR: [{ lastSoldAt: null }, { lastSoldAt: { lt: staleDate } }] }] } : null;

export function buildProductWhere(p: CatalogFilterParams): Prisma.ProductWhereInput {
  const q = p.q?.trim() || "";
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 60);

  const AND: Prisma.ProductWhereInput[] = [];
  if (q) AND.push({ OR: [{ name: { contains: q } }, { sku: { contains: q } }] });

  const st = parseTri(p.status || "");
  const stInc = st.inc.map(statusCond).filter((c): c is Prisma.ProductWhereInput => c != null);
  if (stInc.length) AND.push({ OR: stInc });
  for (const v of st.exc) { const c = statusCond(v); if (c) AND.push({ NOT: c }); }

  const col = parseTri(p.category || "");
  if (col.inc.length) AND.push({ categories: { some: { category: { name: { in: col.inc } } } } });
  if (col.exc.length) AND.push({ NOT: { categories: { some: { category: { name: { in: col.exc } } } } } });

  const fl = parseTri(p.flag || "");
  for (const v of fl.inc) { const c = flagCond(v, staleDate); if (c) AND.push(c); }
  for (const v of fl.exc) { const c = flagCond(v, staleDate); if (c) AND.push({ NOT: c }); }

  const focusIds = (p.focus || "").split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  if (focusIds.length) AND.push({ id: { in: focusIds } });

  return AND.length ? { AND } : {};
}
