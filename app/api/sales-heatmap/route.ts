import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET ?days=90 → ventas por día de semana (0=domingo … 6=sábado, %w AR) × hora
 * (0–23, AR), agregadas sobre los últimos N días. Alimenta el sombreado del
 * cruce "horarios vs. ventas" en la grilla de Horarios.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
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
  return NextResponse.json({ days, cells });
}
