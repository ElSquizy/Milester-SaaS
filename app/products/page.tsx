import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import ProductsToolbar from "@/components/ProductsToolbar";
import ProductsView from "@/components/ProductsView";
import Pagination from "@/components/Pagination";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string; status?: string; promo?: string; seo?: string; desc?: string; page?: string; edit?: string; view?: string;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1"));
  const q = sp.q?.trim() || "";

  const where: Prisma.ProductWhereInput = {
    ...(q ? { name: { contains: q } } : {}),
    ...(sp.status ? { syncStatus: sp.status } : {}),
    ...(sp.promo === "active" ? { promotion: { active: true } } : {}),
    ...(sp.promo === "scheduled" ? { promotion: { active: false } } : {}),
    ...(sp.promo === "none" ? { promotion: null } : {}),
    ...(sp.seo === "missing" ? { seoTitle: null } : {}),
    ...(sp.seo === "ok" ? { NOT: { seoTitle: null } } : {}),
    ...(sp.desc === "missing" ? { OR: [{ description: null }, { description: "" }] } : {}),
  };

  const editId = sp.edit ? Number(sp.edit) : null;

  const [products, total, editProduct, aiProviders] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { promotion: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    editId
      ? prisma.product.findUnique({
          where: { id: editId },
          include: { promotion: true, variants: true },
        })
      : null,
    prisma.aiProvider.findMany({ select: { id: true, name: true, provider: true } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = q || sp.status || sp.promo || sp.seo || sp.desc;

  const serializedProducts = products.map((p) => ({
    id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice,
    imageUrl: p.imageUrl, categoryName: p.categoryName, stock: p.stock,
    syncStatus: p.syncStatus, tiendaNubeId: p.tiendaNubeId, seoTitle: p.seoTitle,
    promotion: p.promotion
      ? { promoPrice: p.promotion.promoPrice, endDate: p.promotion.endDate.toISOString(), active: p.promotion.active }
      : null,
  }));

  const serializedEdit = editProduct
    ? {
        id: editProduct.id, name: editProduct.name, description: editProduct.description || "",
        price: editProduct.price, originalPrice: editProduct.originalPrice,
        seoTitle: editProduct.seoTitle || "", seoDescription: editProduct.seoDescription || "",
        imageUrl: editProduct.imageUrl, syncStatus: editProduct.syncStatus,
        variants: editProduct.variants.map((v) => ({
          id: v.id, tiendaNubeId: v.tiendaNubeId, price: v.price, stock: v.stock, sku: v.sku,
        })),
        promotion: editProduct.promotion
          ? {
              promoPrice: editProduct.promotion.promoPrice,
              startDate: editProduct.promotion.startDate.toISOString(),
              endDate: editProduct.promotion.endDate.toISOString(),
              active: editProduct.promotion.active,
            }
          : null,
      }
    : null;

  return (
    <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, color: "var(--color-ink)", margin: 0, letterSpacing: "-0.02em" }}>
            Productos
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", margin: "3px 0 0" }}>
            {total.toLocaleString("es-AR")} producto{total !== 1 ? "s" : ""}
            {hasFilters ? " (filtrado)" : ""}
          </p>
        </div>
        <Link
          href="/products/new"
          style={{ padding: "6px 14px", borderRadius: 8, background: "var(--color-brand)", color: "white", fontSize: "0.8125rem", fontWeight: 500, textDecoration: "none" }}
        >
          + Nuevo producto
        </Link>
      </div>

      <Suspense>
        <ProductsToolbar />
      </Suspense>

      <Suspense fallback={<div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>Cargando...</div>}>
        <ProductsView
          products={serializedProducts}
          editProduct={serializedEdit}
          aiProviders={aiProviders}
        />
      </Suspense>

      <Suspense>
        <Pagination page={page} totalPages={totalPages} />
      </Suspense>
    </div>
  );
}
