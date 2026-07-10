import { NextResponse } from "next/server";
import { composeProductImage } from "@/lib/composeImage";

export const runtime = "nodejs";

/** POST { backgroundUrl, coverUrl, productUrl } → composed 1024×1024 PNG (for preview). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const png = await composeProductImage({
      backgroundUrl: body.backgroundUrl,
      coverUrl: body.coverUrl,
      productUrl: body.productUrl,
    });
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al componer" }, { status: 500 });
  }
}
