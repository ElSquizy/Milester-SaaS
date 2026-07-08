-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mergedIntoId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT NOT NULL,
    "number" INTEGER,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT,
    "customerName" TEXT,
    "customerId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'tiendanube',
    "orderedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "customerName", "id", "number", "orderedAt", "paymentStatus", "status", "tiendaNubeId", "total") SELECT "createdAt", "customerName", "id", "number", "orderedAt", "paymentStatus", "status", "tiendaNubeId", "total" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_tiendaNubeId_key" ON "Order"("tiendaNubeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tiendaNubeId_key" ON "Customer"("tiendaNubeId");
