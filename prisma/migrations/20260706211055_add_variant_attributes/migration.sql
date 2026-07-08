-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "promotionalPrice" REAL,
    "originalPrice" REAL NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "imageUrl" TEXT,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "stock" INTEGER,
    "infiniteStock" BOOLEAN NOT NULL DEFAULT false,
    "attributes" TEXT NOT NULL DEFAULT '[]',
    "sku" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "pendingDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "lastSoldAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("categoryId", "categoryName", "createdAt", "description", "id", "imageUrl", "infiniteStock", "lastSoldAt", "lastSyncedAt", "name", "originalPrice", "pendingDelete", "price", "promotionalPrice", "published", "seoDescription", "seoTitle", "sku", "stock", "syncStatus", "tags", "tiendaNubeId", "unitsSold", "updatedAt") SELECT "categoryId", "categoryName", "createdAt", "description", "id", "imageUrl", "infiniteStock", "lastSoldAt", "lastSyncedAt", "name", "originalPrice", "pendingDelete", "price", "promotionalPrice", "published", "seoDescription", "seoTitle", "sku", "stock", "syncStatus", "tags", "tiendaNubeId", "unitsSold", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_tiendaNubeId_key" ON "Product"("tiendaNubeId");
CREATE TABLE "new_Variant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "tiendaNubeId" TEXT,
    "price" REAL NOT NULL,
    "promotionalPrice" REAL,
    "stock" INTEGER,
    "sku" TEXT,
    "values" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Variant" ("id", "price", "productId", "promotionalPrice", "sku", "stock", "tiendaNubeId") SELECT "id", "price", "productId", "promotionalPrice", "sku", "stock", "tiendaNubeId" FROM "Variant";
DROP TABLE "Variant";
ALTER TABLE "new_Variant" RENAME TO "Variant";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
