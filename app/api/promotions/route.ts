import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const { productId, promoPrice, startDate, endDate } = body;

  const existing = await prisma.promotion.findUnique({ where: { productId: Number(productId) } });

  if (existing) {
    const updated = await prisma.promotion.update({
      where: { productId: Number(productId) },
      data: {
        promoPrice,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        active: false,
        appliedAt: null,
        revertedAt: null,
      },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.promotion.create({
    data: {
      productId: Number(productId),
      promoPrice,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request) {
  const { productId } = await req.json();
  await prisma.promotion.deleteMany({ where: { productId: Number(productId) } });
  return NextResponse.json({ success: true });
}
