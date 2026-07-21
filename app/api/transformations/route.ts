import { NextResponse } from "next/server";
import { previewSplit, listJobs, DEFAULT_NAME_RULE } from "@/lib/transformations";
import { getCreds } from "@/lib/creds";

export const runtime = "nodejs";
// Preview fetches live variant data from TN per selected product; give it room.
export const maxDuration = 60;

/** GET: recent transformation jobs (the operation log). */
export async function GET() {
  return NextResponse.json(await listJobs());
}

/** POST { productIds, nameRule? } → creates a DRAFT job with editable items. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const productIds = Array.isArray(body.productIds) ? body.productIds.map(Number).filter((n: number) => !isNaN(n)) : [];
  if (!productIds.length) return NextResponse.json({ error: "Seleccioná al menos un producto" }, { status: 400 });
  try {
    const creds = (await getCreds()) ?? undefined;
    const job = await previewSplit(productIds, body.nameRule || DEFAULT_NAME_RULE, creds);
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
