-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImageTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "backgroundUrl" TEXT NOT NULL,
    "coverUrl" TEXT NOT NULL,
    "shadowOffsetX" INTEGER NOT NULL DEFAULT -6,
    "shadowOffsetY" INTEGER NOT NULL DEFAULT 18,
    "shadowBlur" INTEGER NOT NULL DEFAULT 20,
    "shadowOpacity" REAL NOT NULL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ImageTemplate" ("backgroundUrl", "coverUrl", "createdAt", "id", "name", "updatedAt") SELECT "backgroundUrl", "coverUrl", "createdAt", "id", "name", "updatedAt" FROM "ImageTemplate";
DROP TABLE "ImageTemplate";
ALTER TABLE "new_ImageTemplate" RENAME TO "ImageTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
