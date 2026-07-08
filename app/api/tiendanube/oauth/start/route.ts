import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

/** Kicks off the Tienda Nube OAuth flow: redirects the merchant to the authorize screen. */
export async function GET() {
  const settings = await prisma.settings.findFirst();
  if (!settings?.appId) {
    return NextResponse.redirect(
      new URL("/settings?error=missing-app-id", process.env.APP_URL || "http://localhost:3000")
    );
  }

  // CSRF protection: store a random state and verify it on callback.
  const state = randomBytes(16).toString("hex");
  await prisma.settings.update({ where: { id: settings.id }, data: { oauthState: state } });

  const authorizeUrl = `https://www.tiendanube.com/apps/${settings.appId}/authorize?state=${state}`;
  return NextResponse.redirect(authorizeUrl);
}
