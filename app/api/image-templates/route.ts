import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET: all image templates (with how many products use each). */
export async function GET() {
  const templates = await prisma.imageTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, backgroundUrl: true, coverUrl: true, _count: { select: { products: true } } },
  });
  return NextResponse.json(templates.map((t) => ({ ...t, productCount: t._count.products })));
}

/** POST: create an image template. Body { name, backgroundUrl, coverUrl }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const t = await prisma.imageTemplate.create({
    data: {
      name: body.name.trim(),
      backgroundUrl: typeof body.backgroundUrl === "string" ? body.backgroundUrl.trim() : "",
      coverUrl: typeof body.coverUrl === "string" ? body.coverUrl.trim() : "",
    },
  });
  return NextResponse.json(t);
}
