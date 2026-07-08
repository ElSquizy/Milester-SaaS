import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const PAGE = 60;

/**
 * GET: store-wide activity feed.
 *  - ?from=ISO&to=ISO → all entries within that range (used by the day calendar).
 *  - ?before=<id>     → the page of entries older than that id (load-more cursor).
 *  - (none)           → the most recent page.
 * Returns { pending, logs, hasMore }.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const before = url.searchParams.get("before");

  let where: Prisma.ChangelogWhereInput = {};
  let take = PAGE;
  const dayMode = !!(from && to);
  if (dayMode) {
    where = { createdAt: { gte: new Date(from!), lt: new Date(to!) } };
    take = 2000; // a full day's worth
  } else if (before) {
    where = { id: { lt: Number(before) } };
  }

  const [logs, pending] = await Promise.all([
    prisma.changelog.findMany({
      where,
      orderBy: { id: "desc" },
      take,
      include: { product: { select: { id: true, name: true, imageUrl: true, syncStatus: true, pendingDelete: true } } },
    }),
    prisma.product.count({ where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] } }),
  ]);

  return NextResponse.json({
    pending,
    hasMore: !dayMode && logs.length === take,
    logs: logs.map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.product.name,
      productImage: l.product.imageUrl,
      productSync: l.product.syncStatus,
      field: l.field,
      oldValue: l.oldValue,
      newValue: l.newValue,
      synced: l.synced,
      createdAt: l.createdAt,
    })),
  });
}
