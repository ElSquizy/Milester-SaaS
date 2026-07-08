-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "lastChangeCheckAt" DATETIME;

-- CreateTable
CREATE TABLE "IncomingChange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tiendaNubeId" TEXT NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "localValue" TEXT,
    "remoteValue" TEXT,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingChange_tiendaNubeId_field_key" ON "IncomingChange"("tiendaNubeId", "field");
