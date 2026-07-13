import { NextResponse } from "next/server";
import { composeProductImage } from "@/lib/composeImage";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Composition is CPU-heavy (sharp) — cap previews per IP.
const MAX_PER_MIN = 15;

/** POST { backgroundUrl, coverUrl, productUrl } → composed 1024×1024 PNG (for preview). */
export async function POST(req: Request) {
  const gate = rateLimit(`compose:${clientIp(req)}`, MAX_PER_MIN, 60_000);
  if (!gate.ok) {
    return NextResponse.json({ error: "Demasiadas imágenes por minuto. Esperá un momento." }, { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const png = await composeProductImage({
      backgroundUrl: body.backgroundUrl,
      coverUrl: body.coverUrl,
      productUrl: body.productUrl,
      shadow: body.shadow,
    });
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al componer" }, { status: 500 });
  }
}
