import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PUT: update an image template's name / background / cover. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { name?: string; backgroundUrl?: string; coverUrl?: string; shadowOffsetX?: number; shadowOffsetY?: number; shadowBlur?: number; shadowOpacity?: number; productX?: number; productY?: number; productW?: number; productH?: number } = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.backgroundUrl === "string") data.backgroundUrl = body.backgroundUrl.trim();
  if (typeof body.coverUrl === "string") data.coverUrl = body.coverUrl.trim();
  // Geometría del slot del producto. W/H con mínimo para no colapsar el slot.
  if (Number.isFinite(body.productX)) data.productX = Math.round(body.productX);
  if (Number.isFinite(body.productY)) data.productY = Math.round(body.productY);
  if (Number.isFinite(body.productW)) data.productW = Math.max(32, Math.round(body.productW));
  if (Number.isFinite(body.productH)) data.productH = Math.max(32, Math.round(body.productH));
  if (Number.isFinite(body.shadowOffsetX)) data.shadowOffsetX = Math.round(body.shadowOffsetX);
  if (Number.isFinite(body.shadowOffsetY)) data.shadowOffsetY = Math.round(body.shadowOffsetY);
  if (Number.isFinite(body.shadowBlur)) data.shadowBlur = Math.max(0, Math.round(body.shadowBlur));
  if (Number.isFinite(body.shadowOpacity)) data.shadowOpacity = Math.min(1, Math.max(0, body.shadowOpacity));
  const t = await prisma.imageTemplate.update({ where: { id: Number(id) }, data });
  return NextResponse.json(t);
}

/** DELETE: remove an image template (products keep their current image; link cleared). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.imageTemplate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
