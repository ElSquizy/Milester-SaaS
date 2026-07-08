-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Changelog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Changelog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Changelog" ("createdAt", "field", "id", "newValue", "oldValue", "productId") SELECT "createdAt", "field", "id", "newValue", "oldValue", "productId" FROM "Changelog";
DROP TABLE "Changelog";
ALTER TABLE "new_Changelog" RENAME TO "Changelog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
