import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { context, productName, currentValue, providerId } = await req.json();

  // Find provider (explicit or default or first)
  const provider = providerId
    ? await prisma.aiProvider.findUnique({ where: { id: Number(providerId) } })
    : await prisma.aiProvider.findFirst({ where: { isDefault: true } })
      ?? await prisma.aiProvider.findFirst();

  if (!provider) {
    return NextResponse.json({ error: "No hay proveedores de IA configurados. Agregá uno en Configuración." }, { status: 400 });
  }

  // Find template for this context
  const template = await prisma.aiTemplate.findFirst({
    where: { context, OR: [{ providerId: provider.id }, { providerId: null }] },
    orderBy: { providerId: "desc" }, // prefer provider-specific
  });

  const systemPrompt = template?.prompt ||
    defaultPrompts[context] ||
    `Eres un asistente de e-commerce. Genera contenido optimizado para el producto indicado. Responde solo con el contenido, sin explicaciones.`;

  const userMessage = `Producto: "${productName}"${currentValue ? `\nContenido actual: ${currentValue.slice(0, 500)}` : ""}`;

  try {
    let result = "";

    if (provider.provider === "google") {
      result = await callGemini(provider.apiKey, provider.model, systemPrompt, userMessage);
    } else if (provider.provider === "anthropic") {
      result = await callAnthropic(provider.apiKey, provider.model, systemPrompt, userMessage);
    } else if (provider.provider === "openai") {
      result = await callOpenAI(provider.apiKey, provider.model, systemPrompt, userMessage);
    } else {
      return NextResponse.json({ error: `Proveedor "${provider.provider}" no soportado` }, { status: 400 });
    }

    return NextResponse.json({ result, provider: provider.name });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const defaultPrompts: Record<string, string> = {
  description: `Eres un experto en e-commerce latinoamericano. Genera una descripción de producto en HTML para Tienda Nube.
Estructura requerida:
- <h3> con el nombre del producto
- <p> con descripción persuasiva (2-3 oraciones)
- <ul> con 4-5 características clave
- <p> con llamada a la acción
Usa español neutro. Responde SOLO con el HTML, sin explicaciones ni markdown.`,

  seoTitle: `Genera un meta título SEO para e-commerce. Máximo 60 caracteres. Incluye la keyword principal al inicio. Responde solo con el título.`,

  seoDescription: `Genera una meta descripción SEO para e-commerce. Entre 140-155 caracteres. Incluye una llamada a la acción. Responde solo con la descripción.`,

  name: `Mejora el nombre de este producto para e-commerce. Debe ser claro, atractivo y descriptivo. Máximo 80 caracteres. Responde solo con el nombre mejorado.`,
};

async function callGemini(apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}
