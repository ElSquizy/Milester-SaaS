import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProductToTiendaNube } from "@/lib/tiendanube";

export async function GET() {
  const products = await prisma.product.findMany({
    include: { promotion: true, variants: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, description, price, seoTitle, seoDescription } = body;

  const product = await prisma.product.create({
    data: {
      name,
      description,
      price,
      originalPrice: price,
      seoTitle,
      seoDescription,
      variants: {
        create: [{ price }],
      },
    },
    include: { variants: true },
  });

  const settings = await prisma.settings.findFirst();
  if (settings?.storeId && settings.accessToken) {
    try {
      const tnProduct = await syncProductToTiendaNube(settings.storeId, settings.accessToken, {
        name: product.name,
        description: product.description,
        price: product.price,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        variants: product.variants.map(({ values, ...v }) => { void values; return v; }),
      });

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: {
          tiendaNubeId: String(tnProduct.id),
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          variants: {
            updateMany: {
              where: { productId: product.id },
              data: { tiendaNubeId: String(tnProduct.variants?.[0]?.id || "") },
            },
          },
        },
        include: { variants: true, promotion: true },
      });
      return NextResponse.json(updated, { status: 201 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await prisma.product.update({
        where: { id: product.id },
        data: { syncStatus: "error" },
      });
      return NextResponse.json({ ...product, syncStatus: "error", syncError: message }, { status: 201 });
    }
  }

  return NextResponse.json(product, { status: 201 });
}
