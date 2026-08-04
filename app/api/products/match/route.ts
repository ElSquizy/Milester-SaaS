import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseList, indexProducts, matchLines } from "@/lib/listMatch";

export const runtime = "nodejs";

const MAX_LINES = 500; // tope defensivo por request

/**
 * POST { text: string } — parsea una lista pegada y devuelve, por cada línea,
 * los productos del catálogo más parecidos (recall-first; el usuario elige).
 * Carga el catálogo (id/name/sku/imageUrl/price) UNA vez y matchea en memoria.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text: string = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "Pegá una lista" }, { status: 400 });

  const lines = parseList(text).slice(0, MAX_LINES);
  if (lines.length === 0) return NextResponse.json({ results: [], parsed: 0 });

  const products = await prisma.product.findMany({
    where: { pendingDelete: false },
    select: { id: true, name: true, sku: true, imageUrl: true, price: true },
  });

  const index = indexProducts(products);
  const results = matchLines(lines, index);

  return NextResponse.json({ results, parsed: lines.length, catalog: products.length });
}
