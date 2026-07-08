-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT NOT NULL,
    "number" INTEGER,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT,
    "customerName" TEXT,
    "orderedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productTnId" TEXT,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "originalPrice" REAL NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "imageUrl" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "stock" INTEGER,
    "sku" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncedAt" DATETIME,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "lastSoldAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("categoryId", "categoryName", "createdAt", "description", "id", "imageUrl", "lastSyncedAt", "name", "originalPrice", "price", "published", "seoDescription", "seoTitle", "sku", "stock", "syncStatus", "tags", "tiendaNubeId", "updatedAt") SELECT "categoryId", "categoryName", "createdAt", "description", "id", "imageUrl", "lastSyncedAt", "name", "originalPrice", "price", "published", "seoDescription", "seoTitle", "sku", "stock", "syncStatus", "tags", "tiendaNubeId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_tiendaNubeId_key" ON "Product"("tiendaNubeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Order_tiendaNubeId_key" ON "Order"("tiendaNubeId");
