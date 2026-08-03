import { prisma } from "@/lib/prisma";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, imageTemplates, productTemplates, messageTemplates, categories] = await Promise.all([
    prisma.descriptionTemplate.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, skeleton: true, fields: true, _count: { select: { products: true } } },
    }),
    prisma.imageTemplate.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, backgroundUrl: true, coverUrl: true, productX: true, productY: true, productW: true, productH: true, shadowOffsetX: true, shadowOffsetY: true, shadowBlur: true, shadowOpacity: true, _count: { select: { products: true } } },
    }),
    prisma.productTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.messageTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ select: { name: true, tiendaNubeId: true, parentTnId: true }, orderBy: { name: "asc" } }),
  ]);
  const list = templates.map((t) => ({ id: t.id, name: t.name, skeleton: t.skeleton, fields: t.fields, productCount: t._count.products }));
  const imgList = imageTemplates.map((t) => ({ id: t.id, name: t.name, backgroundUrl: t.backgroundUrl, coverUrl: t.coverUrl, productX: t.productX, productY: t.productY, productW: t.productW, productH: t.productH, shadowOffsetX: t.shadowOffsetX, shadowOffsetY: t.shadowOffsetY, shadowBlur: t.shadowBlur, shadowOpacity: t.shadowOpacity, productCount: t._count.products }));
  const categoryList = [...new Set(categories.map((c) => c.name))].filter(Boolean);
  const categoryTree = categories.filter((c) => c.name).map((c) => ({ name: c.name, tnId: c.tiendaNubeId, parentTnId: c.parentTnId }));
  return <TemplatesClient templates={list} imageTemplates={imgList} productTemplates={productTemplates} messageTemplates={messageTemplates} categories={categoryList} categoryTree={categoryTree} />;
}
