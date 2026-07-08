import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { duplicateProduct } from "@/lib/products";

/**
 * Bulk actions update products LOCALLY and mark them as "modified".
 * Nothing is pushed to Tienda Nube here — the user syncs deliberately via /api/sync.
 */
export async function POST(req: Request) {
  const { ids, action, value } = await req.json();
  if (!ids?.length) return NextResponse.json({ error: "No ids provided" }, { status: 400 });

  try {
    let updated = 0;

    if (action === "price") {
      const { type, value: val } = value as { type: "pct" | "fixed"; value: number };
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, price: true },
      });

      for (const p of products) {
        const newPrice =
          type === "pct" ? parseFloat((p.price * (1 + val / 100)).toFixed(2)) : val;
        if (newPrice === p.price) continue;

        await prisma.$transaction([
          prisma.product.update({
            where: { id: p.id },
            data: { price: newPrice, originalPrice: newPrice, syncStatus: "modified" },
          }),
          prisma.changelog.create({
            data: { productId: p.id, field: "price", oldValue: String(p.price), newValue: String(newPrice) },
          }),
        ]);
        updated++;
      }
    }

    if (action === "visibility") {
      const published = value as boolean;
      const products = await prisma.product.findMany({
        where: { id: { in: ids }, published: { not: published } },
        select: { id: true, published: true },
      });
      for (const p of products) {
        await prisma.$transaction([
          prisma.product.update({
            where: { id: p.id },
            data: { published, syncStatus: "modified" },
          }),
          prisma.changelog.create({
            data: { productId: p.id, field: "published", oldValue: String(p.published), newValue: String(published) },
          }),
        ]);
        updated++;
      }
    }

    if (action === "category") {
      const categoryName = value as string;
      const products = await prisma.product.findMany({
        where: { id: { in: ids }, categoryName: { not: categoryName } },
        select: { id: true, categoryName: true },
      });
      for (const p of products) {
        await prisma.$transaction([
          prisma.product.update({
            where: { id: p.id },
            data: { categoryName, syncStatus: "modified" },
          }),
          prisma.changelog.create({
            data: { productId: p.id, field: "category", oldValue: p.categoryName, newValue: categoryName },
          }),
        ]);
        updated++;
      }
    }

    // Duplicate each selected product into a staged local copy (created on TN at next sync).
    if (action === "duplicate") {
      const s = await prisma.settings.findFirst();
      const creds = s?.storeId && s.accessToken ? { storeId: s.storeId, accessToken: s.accessToken } : undefined;
      for (const id of ids) {
        await duplicateProduct(id, creds);
        updated++;
      }
    }

    // Stage the selected products for deletion (applied to TN + local at next sync).
    if (action === "stage-delete") {
      const r = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { pendingDelete: true } });
      updated = r.count;
    }

    // Undo a staged deletion.
    if (action === "restore") {
      const r = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { pendingDelete: false } });
      updated = r.count;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
