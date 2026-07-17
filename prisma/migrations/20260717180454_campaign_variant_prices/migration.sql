-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "originalPrice" REAL NOT NULL,
    "campaignPrice" REAL NOT NULL,
    "variantPrices" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "CampaignItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CampaignItem" ("campaignId", "campaignPrice", "id", "originalPrice", "productId") SELECT "campaignId", "campaignPrice", "id", "originalPrice", "productId" FROM "CampaignItem";
DROP TABLE "CampaignItem";
ALTER TABLE "new_CampaignItem" RENAME TO "CampaignItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
