import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const label = (values: string): string => {
  try { const a = JSON.parse(values); return Array.isArray(a) && a.length ? a.join(" · ") : ""; } catch { return ""; }
};

/**
 * POST { ids: number[] } → { [productId]: { id, label, price, promotionalPrice }[] }
 * Only includes products with MORE THAN ONE variant (single-variant products are
 * priced at the product level). Used by the campaign wizard to price per variant.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => !isNaN(n)) : [];
  if (!ids.length) return NextResponse.json({});

  const variants = await prisma.variant.findMany({
    where: { productId: { in: ids } },
    select: { id: true, productId: true, price: true, promotionalPrice: true, values: true },
    orderBy: { id: "asc" },
  });

  const byProduct: Record<number, { id: number; label: string; price: number; promotionalPrice: number | null }[]> = {};
  for (const v of variants) {
    (byProduct[v.productId] ||= []).push({ id: v.id, label: label(v.values), price: v.price, promotionalPrice: v.promotionalPrice });
  }
  // Drop single-variant products — they don't need per-variant pricing.
  for (const pid of Object.keys(byProduct)) if (byProduct[Number(pid)].length < 2) delete byProduct[Number(pid)];

  return NextResponse.json(byProduct);
}
