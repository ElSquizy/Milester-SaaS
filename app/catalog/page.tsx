import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { buildProductWhere } from "@/lib/productFilter";
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

  const where = buildProductWhere({ q, status, category, flag, focus: sp.focus });

  // Creation-based sorts are stable: editing a product must not reshuffle the
  // list under you. Ordering by updatedAt is opt-in ("edited").
  const orderBy =
    sort === "oldest" ? { createdAt: "asc" as const }
    : sort === "edited" ? { updatedAt: "desc" as const }
    : sort === "best-selling" ? { unitsSold: "desc" as const }
    : sort === "worst-selling" ? { unitsSold: "asc" as const }
    : sort === "price-high" ? { price: "desc" as const }
    : sort === "price-low" ? { price: "asc" as const }
    // Costo USD promocional: los que no tienen (null) siempre al final.
    : sort === "usd-promo-high" ? { costUsdPromo: { sort: "desc" as const, nulls: "last" as const } }
    : sort === "usd-promo-low" ? { costUsdPromo: { sort: "asc" as const, nulls: "last" as const } }
    : sort === "name-asc" ? { nameSort: "asc" as const }
    : sort === "name-desc" ? { nameSort: "desc" as const }
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
        costUsdPromo: true,
        productUrl: true,
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
  costUsdPromo: number | null;
  productUrl: string | null;
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
