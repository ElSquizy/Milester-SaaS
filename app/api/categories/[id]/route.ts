import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteCategoryLocalAndTn, moveCategory } from "@/lib/categories";

/** PATCH: move a collection under a new parent. Body { parentTnId: string | null }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const res = await moveCategory(categoryId, body.parentTnId ?? null, { storeId: settings.storeId, accessToken: settings.accessToken });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

/** DELETE: remove a collection from Tienda Nube and locally. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  try {
    const res = await deleteCategoryLocalAndTn(categoryId, { storeId: settings.storeId, accessToken: settings.accessToken });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
