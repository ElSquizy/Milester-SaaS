import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import CatalogShell from "./CatalogShell";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const status = sp.status || "";
  const category = sp.category || "";
  const flag = sp.flag || "";
  const sort = sp.sort || "recent";
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const editId = sp.edit ? parseInt(sp.edit, 10) : null;

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 60);

  // Tri-state filters: each param is a CSV of "+value" (include) / "-value" (exclude).
  // A bare value counts as include, so old dashboard links (?flag=no-stock) keep working.
  const parseTri = (param: string) => {
    const inc: string[] = [], exc: string[] = [];
    for (const raw of param.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (raw.startsWith("-")) exc.push(raw.slice(1));
      else inc.push(raw.startsWith("+") ? raw.slice(1) : raw);
    }
    return { inc, exc };
  };
  const statusCond = (v: string): Prisma.ProductWhereInput | null =>
    v === "published" ? { published: true }
    : v === "hidden" ? { published: false }
    : v === "synced" ? { syncStatus: "synced" }
    : v === "modified" ? { syncStatus: "modified" }
    : v === "error" ? { syncStatus: "error" } : null;
  const flagCond = (v: string): Prisma.ProductWhereInput | null =>
    v === "no-image" ? { imageUrl: null }
    : v === "no-category" ? { categoryName: null }
    : v === "no-stock" ? { stock: { lte: 0 }, infiniteStock: false }
    : v === "no-sku" ? { sku: null }
    : v === "stale" ? { AND: [{ OR: [{ stock: { gt: 0 } }, { infiniteStock: true }] }, { OR: [{ lastSoldAt: null }, { lastSoldAt: { lt: staleDate } }] }] } : null;

  const AND: Prisma.ProductWhereInput[] = [];
  if (q) AND.push({ OR: [{ name: { contains: q } }, { sku: { contains: q } }] });

  const st = parseTri(status);
  const stInc = st.inc.map(statusCond).filter((c): c is Prisma.ProductWhereInput => c != null);
  if (stInc.length) AND.push({ OR: stInc });                       // include: any of
  for (const v of st.exc) { const c = statusCond(v); if (c) AND.push({ NOT: c }); }

  const col = parseTri(category);
  if (col.inc.length) AND.push({ categories: { some: { category: { name: { in: col.inc } } } } });
  if (col.exc.length) AND.push({ NOT: { categories: { some: { category: { name: { in: col.exc } } } } } });

  const fl = parseTri(flag);
  for (const v of fl.inc) { const c = flagCond(v); if (c) AND.push(c); }   // include flags: all of
  for (const v of fl.exc) { const c = flagCond(v); if (c) AND.push({ NOT: c }); }

  // Focus mode: the working set lives in the browser, so its ids travel in the
  // URL. We only ever receive ids — the products themselves are read fresh here.
  const focusIds = (sp.focus || "").split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  if (focusIds.length) AND.push({ id: { in: focusIds } });

  const where: Prisma.ProductWhereInput = AND.length ? { AND } : {};

  // Creation-based sorts are stable: editing a product must not reshuffle the
  // list under you. Ordering by updatedAt is opt-in ("edited").
  const orderBy =
    sort === "oldest" ? { createdAt: "asc" as const }
    : sort === "edited" ? { updatedAt: "desc" as const }
    : sort === "best-selling" ? { unitsSold: "desc" as const }
    : sort === "worst-selling" ? { unitsSold: "asc" as const }
    : sort === "price-high" ? { price: "desc" as const }
    : sort === "price-low" ? { price: "asc" as const }
    : { createdAt: "desc" as const };

  const [total, products, categories, pendingCount] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        categoryName: true,
        price: true,
        promotionalPrice: true,
        costUsd: true,
        stock: true,
        infiniteStock: true,
        published: true,
        imageUrl: true,
        syncStatus: true,
        pendingDelete: true,
        lastSyncedAt: true,
        tags: true,
        unitsSold: true,
        lastSoldAt: true,
        categories: { select: { category: { select: { id: true, name: true } } } },
        _count: { select: { variants: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.category.findMany({
      select: { name: true, tiendaNubeId: true, parentTnId: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.count({ where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] } }),
  ]);

  let editProduct = null;
  if (editId) {
    const raw = await prisma.product.findUnique({
      where: { id: editId },
      include: { variants: true, categories: { include: { category: true } } },
    });
    if (raw) {
      editProduct = {
        ...raw,
        categoryIds: raw.categories.map((pc) => pc.categoryId),
        categoryChips: raw.categories.map((pc) => ({ id: pc.category.id, name: pc.category.name })),
      };
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const categoryList = [...new Set(categories.map((c) => c.name))].filter(Boolean);
  const categoryTree = categories
    .filter((c) => c.name)
    .map((c) => ({ name: c.name, tnId: c.tiendaNubeId, parentTnId: c.parentTnId }));

  const productsOut = products.map((p) => ({
    ...p,
    categoryLinks: p.categories.map((c) => ({ id: c.category.id, name: c.category.name })),
    variantCount: p._count.variants,
  }));

  return (
    <CatalogShell
      products={productsOut as unknown as CatalogProduct[]}
      total={total}
      page={page}
      totalPages={totalPages}
      categories={categoryList}
      categoryTree={categoryTree}
      currentQ={q}
      currentStatus={status}
      currentCategory={category}
      currentFlag={flag}
      currentSort={sort}
      editProduct={editProduct}
      pendingCount={pendingCount}
    />
  );
}

export type CatalogProduct = {
  id: number;
  name: string;
  sku: string | null;
  categoryName: string | null;
  categoryLinks: { id: number; name: string }[];
  price: number;
  promotionalPrice: number | null;
  costUsd: number | null;
  stock: number | null;
  infiniteStock: boolean;
  variantCount: number;
  published: boolean;
  imageUrl: string | null;
  syncStatus: string;
  pendingDelete: boolean;
  lastSyncedAt: Date | null;
  tags: string;
  unitsSold: number;
  lastSoldAt: Date | null;
};
