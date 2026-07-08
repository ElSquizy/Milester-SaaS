import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/authToken";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.MILESTER_PASSWORD;

  if (!expected) return NextResponse.json({ error: "El acceso no está configurado en el servidor." }, { status: 500 });
  if (typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

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
