-- Stats denormalizadas del cliente (LTV, recencia, frecuencia).
ALTER TABLE "Customer" ADD COLUMN "totalSpent" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "orderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "lastOrderAt" DATETIME;
