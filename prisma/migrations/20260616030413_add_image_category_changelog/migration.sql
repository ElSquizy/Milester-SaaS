-- AlterTable
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Product" ADD COLUMN "categoryName" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "stock" INTEGER;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "anthropicApiKey" TEXT;

-- CreateTable
CREATE TABLE "Changelog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Changelog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
