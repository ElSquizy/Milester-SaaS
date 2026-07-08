import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importProductsFromTiendaNube } from "@/lib/tiendanube";
import { syncCategoryTree } from "@/lib/categories";
import { upsertTnProducts, pruneDeletedProducts, type TNProduct } from "@/lib/catalogSync";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const settings = await prisma.settings.findFirst();
        if (!settings?.storeId || !settings.accessToken) {
          send({ error: "Conectá tu tienda primero (Configuración)" });
          controller.close();
          return;
        }

        send({ status: "fetching", message: "Importando colecciones..." });

        // Import the full category tree first so products can be linked to it.
        const categoryMap = await syncCategoryTree(settings.storeId, settings.accessToken);
        send({ status: "fetching", message: `${categoryMap.size} colecciones. Conectando productos...` });

        const tnProducts = (await importProductsFromTiendaNube(
          settings.storeId,
          settings.accessToken
        )) as TNProduct[];

        const total = tnProducts.length;
        send({ status: "fetching", message: `${total} productos encontrados. Importando...`, total });

        let lastSent = 0;
        const result = await upsertTnProducts(tnProducts, categoryMap, (r) => {
          const processed = r.created + r.updated + r.skipped;
          // Throttle SSE frames to avoid flooding the client on large catalogs.
          if (processed - lastSent >= 25 || processed === total) {
            lastSent = processed;
            send({ status: "progress", processed, total, created: r.created, updated: r.updated, skipped: r.skipped });
          }
        });

        // Reconcile deletions: remove local products no longer on Tienda Nube.
        send({ status: "fetching", message: "Detectando productos eliminados..." });
        const { deleted } = await pruneDeletedProducts(settings.storeId, settings.accessToken);

        // Mark the catalog baseline so subsequent pulls can go incremental.
        await prisma.settings.update({ where: { id: settings.id }, data: { lastCatalogSyncAt: new Date() } });

        send({ status: "done", total, deleted, ...result });
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

export async function POST() {
  const count = await prisma.product.count();
  return NextResponse.json({ count });
}
