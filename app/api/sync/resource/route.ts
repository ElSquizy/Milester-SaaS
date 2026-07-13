import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreds } from "@/lib/creds";
import { syncCategoryTree } from "@/lib/categories";
import { syncCustomersFromTiendaNube } from "@/lib/customerSync";
import { syncOrdersIncremental } from "@/lib/salesSync";
import { syncCatalogFromTiendaNube } from "@/lib/catalogSync";
import { tickCampaigns } from "@/lib/campaignScheduler";
import { scanIncomingChanges } from "@/lib/changes";

type Resource = "catalog" | "collections" | "campaigns" | "sales" | "customers" | "changes";

/**
 * POST: re-pull a single resource from Tienda Nube on demand (Settings → Importaciones).
 * Body: { resource, full? }. Each resource upserts current TN state; nothing is duplicated.
 * Returns { resource, summary } plus resource-specific counts.
 */
export async function POST(req: Request) {
  const creds = await getCreds();
  if (!creds) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }
  const { storeId, accessToken } = creds;

  const body = await req.json().catch(() => ({}));
  const resource = body.resource as Resource;

  try {
    switch (resource) {
      case "collections": {
        const map = await syncCategoryTree(storeId, accessToken);
        return NextResponse.json({ resource, collections: map.size, summary: `${map.size} colecciones actualizadas` });
      }
      case "catalog": {
        const r = await syncCatalogFromTiendaNube(storeId, accessToken, { full: !!body.full });
        return NextResponse.json({
          resource, ...r,
          summary: `${r.created} nuevos, ${r.updated} actualizados${r.deleted ? `, ${r.deleted} eliminados` : ""}${r.skipped ? `, ${r.skipped} omitidos (edición local)` : ""}`,
        });
      }
      case "sales": {
        const r = await syncOrdersIncremental(storeId, accessToken);
        return NextResponse.json({ resource, ...r, summary: `${r.created} ventas nuevas, ${r.updated} actualizadas` });
      }
      case "customers": {
        const r = await syncCustomersFromTiendaNube(storeId, accessToken);
        return NextResponse.json({ resource, ...r, summary: `${r.created} clientes nuevos, ${r.updated} actualizados` });
      }
      case "campaigns": {
        const r = await tickCampaigns({ storeId, accessToken });
        const parts = [];
        if (r.activated) parts.push(`${r.activated} activadas`);
        if (r.ended) parts.push(`${r.ended} terminadas`);
        return NextResponse.json({ resource, ...r, summary: parts.length ? parts.join(", ") : "Sin cambios de estado" });
      }
      case "changes": {
        const r = await scanIncomingChanges(storeId, accessToken);
        const pending = await prisma.incomingChange.findMany({ distinct: ["tiendaNubeId"], select: { tiendaNubeId: true } });
        return NextResponse.json({ resource, ...r, pendingProducts: pending.length, summary: `${pending.length} productos con cambios pendientes` });
      }
      default:
        return NextResponse.json({ error: "Recurso desconocido" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
