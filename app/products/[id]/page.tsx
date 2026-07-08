import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ProductForm from "@/components/ProductForm";
import DeleteProductButton from "@/components/DeleteProductButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, settings, changelog] = await Promise.all([
    prisma.product.findUnique({
      where: { id: Number(id) },
      include: { promotion: true, variants: true },
    }),
    prisma.settings.findFirst({ select: { anthropicApiKey: true } }),
    prisma.changelog.findMany({
      where: { productId: Number(id) },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/products" className="text-gray-400 hover:text-gray-600 text-sm">← Volver</Link>
          <h1 className="text-xl font-bold text-gray-900 truncate max-w-[400px]">{product.name}</h1>
        </div>
        <DeleteProductButton productId={product.id} />
      </div>

      <ProductForm
        hasAiKey={!!settings?.anthropicApiKey}
        initialData={{
          id: product.id,
          name: product.name,
          description: product.description || "",
          price: product.price,
          originalPrice: product.originalPrice,
          seoTitle: product.seoTitle || "",
          seoDescription: product.seoDescription || "",
          imageUrl: product.imageUrl,
          syncStatus: product.syncStatus,
          variants: product.variants,
          promotion: product.promotion
            ? {
                promoPrice: product.promotion.promoPrice,
                startDate: product.promotion.startDate.toISOString(),
                endDate: product.promotion.endDate.toISOString(),
                active: product.promotion.active,
              }
            : null,
        }}
      />

      {/* Historial de cambios */}
      {changelog.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Historial de cambios</h2>
          <div className="space-y-2">
            {changelog.map((log) => (
              <div key={log.id} className="flex items-center gap-3 text-xs text-gray-500">
                <span className="text-gray-300">
                  {new Date(log.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium text-gray-600">{log.field}</span>
                {log.oldValue && <span className="line-through text-gray-400">{log.oldValue.slice(0, 40)}</span>}
                {log.newValue && <span className="text-gray-700">→ {log.newValue.slice(0, 40)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
