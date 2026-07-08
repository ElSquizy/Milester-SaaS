import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyIncoming, dismissIncoming } from "@/lib/changes";

/** POST: apply or dismiss incoming changes. Body { tiendaNubeIds?: string[], all?: boolean, action: "apply" | "dismiss" } */
export async function POST(req: Request) {
  const { tiendaNubeIds, all, action } = await req.json();
  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) {
    return NextResponse.json({ error: "Conectá tu tienda primero" }, { status: 400 });
  }

  let ids: string[] = tiendaNubeIds || [];
  if (all) {
    const rows = await prisma.incomingChange.findMany({ distinct: ["tiendaNubeId"], select: { tiendaNubeId: true } });
    ids = rows.map((r) => r.tiendaNubeId);
  }
  if (ids.length === 0) return NextResponse.json({ ok: true, applied: 0 });

  try {
    if (action === "dismiss") {
      await dismissIncoming(ids);
      return NextResponse.json({ ok: true, dismissed: ids.length });
    }
    const r = await applyIncoming(ids, settings.storeId, settings.accessToken);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
