import { NextResponse } from "next/server";
import { getCreds } from "@/lib/creds";
import { duplicateCollection } from "@/lib/collections";

/** POST: duplicate a collection (name + same products) into Tienda Nube. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categoryId = Number(id);
  if (isNaN(categoryId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const creds = await getCreds();
  if (!creds) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  try {
    const res = await duplicateCollection(categoryId, { storeId: creds.storeId, accessToken: creds.accessToken });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
