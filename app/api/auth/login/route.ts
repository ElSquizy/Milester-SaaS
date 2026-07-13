import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/authToken";
import { rateLimit, rateLimitReset, clientIp } from "@/lib/rateLimit";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60_000; // 5 minutes

export async function POST(req: Request) {
  const key = `login:${clientIp(req)}`;
  const gate = rateLimit(key, MAX_ATTEMPTS, WINDOW_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.MILESTER_PASSWORD;

  if (!expected) return NextResponse.json({ error: "El acceso no está configurado en el servidor." }, { status: 500 });
  if (typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  rateLimitReset(key); // honest user succeeded — don't hold failed attempts against them
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  return res;
}
