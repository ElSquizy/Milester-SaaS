import { NextResponse } from "next/server";
import { getCalendarEvents } from "@/lib/agenda";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive) → eventos del rango para el
 * calendario, de TODAS las fuentes (tareas, campañas inicio/fin, lanzamientos/
 * notas manuales, feriados AR). La agregación vive en lib/agenda para reutilizarla
 * desde el Inicio.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  }
  const events = await getCalendarEvents(from, to);
  return NextResponse.json({ events });
}
