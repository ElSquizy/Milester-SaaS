import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return NextResponse.json({ error: "Poné un nombre" }, { status: 400 });
  const t = await prisma.messageTemplate.update({
    where: { id: Number(id) },
    data: { name: body.name.trim(), body: typeof body.body === "string" ? body.body : "" },
  });
  return NextResponse.json(t);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.messageTemplate.delete({ where: { id: Number(id) } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
