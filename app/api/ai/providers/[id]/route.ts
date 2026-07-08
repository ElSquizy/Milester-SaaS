import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, provider, apiKey, model, isDefault } = await req.json();
  if (isDefault) {
    await prisma.aiProvider.updateMany({ data: { isDefault: false } });
  }
  const updated = await prisma.aiProvider.update({
    where: { id: Number(id) },
    data: { name, provider, apiKey, model, isDefault: !!isDefault },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.aiProvider.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
