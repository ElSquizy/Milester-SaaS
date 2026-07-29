import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { duplicateProduct } from "@/lib/products";
import { addTag, removeTag } from "@/lib/campaigns";
import { getCreds } from "@/lib/creds";

/**
 * Bulk actions update products LOCALLY and mark them "modified". Nothing is
 * pushed to Tienda Nube here — sync is deliberate (via el ícono/clic derecho o
 * el BulkBar, que llaman a /api/products/[id]/sync).
 *
 * Escrituras SECUENCIALES a propósito: el $transaction en loop falla sobre el
 * adaptador Turso HTTP ("Unable to start a transaction in the given time")
 * cuando el lote es grande.
 */
export async function POST(req: Request) {
  const { ids, action, value } = await req.json();
  if (!ids?.length) return NextResponse.json({ error: "No ids provided" }, { status: 400 });

  try {
    let updated = 0;

    if (action === "visibility") {
      const published = value as boolean;
      const products = await prisma.product.findMany({ where: { id: { in: ids }, published: { not: published } }, select: { id: true, published: true } });
      for (const p of products) {
        await prisma.product.update({ where: { id: p.id }, data: { published, syncStatus: "modified" } });
        await prisma.changelog.create({ data: { productId: p.id, field: "published", oldValue: String(p.published), newValue: String(published) } });
        updated++;
      }
    }

    // Colecciones REALES (ProductCategory), no el categoryName legacy.
    if (action === "add-collection" || action === "remove-collection") {
      const categoryIds: number[] = Array.isArray(value) ? value.map(Number).filter((n) => !isNaN(n)) : [];
      if (!categoryIds.length) return NextResponse.json({ error: "Sin colecciones" }, { status: 400 });
      const adding = action === "add-collection";
      for (const productId of ids) {
        let touched = false;
        for (const categoryId of categoryIds) {
          if (adding) {
            const existing = await prisma.productCategory.findUnique({ where: { productId_categoryId: { productId, categoryId } } });
            if (!existing) { await prisma.productCategory.create({ data: { productId, categoryId } }); touched = true; }
          } else {
            const r = await prisma.productCategory.deleteMany({ where: { productId, categoryId } });
            if (r.count) touched = true;
          }
        }
        if (touched) {
          await prisma.product.update({ where: { id: productId }, data: { syncStatus: "modified" } });
          await prisma.changelog.create({ data: { productId, field: "categories", oldValue: null, newValue: adding ? "+colección" : "−colección" } });
          updated++;
        }
      }
    }

    // Etiquetas (JSON en Product.tags).
    if (action === "add-tag" || action === "remove-tag") {
      const tag = String(value ?? "").trim();
      if (!tag) return NextResponse.json({ error: "Sin etiqueta" }, { status: 400 });
      const adding = action === "add-tag";
      const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } });
      for (const p of products) {
        const next = adding ? addTag(p.tags, tag) : removeTag(p.tags, tag);
        if (next === p.tags) continue;
        await prisma.product.update({ where: { id: p.id }, data: { tags: next, syncStatus: "modified" } });
        await prisma.changelog.create({ data: { productId: p.id, field: "tags", oldValue: p.tags, newValue: next } });
        updated++;
      }
    }

    // Duplicar cada seleccionado en una copia local staged (se crea en TN al sincronizar).
    if (action === "duplicate") {
      const creds = (await getCreds()) ?? undefined;
      for (const id of ids) { await duplicateProduct(id, creds); updated++; }
    }

    // Marcar para eliminar (se aplica a TN + local al sincronizar).
    if (action === "stage-delete") {
      const r = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { pendingDelete: true } });
      updated = r.count;
    }

    // Deshacer eliminación staged.
    if (action === "restore") {
      const r = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { pendingDelete: false } });
      updated = r.count;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
