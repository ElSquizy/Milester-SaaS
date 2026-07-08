import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(providers);
}

export async function POST(req: Request) {
  const { name, provider, apiKey, model, isDefault } = await req.json();
  if (!name || !provider || !apiKey || !model) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  // If setting as default, unset others first
  if (isDefault) {
    await prisma.aiProvider.updateMany({ data: { isDefault: false } });
  }
  const created = await prisma.aiProvider.create({ data: { name, provider, apiKey, model, isDefault: !!isDefault } });
  return NextResponse.json(created);
}
