import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildProductWhere } from "@/lib/productFilter";

export const runtime = "nodejs";

/**
 * GET: los ids de TODOS los productos que matchean el filtro actual del catálogo
 * (mismos query params que la página). Alimenta "Seleccionar todo el filtro" del
 * BulkBar. Cap defensivo para no traer un universo entero de una.
 */
const CAP = 5000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const where = buildProductWhere({
    q: url.searchParams.get("q") ?? "",
    status: url.searchParams.get("status") ?? "",
    category: url.searchParams.get("category") ?? "",
    flag: url.searchParams.get("flag") ?? "",
    focus: url.searchParams.get("focus") ?? "",
  });
  const rows = await prisma.product.findMany({ where, select: { id: true }, take: CAP });
  return NextResponse.json({ ids: rows.map((r) => r.id), capped: rows.length >= CAP });
}
