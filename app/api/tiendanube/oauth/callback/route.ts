import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCreds } from "@/lib/creds";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

/** OAuth callback: exchanges the authorization code for an access token and saves it. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const settings = await prisma.settings.findFirst();
  if (!settings?.appId || !settings.clientSecret) {
    return NextResponse.redirect(new URL("/settings?error=missing-credentials", APP_URL));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no-code", APP_URL));
  }
  // Verify CSRF state (if one was set when starting the flow).
  if (settings.oauthState && state !== settings.oauthState) {
    return NextResponse.redirect(new URL("/settings?error=bad-state", APP_URL));
  }

  try {
    const res = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: settings.appId,
        client_secret: settings.clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      const msg = data.error_description || data.error || `HTTP ${res.status}`;
      return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(msg)}`, APP_URL));
    }

    await prisma.settings.update({
      where: { id: settings.id },
      data: {
        accessToken: data.access_token,
        storeId: String(data.user_id),
        oauthState: null,
      },
    });
    invalidateCreds();

    return NextResponse.redirect(new URL("/settings?connected=1", APP_URL));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(msg)}`, APP_URL));
  }
}
