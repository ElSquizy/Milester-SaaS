import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOneProduct, deleteOneProduct } from "@/lib/sync";
import { getCreds } from "@/lib/creds";

// Tienda Nube rate-limits hard, and each product costs several calls (product +
// variants). Pace the queue so a long run doesn't get throttled into failures;
// the client also retries 429s on its own.
const GAP_MS = 350;
// One request handles a slice, then the client asks for the next. Keeps each run
// well inside the serverless time limit and spreads the load on Tienda Nube.
const BATCH_SIZE = 20;

export const maxDuration = 60;

/**
 * GET: stream one batch of the outbound sync.
 *  - default      → products with local changes (modified / staged deletion)
 *  - ?mode=errors → only products whose last push failed (retry queue)
 * Ends with { remaining }, so the caller can run the next batch until it's 0.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode");
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || BATCH_SIZE));
  const where = mode === "errors"
    ? { syncStatus: "error" }
    : { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] };

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const creds = await getCreds();
        if (!creds) {
          send({ status: "error", message: "Conectá tu tienda primero (Configuración)" });
          controller.close();
          return;
        }

        const queued = await prisma.product.count({ where });
        const pending = await prisma.product.findMany({
          where,
          select: { id: true, name: true, pendingDelete: true },
          orderBy: { updatedAt: "asc" },
          take: limit,
        });

        send({ status: "start", total: pending.length, queued });

        let done = 0;
        let errors = 0;
        // Per-product recap for the sidebar's post-sync summary card.
        const summary: Array<{ id: number; name: string; action: "created" | "updated" | "deleted"; fields: string[] }> = [];

        for (const [i, p] of pending.entries()) {
          if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS)); // stay under TN's rate limit
          send({ status: "syncing", id: p.id, name: p.name, done, total: pending.length });

          try {
            if (p.pendingDelete) {
              // Staged deletion: remove from TN, then locally.
              await deleteOneProduct(p.id, creds);
              summary.push({ id: p.id, name: p.name, action: "deleted", fields: [] });
            } else {
              // Mark as syncing so the UI can show the ⟳ state.
              await prisma.product.update({ where: { id: p.id }, data: { syncStatus: "syncing" } });
              const result = await syncOneProduct(p.id, creds);
              summary.push({ id: p.id, name: p.name, action: result.created ? "created" : "updated", fields: result.fields });
            }
            done++;
          } catch (err) {
            errors++;
            if (!p.pendingDelete) {
              await prisma.product.update({ where: { id: p.id }, data: { syncStatus: "error" } });
            }
            send({
              status: "item-error",
              id: p.id,
              name: p.name,
              message: err instanceof Error ? err.message : "Error",
            });
          }

          send({ status: "progress", done, errors, total: pending.length });
        }

        // What's still queued after this slice (errors are excluded from the
        // default queue, so a failing product can't loop forever).
        const remaining = await prisma.product.count({ where });
        send({ status: "done", done, errors, total: pending.length, remaining, summary });
      } catch (err) {
        send({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** POST: counts for the sidebar — products waiting to push, and those whose last push failed. */
export async function POST() {
  const [pending, errors] = await Promise.all([
    prisma.product.count({ where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] } }),
    prisma.product.count({ where: { syncStatus: "error" } }),
  ]);
  return NextResponse.json({ pending, errors });
}
