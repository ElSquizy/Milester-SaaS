-- CreateTable
CREATE TABLE "TransformationJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "nameRule" TEXT NOT NULL,
    "confirmedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TransformationItem" (
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
    CONSTRAINT "TransformationItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TransformationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
