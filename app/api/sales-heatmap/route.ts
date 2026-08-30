import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET ?days=90 → ventas por día de semana (0=domingo … 6=sábado, %w AR) × hora
 * (0–23, AR), agregadas sobre los últimos N días. Alimenta el sombreado del
 * cruce "horarios vs. ventas" en la grilla de Horarios.
 *
 * Es un dato histórico que casi no cambia minuto a minuto, así que se cachea en
 * dos capas: en memoria del proceso (TTL 1h) para evitar re-consultar Turso, y
 * Cache-Control (5 min) para que visitas repetidas ni hagan el request.
 */
type CacheEntry = { at: number; body: { days: number; cells: unknown[] } };
const MEM_TTL_MS = 60 * 60 * 1000; // 1 hora
const cache = new Map<number, CacheEntry>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));

  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < MEM_TTL_MS) {
    return NextResponse.json(hit.body, { headers: { "x-cache": "hit", "Cache-Control": "private, max-age=300" } });
  }

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await prisma.$queryRaw<Array<{ wd: string; hr: string; orders: number | bigint; revenue: number }>>(Prisma.sql`
    SELECT strftime('%w', orderedAt, '-3 hours') AS wd,
           strftime('%H', orderedAt, '-3 hours') AS hr,
           COUNT(*) AS orders,
           CAST(COALESCE(SUM(total), 0) AS REAL) AS revenue
    FROM "Order"
    WHERE status <> 'cancelled'
      AND datetime(orderedAt) >= datetime(${from})
    GROUP BY wd, hr`);

  const cells = rows.map((r) => ({ weekday: Number(r.wd), hour: Number(r.hr), orders: Number(r.orders), revenue: r.revenue }));
  const body = { days, cells };
  cache.set(days, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { "x-cache": "miss", "Cache-Control": "private, max-age=300" } });
}
