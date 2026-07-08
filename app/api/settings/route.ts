import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.settings.findFirst();
  if (!settings) return NextResponse.json(null);
  // Never expose secrets to the client; just signal whether they're set.
  return NextResponse.json({
    storeId: settings.storeId,
    accessToken: settings.accessToken ? "********" : null,
    hasAccessToken: !!settings.accessToken,
    appId: settings.appId,
    hasClientSecret: !!settings.clientSecret,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { storeId, accessToken, appId, clientSecret, anthropicApiKey } = body;
  const existing = await prisma.settings.findFirst();

  const data = {
    ...(storeId !== undefined ? { storeId: storeId || null } : {}),
    // Ignore the masked placeholder so we don't overwrite a real token with "********".
    ...(accessToken !== undefined && accessToken !== "********" ? { accessToken: accessToken || null } : {}),
    ...(appId !== undefined ? { appId: appId || null } : {}),
    ...(clientSecret !== undefined && clientSecret !== "********" ? { clientSecret: clientSecret || null } : {}),
    ...(anthropicApiKey !== undefined ? { anthropicApiKey: anthropicApiKey || null } : {}),
  };

  if (existing) {
    const updated = await prisma.settings.update({ where: { id: existing.id }, data });
    return NextResponse.json({ ok: true, id: updated.id });
  }
  const created = await prisma.settings.create({ data });
  return NextResponse.json({ ok: true, id: created.id });
}
