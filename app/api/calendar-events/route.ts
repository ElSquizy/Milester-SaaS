import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** POST: crea un evento manual del calendario. Body { title, date: YYYY-MM-DD, type?, note? }. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  if (!title) return NextResponse.json({ error: "Poné un título" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const e = await prisma.calendarEvent.create({
    data: {
      title,
      date: new Date(`${date}T00:00:00.000Z`),
      type: body.type === "launch" ? "launch" : "note",
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    },
  });
  return NextResponse.json({ ...e, date: e.date.toISOString().slice(0, 10) });
}
