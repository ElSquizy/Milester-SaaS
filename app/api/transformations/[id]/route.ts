import { NextResponse } from "next/server";
import { getJob, editItem, editGroup, confirmSplit, deleteJob } from "@/lib/transformations";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(Number(id));
  if (!job) return NextResponse.json({ error: "Transformación no encontrada" }, { status: 404 });
  return NextResponse.json(job);
}

/**
 * PATCH:
 *   { itemId, ...campos }            → edita un ítem (datos específicos de la variante)
 *   { sourceProductId, common:{…} }  → edita los datos comunes de todo el grupo
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const job = body.sourceProductId != null && body.common
      ? await editGroup(Number(id), Number(body.sourceProductId), body.common)
      : await editItem(Number(id), Number(body.itemId), body);
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
