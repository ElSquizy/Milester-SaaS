/*
  Warnings:

  - You are about to drop the `Promotion` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Promotion";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "Product_syncStatus_idx" ON "Product"("syncStatus");

-- CreateIndex
CREATE INDEX "Product_pendingDelete_idx" ON "Product"("pendingDelete");
