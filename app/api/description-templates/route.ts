import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SEED_SKELETON, SEED_FIELDS } from "@/lib/descriptionTemplates";

/** GET: all description templates (with how many products use each). */
export async function GET() {
  const templates = await prisma.descriptionTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, skeleton: true, fields: true, _count: { select: { products: true } } },
  });
  return NextResponse.json(templates.map((t) => ({ ...t, productCount: t._count.products })));
}

/** POST: create a template. Body { name, skeleton, fields } or { seed: true } for the RE5 seed. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.seed) {
    const t = await prisma.descriptionTemplate.create({
      data: { name: "Juego digital (ejemplo)", skeleton: SEED_SKELETON, fields: JSON.stringify(SEED_FIELDS) },
    });
    return NextResponse.json(t);
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const t = await prisma.descriptionTemplate.create({
    data: {
      name: body.name.trim(),
      skeleton: typeof body.skeleton === "string" ? body.skeleton : "",
      fields: typeof body.fields === "string" ? body.fields : JSON.stringify(body.fields ?? []),
    },
  });
  return NextResponse.json(t);
}
