-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TransformationItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "sourceProductId" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceVariantId" INTEGER,
    "variantLabel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "promotionalPrice" REAL,
    "stock" INTEGER,
    "sku" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "issues" TEXT NOT NULL DEFAULT '[]',
    "duplicateAction" TEXT,
    "targetProductId" INTEGER,
    "commonData" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "TransformationItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TransformationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TransformationItem" ("duplicateAction", "id", "issues", "jobId", "name", "price", "promotionalPrice", "sku", "sourceName", "sourceProductId", "sourceVariantId", "status", "stock", "targetProductId", "variantLabel") SELECT "duplicateAction", "id", "issues", "jobId", "name", "price", "promotionalPrice", "sku", "sourceName", "sourceProductId", "sourceVariantId", "status", "stock", "targetProductId", "variantLabel" FROM "TransformationItem";
DROP TABLE "TransformationItem";
ALTER TABLE "new_TransformationItem" RENAME TO "TransformationItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
