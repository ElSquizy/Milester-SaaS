import { prisma } from "./prisma";
import { syncProductToTiendaNube } from "./tiendanube";

export async function checkAndApplyPromotions() {
  const now = new Date();

  const settings = await prisma.settings.findFirst();
  if (!settings?.storeId || !settings.accessToken) return { applied: [], reverted: [] };
  const { storeId, accessToken } = settings;

  const applied: number[] = [];
  const reverted: number[] = [];

  // Apply promotions that should be active
  const toApply = await prisma.promotion.findMany({
    where: {
      active: false,
      startDate: { lte: now },
      endDate: { gt: now },
    },
    include: { product: { include: { variants: true } } },
  });

  for (const promo of toApply) {
    try {
      const product = promo.product;
      await syncProductToTiendaNube(storeId, accessToken, {
        tiendaNubeId: product.tiendaNubeId,
        name: product.name,
        description: product.description,
        price: promo.promoPrice,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        variants: product.variants.map(({ values, ...v }) => { void values; return { ...v, price: promo.promoPrice }; }),
      });

      await prisma.promotion.update({
        where: { id: promo.id },
        data: { active: true, appliedAt: now },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { price: promo.promoPrice, syncStatus: "synced", lastSyncedAt: now },
      });
      applied.push(product.id);
    } catch {
      // continue with others
    }
  }

  // Revert promotions that have expired
  const toRevert = await prisma.promotion.findMany({
    where: {
      active: true,
      endDate: { lte: now },
    },
    include: { product: { include: { variants: true } } },
  });

  for (const promo of toRevert) {
    try {
      const product = promo.product;
      await syncProductToTiendaNube(storeId, accessToken, {
        tiendaNubeId: product.tiendaNubeId,
        name: product.name,
        description: product.description,
        price: product.originalPrice,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        variants: product.variants.map(({ values, ...v }) => { void values; return { ...v, price: product.originalPrice }; }),
      });

      await prisma.promotion.update({
        where: { id: promo.id },
        data: { active: false, revertedAt: now },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { price: product.originalPrice, syncStatus: "synced", lastSyncedAt: now },
      });
      reverted.push(product.id);
    } catch {
      // continue with others
    }
  }

  return { applied, reverted };
}
