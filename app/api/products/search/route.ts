import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 48;

/** GET /api/products/search?q=...&page=1 — paginated product picker source (grid). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const category = url.searchParams.get("category")?.trim() || "";

  const where = {
    ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    ...(category ? { categories: { some: { category: { name: category } } } } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: { id: true, name: true, sku: true, price: true, promotionalPrice: true, imageUrl: true, categoryName: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({ products, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total });
}
