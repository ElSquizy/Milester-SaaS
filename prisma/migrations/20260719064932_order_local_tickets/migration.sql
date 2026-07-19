-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "costUsd" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT,
    "number" INTEGER,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT,
    "customerName" TEXT,
    "customerId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'tiendanube',
    "orderedAt" DATETIME NOT NULL,
    "fulfillmentState" TEXT,
    "paymentReference" TEXT,
    "exchangeRate" REAL,
    "linkedOrderId" INTEGER,
    "subtotal" REAL,
    "discount" REAL,
    "shippingCost" REAL,
    "totalPaid" REAL,
    "currency" TEXT,
    "paymentMethod" TEXT,
    "shippingStatus" TEXT,
    "shippingMethod" TEXT,
    "shippingType" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippingCarrier" TEXT,
    "shippingAddress" TEXT,
    "paidAt" DATETIME,
    "shippedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "closedAt" DATETIME,
    "customerNote" TEXT,
    "ownerNote" TEXT,
    "channel" TEXT,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("cancelledAt", "channel", "closedAt", "completedAt", "createdAt", "currency", "customerId", "customerName", "customerNote", "discount", "id", "number", "orderedAt", "ownerNote", "paidAt", "paymentMethod", "paymentStatus", "rawData", "shippedAt", "shippingAddress", "shippingCarrier", "shippingCost", "shippingMethod", "shippingStatus", "shippingType", "source", "status", "subtotal", "tiendaNubeId", "total", "totalPaid", "trackingNumber", "trackingUrl") SELECT "cancelledAt", "channel", "closedAt", "completedAt", "createdAt", "currency", "customerId", "customerName", "customerNote", "discount", "id", "number", "orderedAt", "ownerNote", "paidAt", "paymentMethod", "paymentStatus", "rawData", "shippedAt", "shippingAddress", "shippingCarrier", "shippingCost", "shippingMethod", "shippingStatus", "shippingType", "source", "status", "subtotal", "tiendaNubeId", "total", "totalPaid", "trackingNumber", "trackingUrl" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_tiendaNubeId_key" ON "Order"("tiendaNubeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
