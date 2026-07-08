import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CollectionsClient from "./CollectionsClient";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const cats = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  const list = cats.map((c) => ({
    id: c.id,
    tiendaNubeId: c.tiendaNubeId,
    name: c.name,
    parentTnId: c.parentTnId,
    count: c._count.products,
  }));

  return <CollectionsClient categories={list} />;
}
