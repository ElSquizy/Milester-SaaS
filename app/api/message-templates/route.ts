import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SEED_MESSAGE_BODY } from "@/lib/messageTemplates";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await prisma.messageTemplate.findMany({ orderBy: { createdAt: "asc" } }));
}

/** POST { name, body } o { seed: true } para el mensaje de ejemplo. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.seed) {
    const t = await prisma.messageTemplate.create({ data: { name: "Mensaje de venta", body: SEED_MESSAGE_BODY } });
    return NextResponse.json(t);
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const t = await prisma.messageTemplate.create({
    data: { name: body.name.trim(), body: typeof body.body === "string" ? body.body : "" },
  });
  return NextResponse.json(t);
}
