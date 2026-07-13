import { NextResponse } from "next/server";
import { duplicateProduct } from "@/lib/products";
import { getCreds } from "@/lib/creds";

/** POST: create a local copy of a product, staged as new (pushed to TN on next sync). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (isNaN(productId)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  try {
    const creds = (await getCreds()) ?? undefined;
    const copy = await duplicateProduct(productId, creds);
    return NextResponse.json(copy);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
