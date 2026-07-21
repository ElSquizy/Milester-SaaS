import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/authToken";

// Gates the whole app behind a shared password + an on/off switch.
// - MILESTER_PASSWORD: the access password. If unset, the gate is OFF (local dev stays open).
// - MILESTER_ENABLED="false": maintenance mode — everything is blocked.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api");

  // The scheduler endpoint guards itself with CRON_SECRET — let external crons
  // reach it without the login cookie (and even during maintenance).
  if (pathname === "/api/cron") return NextResponse.next();

  // Kill switch: everything down except the maintenance page it rewrites to.
  if (process.env.MILESTER_ENABLED === "false" && pathname !== "/maintenance") {
    if (isApi) return NextResponse.json({ error: "Servicio en mantenimiento" }, { status: 503 });
    return NextResponse.rewrite(new URL("/maintenance", request.url));
  }

  // Always-public routes (the login screen and its endpoints).
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout") {
    return NextResponse.next();
  }

  // Tienda Nube sends the merchant back here after they authorize the app. It's
  // an inbound cross-site navigation, so it can't depend on our session cookie —
  // gating it makes the install fail with 401 before the code is ever exchanged.
  // Like /api/cron, this route guards itself: the OAuth `state` (CSRF) must match
  // the one we stored, and the code is only redeemable with our client secret.
  if (pathname === "/api/tiendanube/oauth/callback") return NextResponse.next();

  const password = process.env.MILESTER_PASSWORD;
  if (!password) return NextResponse.next(); // no password configured → gate disabled

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await authToken(password))) return NextResponse.next();

  // Not authenticated.
  if (isApi) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and public static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|theme-init.js|.*\\.svg$).*)"],
};
