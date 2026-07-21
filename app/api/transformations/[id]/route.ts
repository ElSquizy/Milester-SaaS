import { NextResponse } from "next/server";
import { getJob, editItem, confirmSplit, deleteJob } from "@/lib/transformations";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(Number(id));
  if (!job) return NextResponse.json({ error: "Transformación no encontrada" }, { status: 404 });
  return NextResponse.json(job);
}

/**
 * PATCH { itemId, ...campos } → edita una variante: sus datos propios
 * (nombre, precio, promo, stock, sku) y/o su bloque `common` (descripción,
 * imagen, colecciones, tags, SEO). Cada variante se edita de forma independiente.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const job = await editItem(Number(id), Number(body.itemId), body);
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

/** POST → confirma: crea los productos locales staged. Reintentable (solo procesa lo no creado). */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await confirmSplit(Number(id));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteJob(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
