import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 48;

/** GET /api/products/search?q=...&page=1 — paginated product picker source (grid). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const category = url.searchParams.get("category")?.trim() || "";

  // Tri-state collection filter (same encoding as the catalog): comma-separated
  // names, "+name"/"name" to include, "-name" to exclude.
  const inc: string[] = [], exc: string[] = [];
  for (const raw of category.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (raw.startsWith("-")) exc.push(raw.slice(1));
    else inc.push(raw.startsWith("+") ? raw.slice(1) : raw);
  }

  const where = {
    ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    ...(inc.length ? { categories: { some: { category: { name: { in: inc } } } } } : {}),
    ...(exc.length ? { NOT: { categories: { some: { category: { name: { in: exc } } } } } } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: {
        id: true, name: true, sku: true, price: true, promotionalPrice: true, imageUrl: true, categoryName: true,
        _count: { select: { variants: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    products: products.map(({ _count, ...p }) => ({ ...p, variantCount: _count.variants })),
    total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total,
  });
}
