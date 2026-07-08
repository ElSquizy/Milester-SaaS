import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCampaign, endCampaign } from "@/lib/campaigns";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await req.json();
  const campaignId = Number(id);

  try {
    if (action === "apply") {
      const r = await applyCampaign(campaignId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "end") {
      const r = await endCampaign(campaignId);
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id: Number(id) } });
  if (campaign?.status === "active") {
    return NextResponse.json({ error: "Terminá la campaña antes de eliminarla" }, { status: 400 });
  }
  await prisma.campaign.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
