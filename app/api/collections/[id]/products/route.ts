import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCollectionProducts, setCollectionMembership } from "@/lib/collections";

/** GET: products currently in the collection. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const products = await getCollectionProducts(categoryId);
  return NextResponse.json({ products });
}

/** PUT: apply a bulk membership change. Body { add: number[], remove: number[] }. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const add = Array.isArray(body.add) ? body.add.map(Number).filter((n: number) => !isNaN(n)) : [];
  const remove = Array.isArray(body.remove) ? body.remove.map(Number).filter((n: number) => !isNaN(n)) : [];

  try {
    const result = await setCollectionMembership(categoryId, add, remove, {
      storeId: settings.storeId,
      accessToken: settings.accessToken,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
