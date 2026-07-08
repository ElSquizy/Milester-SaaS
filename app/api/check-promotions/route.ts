import { NextResponse } from "next/server";
import { checkAndApplyPromotions } from "@/lib/promotions";

export async function POST() {
  const result = await checkAndApplyPromotions();
  return NextResponse.json(result);
}
