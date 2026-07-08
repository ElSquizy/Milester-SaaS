import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOneProduct, deleteOneProduct } from "@/lib/sync";

/** POST: force-push a single product to Tienda Nube now (create/update, or delete if staged). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (isNaN(productId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }
  const creds = { storeId: settings.storeId, accessToken: settings.accessToken };

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { pendingDelete: true } });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  try {
    if (product.pendingDelete) {
      await deleteOneProduct(productId, creds);
      return NextResponse.json({ ok: true, deleted: true });
    }
    await prisma.product.update({ where: { id: productId }, data: { syncStatus: "syncing" } });
    await syncOneProduct(productId, creds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (!product.pendingDelete) {
      await prisma.product.update({ where: { id: productId }, data: { syncStatus: "error" } }).catch(() => {});
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
