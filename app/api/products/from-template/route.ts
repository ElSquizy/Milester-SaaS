import { NextResponse } from "next/server";
import { previewFromTemplate, buildFromTemplate } from "@/lib/productTemplates";

export const runtime = "nodejs";

/**
 * POST { templateId, versionKeys, baseName, baseSku, productImageUrl?, preview? }
 * preview: true → devuelve la tabla generada + conflictos sin crear nada.
 * preview: false → crea los productos staged (todo-o-nada frente a conflictos).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const input = {
    templateId: Number(body.templateId),
    versionKeys: Array.isArray(body.versionKeys) ? body.versionKeys.map(String) : [],
    baseName: String(body.baseName ?? ""),
    baseSku: String(body.baseSku ?? ""),
    productImageUrl: body.productImageUrl ? String(body.productImageUrl) : null,
  };
  if (isNaN(input.templateId)) return NextResponse.json({ error: "Plantilla inválida" }, { status: 400 });
  try {
    if (body.preview) return NextResponse.json(await previewFromTemplate(input));
    const result = await buildFromTemplate(input);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
