import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CampaignsClient from "./CampaignsClient";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const settings = await prisma.settings.findFirst();
  if (!settings) redirect("/settings");

  const [campaigns, categories, pendingCount] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    // Full collection list (same source as the catalog filter), so the scope
    // picker can surgically target any of the store's categories.
    prisma.category.findMany({
      where: { products: { some: {} } },
      select: { name: true, tiendaNubeId: true, parentTnId: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.count({ where: { syncStatus: "modified" } }),
  ]);

  const categoryList = [...new Set(categories.map((c) => c.name))].filter(Boolean);
  const categoryTree = categories.filter((c) => c.name).map((c) => ({ name: c.name, tnId: c.tiendaNubeId, parentTnId: c.parentTnId }));

  return (
    <CampaignsClient
      campaigns={campaigns as unknown as Campaign[]}
      categories={categoryList}
      categoryTree={categoryTree}
      pendingCount={pendingCount}
    />
  );
}

export type Campaign = {
  id: number;
  name: string;
  status: string;
  mode: string; // "prices" (clásico) | "costs" (tabla de franjas)
  discountType: string;
  discountValue: number;
  addTag: string | null;
  scope: string;
  scopeValue: string | null;
  startDate: string | null;
  endDate: string | null;
  appliedAt: string | null;
  endedAt: string | null;
  _count: { items: number };
};
