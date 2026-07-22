import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseVersions, validateVersions } from "@/lib/productTemplates";

export const runtime = "nodejs";

/** GET: todas las plantillas de producto. */
export async function GET() {
  const templates = await prisma.productTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(templates);
}

/** POST { name, versions, categoryIds?, tags?, descriptionTemplateId?, imageTemplateId? } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const versions = parseVersions(JSON.stringify(body.versions ?? []));
  const err = validateVersions(versions);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const t = await prisma.productTemplate.create({
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
