import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Lists pending incoming changes grouped by product. */
export async function GET() {
  const rows = await prisma.incomingChange.findMany({ orderBy: { detectedAt: "desc" } });

  const byProduct = new Map<string, {
    tiendaNubeId: string; productId: number | null; productName: string;
    conflict: boolean; isNew: boolean;
    changes: { field: string; localValue: string | null; remoteValue: string | null }[];
  }>();

  for (const r of rows) {
    let g = byProduct.get(r.tiendaNubeId);
    if (!g) {
      g = { tiendaNubeId: r.tiendaNubeId, productId: r.productId, productName: r.productName, conflict: r.conflict, isNew: false, changes: [] };
      byProduct.set(r.tiendaNubeId, g);
    }
    if (r.field === "new") g.isNew = true;
    else g.changes.push({ field: r.field, localValue: r.localValue, remoteValue: r.remoteValue });
    if (r.conflict) g.conflict = true;
  }

  return NextResponse.json(Array.from(byProduct.values()));
}
