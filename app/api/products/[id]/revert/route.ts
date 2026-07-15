import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreds } from "@/lib/creds";
import { revertProductFromTiendaNube } from "@/lib/catalogSync";

/**
 * POST: discard a product's un-pushed local edits, restoring the version that
 * currently lives in Tienda Nube. Refuses when there is nothing pending — once
 * a change is synced, TN *is* the new version, so undoing it belongs in the
 * Actividad view (which produces a fresh change to push).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (isNaN(productId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { syncStatus: true, pendingDelete: true } });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const hasPending = product.syncStatus === "modified" || product.syncStatus === "error" || product.pendingDelete;
  if (!hasPending) {
    return NextResponse.json({ error: "Este producto no tiene cambios sin sincronizar." }, { status: 400 });
  }

  const creds = await getCreds();
  if (!creds) return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });

  try {
    const res = await revertProductFromTiendaNube(productId, creds);
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
