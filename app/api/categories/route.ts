import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCategoryInTiendaNube } from "@/lib/categories";

/** POST: create a new category (optionally a subcategory) in Tienda Nube + locally. */
export async function POST(req: Request) {
  const { name, parentTnId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }
  try {
    const cat = await createCategoryInTiendaNube(settings.storeId, settings.accessToken, name, parentTnId || null);
    return NextResponse.json(cat);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** Returns the flat list of categories with product counts. Client builds the tree. */
export async function GET() {
  const cats = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(
    cats.map((c) => ({
      id: c.id,
      tiendaNubeId: c.tiendaNubeId,
      name: c.name,
      parentTnId: c.parentTnId,
      count: c._count.products,
    }))
  );
}
