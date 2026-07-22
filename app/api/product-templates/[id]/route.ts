import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseVersions, validateVersions } from "@/lib/productTemplates";

export const runtime = "nodejs";

/** PUT: actualiza una plantilla de producto (mismo shape que el POST). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const existing = await prisma.productTemplate.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const versions = parseVersions(JSON.stringify(body.versions ?? []));
  const err = validateVersions(versions);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const t = await prisma.productTemplate.update({
    where: { id: existing.id },
    data: {
      name: body.name.trim(),
      versions: JSON.stringify(versions),
      categoryIds: JSON.stringify(Array.isArray(body.categoryIds) ? body.categoryIds.map(Number).filter((n: number) => !isNaN(n)) : []),
      tags: JSON.stringify(Array.isArray(body.tags) ? body.tags.map(String) : []),
      descriptionTemplateId: body.descriptionTemplateId ? Number(body.descriptionTemplateId) : null,
      imageTemplateId: body.imageTemplateId ? Number(body.imageTemplateId) : null,
    },
  });
  return NextResponse.json(t);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.productTemplate.delete({ where: { id: Number(id) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
