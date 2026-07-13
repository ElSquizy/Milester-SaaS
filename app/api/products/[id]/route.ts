import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/lib/products";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: { promotion: true, variants: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const result = await updateProduct(Number(id), body);
  if ("notFound" in result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.syncError) return NextResponse.json({ ...result.product, syncError: result.syncError });
  return NextResponse.json(result.product);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.product.delete({ where: { id: Number(id) } });
  return NextResponse.json({ success: true });
}
