import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const logs = await prisma.changelog.findMany({
    where: { productId: Number(id) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(logs);
}
