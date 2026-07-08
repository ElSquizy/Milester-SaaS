import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, label, prompt, providerId } = await req.json();
  const updated = await prisma.aiTemplate.update({
    where: { id: Number(id) },
    data: { context, label, prompt, providerId: providerId || null },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.aiTemplate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
