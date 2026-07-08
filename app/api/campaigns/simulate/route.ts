import { NextResponse } from "next/server";
import { simulateCampaign } from "@/lib/campaigns";

export async function POST(req: Request) {
  const { scope, scopeValue, discountType, discountValue } = await req.json();
  if (!["pct", "fixed"].includes(discountType)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const result = await simulateCampaign({
    scope: scope || "all",
    scopeValue: scope === "all" ? null : scopeValue || null,
    discountType,
    discountValue: Number(discountValue) || 0,
  });
  return NextResponse.json(result);
}
