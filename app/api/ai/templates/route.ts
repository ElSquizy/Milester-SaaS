import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.aiTemplate.findMany({
    include: { provider: { select: { id: true, name: true } } },
    orderBy: { context: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const { context, label, prompt, providerId } = await req.json();
  if (!context || !prompt) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }
  const created = await prisma.aiTemplate.create({
    data: { context, label: label || context, prompt, providerId: providerId || null },
  });
  return NextResponse.json(created);
}
