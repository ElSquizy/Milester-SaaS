import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncOneProduct, deleteOneProduct } from "@/lib/sync";
import { getCreds } from "@/lib/creds";

/** GET: stream a batch sync of all products with local changes (syncStatus = "modified"). */
export async function GET() {
  const encoder = new TextEncoder();

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

        const pending = await prisma.product.findMany({
          where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] },
          select: { id: true, name: true, pendingDelete: true },
          orderBy: { updatedAt: "asc" },
        });

        send({ status: "start", total: pending.length });

        let done = 0;
        let errors = 0;

        for (const p of pending) {
          send({ status: "syncing", id: p.id, name: p.name, done, total: pending.length });

          try {
            if (p.pendingDelete) {
              // Staged deletion: remove from TN, then locally.
              await deleteOneProduct(p.id, creds);
            } else {
              // Mark as syncing so the UI can show the ⟳ state.
              await prisma.product.update({ where: { id: p.id }, data: { syncStatus: "syncing" } });
              await syncOneProduct(p.id, creds);
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

        send({ status: "done", done, errors, total: pending.length });
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

/** POST: return the current count of pending products (modified/new or staged for deletion). */
export async function POST() {
  const count = await prisma.product.count({ where: { OR: [{ syncStatus: "modified" }, { pendingDelete: true }] } });
  return NextResponse.json({ pending: count });
}
