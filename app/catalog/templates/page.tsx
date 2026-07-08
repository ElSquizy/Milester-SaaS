import { prisma } from "@/lib/prisma";
import TemplatesClient from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.descriptionTemplate.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, skeleton: true, fields: true, _count: { select: { products: true } } },
  });
  const list = templates.map((t) => ({ id: t.id, name: t.name, skeleton: t.skeleton, fields: t.fields, productCount: t._count.products }));
  return <TemplatesClient templates={list} />;
}
